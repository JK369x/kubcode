// Explicit, versioned, idempotent migrations. Only the operator script and the
// integration tests call this; requests and deploys never do. There is
// intentionally no automated down/rollback path.
//
// Transaction-pooler safe (Supabase Supavisor/PgBouncer transaction mode): all
// pending migrations, the ledger bootstrap, the checksum check and a final
// private-schema check run in ONE transaction bounded by SET LOCAL timeouts
// and serialized by pg_advisory_xact_lock, which is released by COMMIT or
// ROLLBACK. No session-level state (session advisory lock, SET) is used. On any
// failure the transaction is rolled back and the client is discarded.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";

export const MIGRATIONS_DIR = join(__dirname, "..", "..", "db", "migrations");
// Arbitrary fixed 64-bit key for pg_advisory_xact_lock; unique to this app.
export const MIGRATION_LOCK_KEY = "4719032250418172301";
export const MIGRATION_LOCK_TIMEOUT = "15s";
export const MIGRATION_STATEMENT_TIMEOUT = "60s";

export type Migration = { version: string; sql: string; checksum: string };

export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name), "utf8");
      return {
        version: name.replace(/\.sql$/, ""),
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
}

export class MigrationChecksumError extends Error {
  constructor(readonly version: string) {
    super(`MIGRATION_CHECKSUM_MISMATCH ${version}`);
  }
}

// The private schema is reachable by PUBLIC/anon/authenticated, or a table in
// it lacks row level security. Nothing is committed when this is thrown.
export class MigrationSecurityError extends Error {
  constructor() {
    super("MIGRATION_PRIVATE_SCHEMA_EXPOSED");
  }
}

const BOOTSTRAP = `
  CREATE SCHEMA IF NOT EXISTS kubcode_accounts;
  REVOKE ALL ON SCHEMA kubcode_accounts FROM PUBLIC;
  CREATE TABLE IF NOT EXISTS kubcode_accounts.schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
  REVOKE ALL ON kubcode_accounts.schema_migrations FROM PUBLIC`;

// Counts every way the private schema is exposed: a table without RLS, or any
// schema/table/sequence privilege held by PUBLIC or a Supabase API role. The
// privilege functions sit inside CASE so the planner can never call them on a
// relation of the wrong kind (has_sequence_privilege errors on non-sequences).
const EXPOSURE_CHECK = `
  WITH api AS (
    SELECT 'public'::name AS r
    UNION ALL SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  ), rel AS (
    SELECT c.oid, c.relkind, c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'kubcode_accounts'
  )
  SELECT (SELECT count(*) FROM rel WHERE relkind IN ('r', 'p') AND NOT relrowsecurity)
       + (SELECT count(*) FROM api WHERE has_schema_privilege(r, 'kubcode_accounts', 'USAGE')
                                      OR has_schema_privilege(r, 'kubcode_accounts', 'CREATE'))
       + (SELECT count(*) FROM api, rel WHERE CASE
            WHEN relkind IN ('r', 'p', 'v', 'm')
              THEN has_table_privilege(r, rel.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            WHEN relkind = 'S' THEN has_sequence_privilege(r, rel.oid, 'USAGE, SELECT, UPDATE')
            ELSE false END) AS exposed`;

export async function migrate(pool: Pool, migrations: Migration[] = loadMigrations()): Promise<{ applied: string[] }> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(
      `BEGIN; SET LOCAL lock_timeout = '${MIGRATION_LOCK_TIMEOUT}'; ` +
        `SET LOCAL statement_timeout = '${MIGRATION_STATEMENT_TIMEOUT}'`,
    );
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [MIGRATION_LOCK_KEY]);
    await client.query(BOOTSTRAP);
    const done = new Map<string, string>(
      (
        await client.query<{ version: string; checksum: string }>(
          "SELECT version, checksum FROM kubcode_accounts.schema_migrations",
        )
      ).rows.map((r) => [r.version, r.checksum]),
    );
    // Verify every applied checksum before applying anything new.
    for (const m of migrations) {
      const existing = done.get(m.version);
      if (existing !== undefined && existing !== m.checksum) throw new MigrationChecksumError(m.version);
    }
    for (const m of migrations) {
      if (done.has(m.version)) continue;
      await client.query(m.sql);
      await client.query("INSERT INTO kubcode_accounts.schema_migrations (version, checksum) VALUES ($1, $2)", [
        m.version,
        m.checksum,
      ]);
      applied.push(m.version);
    }
    const { rows } = await client.query<{ exposed: string }>(EXPOSURE_CHECK);
    if (Number(rows[0].exposed) !== 0) throw new MigrationSecurityError();
    await client.query("COMMIT");
  } catch (error) {
    // Roll back if possible, then always discard this connection: its state
    // after a failed migration is not worth trusting in a shared pool.
    await client.query("ROLLBACK").catch(() => undefined);
    client.release(true);
    throw error;
  }
  client.release();
  return { applied };
}
