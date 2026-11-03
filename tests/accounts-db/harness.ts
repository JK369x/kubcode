// Throwaway-database harness for real-PostgreSQL integration suites.
// FAILS (never skips) unless KUBCODE_TEST_DATABASE_URL is a loopback URL whose
// database name contains "test". Creates kc_it_<random>_test, applies every
// migration, and drops exactly that database in cleanup().
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { createPool, pgErrorCode } from "../../lib/accounts/db";
import { migrate } from "../../lib/accounts/migrate";

const URL_VAR = "KUBCODE_TEST_DATABASE_URL";
const DB_NAME_SHAPE = /^kc_it_[0-9a-f]{12}_test$/;
const NO_ENV = {};

function testDatabaseUrl(): URL {
  const raw = process.env[URL_VAR];
  if (!raw) assert.fail(`${URL_VAR} is not set; integration suite cannot run (this is a failure, not a skip)`);
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) assert.fail(`${URL_VAR} must point at a local host`);
  if (!/test/i.test(url.pathname)) assert.fail(`${URL_VAR} database name must contain "test"`);
  return url;
}

export type ThrowawayDb = {
  /** Schema-owner pool (fixtures, raw checks). */
  pool: Pool;
  /** Every query runs as the runtime role kubcode_app: grants + RLS apply. */
  appPool: Pool;
  cleanup: () => Promise<void>;
};

const GRANT_FILES = ["db/runtime-role-grants.sql", "db/runtime-role-grants-0002.sql"];

export async function throwawayDb(): Promise<ThrowawayDb> {
  const base = testDatabaseUrl();
  const dbName = `kc_it_${randomBytes(6).toString("hex")}_test`;
  const admin = createPool(base.href, { max: 1 }, NO_ENV);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const createdRoles: string[] = [];
  for (const role of ["anon", "authenticated"]) {
    if ((await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount) continue;
    try {
      await admin.query(`CREATE ROLE ${role} NOLOGIN`);
      createdRoles.push(role);
    } catch (error) {
      if (pgErrorCode(error) !== "42710") throw error;
    }
  }
  const own = new URL(base.href);
  own.pathname = `/${dbName}`;
  const pool = createPool(own.href, { max: 12 }, NO_ENV);
  // Supabase-style default privileges, so the migrations must revoke them.
  await pool.query(`
    ALTER DEFAULT PRIVILEGES GRANT USAGE, CREATE ON SCHEMAS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO anon, authenticated;`);
  await migrate(pool);
  if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app'")).rowCount) {
    await admin.query("CREATE ROLE kubcode_app NOLOGIN");
    createdRoles.push("kubcode_app");
  }
  for (const file of GRANT_FILES) await pool.query(readFileSync(file, "utf8"));
  const appPool = createPool(own.href, { max: 12, options: "-c role=kubcode_app" }, NO_ENV);
  return {
    pool,
    appPool,
    async cleanup() {
      await appPool.end();
      await pool.end();
      assert.match(dbName, DB_NAME_SHAPE);
      for (let i = 0; i < 50; i++) {
        const { rows } = await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname = $1", [dbName]);
        if (Number(rows[0].n) === 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      for (const role of createdRoles) {
        // Grants on other throwaway databases may still reference the role.
        await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
      }
      await admin.end();
    },
  };
}
