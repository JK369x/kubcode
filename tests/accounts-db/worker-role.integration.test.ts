// 0004 creates the Lambda role kubcode_worker itself (NOLOGIN), so production
// never depends on an operator creating it first; the operator only adds
// LOGIN + password later (step 4/5). Roles are cluster-wide, so this suite
// uses its own throwaway databases and runs after the others have dropped theirs.
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { createPool } from "../../lib/accounts/db";
import { migrate } from "../../lib/accounts/migrate";

const URL_VAR = "KUBCODE_TEST_DATABASE_URL";
const NO_ENV = {};
let admin: Pool;
const created: Array<{ name: string; pool: Pool }> = [];

function baseUrl(): URL {
  const raw = process.env[URL_VAR];
  if (!raw) assert.fail(`${URL_VAR} is not set; integration suite cannot run (this is a failure, not a skip)`);
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) assert.fail(`${URL_VAR} must point at a local host`);
  if (!/test/i.test(url.pathname)) assert.fail(`${URL_VAR} database name must contain "test"`);
  return url;
}

/** A fresh database with every migration applied by the schema owner. */
async function migratedDb(): Promise<Pool> {
  const name = `kc_it_${randomBytes(6).toString("hex")}_test`;
  await admin.query(`CREATE DATABASE ${name}`);
  const url = baseUrl();
  url.pathname = `/${name}`;
  const pool = createPool(url.href, { max: 2 }, NO_ENV);
  created.push({ name, pool });
  await migrate(pool);
  return pool;
}

const role = async () =>
  (await admin.query<{ rolcanlogin: boolean }>("SELECT rolcanlogin FROM pg_roles WHERE rolname = 'kubcode_worker'")).rows[0];

before(async () => {
  admin = createPool(baseUrl().href, { max: 1 }, NO_ENV);
});
after(async () => {
  for (const db of created) {
    await db.pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${db.name} WITH (FORCE)`);
  }
  await admin.end();
});

test("with no kubcode_worker role, 0004 creates it NOLOGIN and its grants apply", async () => {
  // Earlier suites' databases are gone, so nothing references the role.
  await admin.query("DROP ROLE IF EXISTS kubcode_worker");
  assert.equal(await role(), undefined, "role absent before migrating");
  const pool = await migratedDb();
  const r = await role();
  assert.ok(r, "migration created the role");
  assert.equal(r.rolcanlogin, false, "no login until the operator sets a password");
  const grants = await pool.query<{ ok: boolean }>(
    `SELECT has_table_privilege('kubcode_worker', 'kubcode_accounts.user_secrets', 'SELECT')
        AND has_table_privilege('kubcode_worker', 'kubcode_accounts.connect_request_nonces', 'INSERT')
        AND has_column_privilege('kubcode_worker', 'kubcode_accounts.oauth_connections', 'envelope', 'UPDATE') AS ok`,
  );
  assert.equal(grants.rows[0].ok, true, "worker grants present");
  const policies = await pool.query("SELECT 1 FROM pg_policies WHERE policyname = 'kubcode_worker_access'");
  assert.equal(policies.rowCount, 5, "one worker policy per settings table");
});

test("with the role already present (operator gave it LOGIN), 0004 leaves the role alone", async () => {
  if (!(await role())) await admin.query("CREATE ROLE kubcode_worker NOLOGIN");
  await admin.query("ALTER ROLE kubcode_worker LOGIN");
  try {
    const pool = await migratedDb();
    assert.equal((await role())!.rolcanlogin, true, "migration did not reset LOGIN");
    const grants = await pool.query<{ ok: boolean }>(
      "SELECT has_table_privilege('kubcode_worker', 'kubcode_accounts.user_secrets', 'SELECT') AS ok",
    );
    assert.equal(grants.rows[0].ok, true);
  } finally {
    await admin.query("ALTER ROLE kubcode_worker NOLOGIN");
  }
});
