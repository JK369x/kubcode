// Real-PostgreSQL tests for 0005_owner_flag: it grants is_owner to the site
// owner's account only when that is safe, and otherwise changes nothing.
// The migration already ran (as a no-op) when the harness migrated the empty
// database, so each test seeds a state and re-runs the file's SQL directly.
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { throwawayDb, type ThrowawayDb } from "./harness";

const TARGET = "d1ce43fa-2a4e-4f4a-9755-f5d8deb595c4";
const SQL = readFileSync("db/migrations/0005_owner_flag.sql", "utf8");

let db: ThrowawayDb;
let pool: Pool;

before(async () => {
  db = await throwawayDb();
  pool = db.pool;
});
after(async () => db?.cleanup());

beforeEach(async () => {
  await pool.query("DELETE FROM kubcode_accounts.account_audit_events");
  await pool.query("DELETE FROM kubcode_accounts.user_identities");
  await pool.query("DELETE FROM kubcode_accounts.users");
});

async function user(id: string | null, opts: { google?: boolean; line?: boolean; owner?: boolean; status?: string } = {}) {
  const { rows } = await pool.query(
    "INSERT INTO kubcode_accounts.users (id, status, is_owner) VALUES (coalesce($1::uuid, gen_random_uuid()), $2, $3) RETURNING id",
    [id, opts.status ?? "active", opts.owner ?? false],
  );
  const uid: string = rows[0].id;
  if (opts.google ?? true)
    await pool.query(
      "INSERT INTO kubcode_accounts.user_identities (user_id, provider, subject) VALUES ($1, 'google', $2)",
      [uid, `g-${uid}`],
    );
  if (opts.line)
    await pool.query("INSERT INTO kubcode_accounts.user_identities (user_id, provider, subject) VALUES ($1, 'line', $2)", [
      uid,
      `l-${uid}`,
    ]);
  return uid;
}

async function owners(): Promise<string[]> {
  const { rows } = await pool.query("SELECT id FROM kubcode_accounts.users WHERE is_owner ORDER BY id");
  return rows.map((r) => r.id);
}

async function grants(): Promise<number> {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM kubcode_accounts.account_audit_events WHERE event = 'operator_owner_granted' AND user_id = $1",
    [TARGET],
  );
  return rows[0].n;
}

test("0005 is listed and recorded as applied", async () => {
  const { rows } = await pool.query("SELECT 1 FROM kubcode_accounts.schema_migrations WHERE version = '0005_owner_flag'");
  assert.equal(rows.length, 1);
});

test("an active Google-linked target becomes the owner, with one audit row", async () => {
  await user(TARGET);
  await user(null); // other members are untouched
  await pool.query(SQL);
  assert.deepEqual(await owners(), [TARGET]);
  assert.equal(await grants(), 1);
});

test("running it again changes nothing", async () => {
  await user(TARGET);
  await pool.query(SQL);
  await pool.query(SQL);
  assert.deepEqual(await owners(), [TARGET]);
  assert.equal(await grants(), 1);
});

test("a different existing owner is left alone and the target is not promoted", async () => {
  const other = await user(null, { owner: true });
  await user(TARGET);
  await pool.query(SQL);
  assert.deepEqual(await owners(), [other]);
  assert.equal(await grants(), 0);
});

test("a missing, suspended or LINE-only target is not promoted", async () => {
  await pool.query(SQL);
  assert.deepEqual(await owners(), []);

  await user(TARGET, { status: "suspended" });
  await pool.query(SQL);
  assert.deepEqual(await owners(), []);

  await pool.query("DELETE FROM kubcode_accounts.user_identities");
  await pool.query("DELETE FROM kubcode_accounts.users");
  await user(TARGET, { google: false, line: true });
  await pool.query(SQL);
  assert.deepEqual(await owners(), []);
  assert.equal(await grants(), 0);
});
