// Real-PostgreSQL tests for migration 0003 (settings keys) and the key store.
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
// Design: docs/design/settings-keys.md §4 (data model, RLS, column grants).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { pgErrorCode } from "../../lib/accounts/db";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { secretAad } from "../../lib/keys/envelope";
import { createPgKeyStore, type KeyStore } from "../../lib/keys/store";
import { openForTest, TEST_PUBLIC_KEY } from "../fixtures/envelope/open";
import { throwawayDb, type ThrowawayDb } from "./harness";

let db: ThrowawayDb;
let pool: Pool;
let store: KeyStore;
let seq = 0;

before(async () => {
  db = await throwawayDb();
  pool = db.pool;
  // The store under test runs as the runtime role, like production.
  store = createPgKeyStore(db.appPool, { slot: 1, publicKeyPem: TEST_PUBLIC_KEY });
});
after(async () => db?.cleanup());

const S = "kubcode_accounts";
const TABLES = ["user_secrets", "oauth_connections", "oauth_connect_intents", "connect_request_nonces", "secret_audit_events"];
const GOOGLE_CLIENT_ID = "123456789012-fixtureonlyabc.apps.googleusercontent.com";
const GOOGLE_SECRET = "FIXTURE-ONLY-google-secret-0000ab12";
const IG_APP_ID = "1234567890123456";
const IG_SECRET = "fixtureonly0000000000000000003c4d";
const ELEVEN_KEY = "sk_fixture_only_000000000000000000000000000000009z8y";
const hash32 = () => randomBytes(32);

/** A fictional signed-in member; owners are the only phase-1 key users. */
async function member(opts: { owner?: boolean } = {}): Promise<SessionClaims> {
  const n = ++seq;
  const accounts = createPgAccountStore(pool);
  const profile = { provider: "google" as const, subject: `g-keys-${n}`, displayName: `Keys ${n}`, email: `keys${n}@example.test` };
  const r = await accounts.resolveLogin(profile);
  if (r.status !== "ok") throw new Error("login failed");
  await pool.query(`UPDATE ${S}.users SET is_owner = $2 WHERE id = $1`, [r.userId, opts.owner ?? true]);
  return sessionClaims(
    accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email }),
  );
}

/** Runs one query as a role inside a transaction, optionally scoped to a user. */
async function as(rolePool: Pool, uid: string | null, sql: string, params: unknown[] = []) {
  const c = await rolePool.connect();
  try {
    await c.query("BEGIN");
    if (uid) await c.query("SELECT set_config('kubcode.user_id', $1, true)", [uid]);
    const r = await c.query(sql, params);
    await c.query("COMMIT");
    return r;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

const rejectsWith = (p: Promise<unknown>, code: string) => assert.rejects(p, (e) => pgErrorCode(e) === code);

/** Owner-inserted fixture rows (the schema owner bypasses RLS). */
async function fixtureSecret(uid: string, kind = "elevenlabs_api_key") {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO ${S}.user_secrets (id, user_id, kind, envelope, key_slot, hint) VALUES ($1, $2, $3, $4, 1, 'wxyz')`,
    [id, uid, kind, randomBytes(64)],
  );
  return id;
}
async function fixtureConnection(uid: string, provider = "youtube", external = `ext-${++seq}`) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO ${S}.oauth_connections (id, user_id, provider, external_account_id, account_label, app_secret_version, envelope, key_slot)
     VALUES ($1, $2, $3, $4, 'Fixture channel', 1, $5, 1)`,
    [id, uid, provider, external, randomBytes(64)],
  );
  return id;
}
async function fixtureIntent(uid: string, extra: { phase?: string; status?: string; verifier?: Buffer | null } = {}) {
  const closed = (extra.phase ?? "await_callback") === "closed";
  return pool.query(
    `INSERT INTO ${S}.oauth_connect_intents
       (user_id, provider, state_hash, cookie_hash, session_binding_hash, verifier_envelope, key_slot, phase, status, expires_at, closed_at)
     VALUES ($1, 'youtube', $2, $3, $4, $5, $6, $7, $8, now() + interval '10 minutes', $9)`,
    [
      uid,
      hash32(),
      hash32(),
      hash32(),
      extra.verifier === undefined ? randomBytes(64) : extra.verifier,
      extra.verifier === null ? null : 1,
      extra.phase ?? "await_callback",
      extra.status ?? "open",
      closed ? new Date() : null,
    ],
  );
}

// ------------------------------------------------------------ schema

test("0003 adds the five settings tables, RLS on, nothing for PUBLIC or API roles", async () => {
  const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean }>(
    `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = ANY($2)`,
    [S, TABLES],
  );
  assert.deepEqual(rows.map((r) => r.relname).sort(), [...TABLES].sort());
  assert.ok(rows.every((r) => r.relrowsecurity), "RLS on every new table");
  for (const role of ["public", "anon", "authenticated"])
    for (const t of TABLES) {
      const r = await pool.query<{ ok: boolean }>(
        "SELECT has_table_privilege($1::name, $2, 'SELECT, INSERT, UPDATE, DELETE') AS ok",
        [role, `${S}.${t}`],
      );
      assert.equal(r.rows[0].ok, false, `${role} on ${t}`);
    }
});

test("CHECK constraints reject malformed rows", async () => {
  const a = await member();
  const bad = (sql: string, params: unknown[]) => rejectsWith(pool.query(sql, params), "23514");
  await bad(`INSERT INTO ${S}.user_secrets (user_id, kind, envelope, key_slot) VALUES ($1, 'Bad-Kind', '\\x00', 1)`, [a.uid]);
  await bad(`INSERT INTO ${S}.user_secrets (user_id, kind, envelope, key_slot, hint) VALUES ($1, 'elevenlabs_api_key', '\\x00', 1, 'abcde')`, [a.uid]);
  await bad(
    `INSERT INTO ${S}.oauth_connections (user_id, provider, external_account_id, app_secret_version, envelope, key_slot) VALUES ($1, 'tiktok', 'x', 1, '\\x00', 1)`,
    [a.uid],
  );
  const conn = await fixtureConnection(a.uid);
  await bad(`UPDATE ${S}.oauth_connections SET status = 'broken' WHERE id = $1`, [conn]);
  await bad(`UPDATE ${S}.oauth_connections SET last_error_code = 'Provider said: no' WHERE id = $1`, [conn]);
  await bad(`INSERT INTO ${S}.connect_request_nonces (nonce_hash) VALUES ($1)`, [randomBytes(31)]);
  await bad(`INSERT INTO ${S}.secret_audit_events (user_id, event, actor) VALUES ($1, 'Secret Saved', 'user')`, [a.uid]);
  await bad(`INSERT INTO ${S}.secret_audit_events (user_id, event, actor) VALUES ($1, 'secret_saved', 'robot')`, [a.uid]);
});

test("one open connect intent per user; closed intents must have the verifier wiped", async () => {
  const a = await member();
  await fixtureIntent(a.uid);
  await rejectsWith(fixtureIntent(a.uid), "23505");
  await rejectsWith(fixtureIntent(a.uid, { phase: "closed", status: "failed" }), "23514");
  await fixtureIntent(a.uid, { phase: "closed", status: "failed", verifier: null });
  // phase and status must agree: an open status cannot be closed.
  await rejectsWith(fixtureIntent(a.uid, { phase: "closed", status: "open", verifier: null }), "23514");
});

// ------------------------------------------------------------ kubcode_app

test("kubcode_app is scoped to one user by kubcode.user_id; unset means no rows", async () => {
  const a = await member();
  const b = await member();
  const secretA = await fixtureSecret(a.uid);
  const secretB = await fixtureSecret(b.uid);
  const read = (uid: string | null) => as(db.appPool, uid, `SELECT id FROM ${S}.user_secrets ORDER BY id`);
  assert.equal((await read(null)).rowCount, 0, "no setting, no rows");
  assert.deepEqual((await read(a.uid)).rows.map((r) => r.id), [secretA]);
  assert.deepEqual((await read(b.uid)).rows.map((r) => r.id), [secretB]);
  // Writes to another user's row touch nothing; inserting for them fails WITH CHECK.
  assert.equal((await as(db.appPool, a.uid, `UPDATE ${S}.user_secrets SET hint = 'zzzz' WHERE id = $1`, [secretB])).rowCount, 0);
  assert.equal((await as(db.appPool, a.uid, `DELETE FROM ${S}.user_secrets WHERE id = $1`, [secretB])).rowCount, 0);
  await rejectsWith(
    as(db.appPool, a.uid, `INSERT INTO ${S}.user_secrets (user_id, kind, envelope, key_slot) VALUES ($1, 'elevenlabs_api_key', '\\x00', 1)`, [b.uid]),
    "42501",
  );
  const connB = await fixtureConnection(b.uid);
  assert.equal((await as(db.appPool, a.uid, `SELECT id FROM ${S}.oauth_connections WHERE id = $1`, [connB])).rowCount, 0);
});

test("kubcode_app can never read ciphertext columns or the nonce table, nor rewrite audit", async () => {
  const a = await member();
  await fixtureSecret(a.uid);
  await fixtureConnection(a.uid);
  await fixtureIntent(a.uid);
  await rejectsWith(as(db.appPool, a.uid, `SELECT envelope FROM ${S}.user_secrets`), "42501");
  await rejectsWith(as(db.appPool, a.uid, `SELECT * FROM ${S}.user_secrets`), "42501");
  await rejectsWith(as(db.appPool, a.uid, `SELECT envelope FROM ${S}.oauth_connections`), "42501");
  await rejectsWith(as(db.appPool, a.uid, `SELECT verifier_envelope FROM ${S}.oauth_connect_intents`), "42501");
  await rejectsWith(as(db.appPool, a.uid, `SELECT 1 FROM ${S}.connect_request_nonces`), "42501");
  await rejectsWith(as(db.appPool, a.uid, `INSERT INTO ${S}.connect_request_nonces (nonce_hash) VALUES ($1)`, [hash32()]), "42501");
  // Metadata is readable.
  const meta = await as(db.appPool, a.uid, `SELECT id, kind, hint, version FROM ${S}.user_secrets`);
  assert.equal(meta.rowCount, 1);
  // Audit: insert and read own rows, never update or delete.
  await as(db.appPool, a.uid, `INSERT INTO ${S}.secret_audit_events (user_id, event, subject, actor) VALUES ($1, 'secret_saved', 'elevenlabs_api_key', 'user')`, [a.uid]);
  await rejectsWith(as(db.appPool, a.uid, `DELETE FROM ${S}.secret_audit_events`), "42501");
  await rejectsWith(as(db.appPool, a.uid, `UPDATE ${S}.secret_audit_events SET event = 'secret_used'`), "42501");
});

// ------------------------------------------------------------ kubcode_worker

test("kubcode_worker reads envelopes across users, writes connections, audit and nonces", async () => {
  const a = await member();
  const b = await member();
  await fixtureSecret(a.uid);
  await fixtureSecret(b.uid);
  const conn = await fixtureConnection(a.uid);
  const env = await as(db.workerPool, null, `SELECT user_id, envelope FROM ${S}.user_secrets WHERE user_id = ANY($1)`, [[a.uid, b.uid]]);
  assert.equal(env.rowCount, 2, "cross-user read for the refresh job");
  await as(db.workerPool, null, `UPDATE ${S}.oauth_connections SET status = 'needs_reconnect', last_error_code = 'invalid_grant' WHERE id = $1`, [conn]);
  await as(db.workerPool, null, `INSERT INTO ${S}.secret_audit_events (user_id, event, subject, actor) VALUES ($1, 'token_refresh_failed', 'youtube', 'lambda')`, [a.uid]);
  const nonce = hash32();
  await as(db.workerPool, null, `INSERT INTO ${S}.connect_request_nonces (nonce_hash) VALUES ($1)`, [nonce]);
  await rejectsWith(as(db.workerPool, null, `INSERT INTO ${S}.connect_request_nonces (nonce_hash) VALUES ($1)`, [nonce]), "23505");
  await pool.query(`UPDATE ${S}.connect_request_nonces SET created_at = now() - interval '11 minutes' WHERE nonce_hash = $1`, [nonce]);
  const pruned = await as(db.workerPool, null, `DELETE FROM ${S}.connect_request_nonces WHERE created_at < now() - interval '10 minutes'`);
  assert.equal(pruned.rowCount, 1);
  await rejectsWith(as(db.workerPool, null, `DELETE FROM ${S}.secret_audit_events`), "42501");
  await rejectsWith(as(db.workerPool, null, `UPDATE ${S}.user_secrets SET hint = 'zzzz'`), "42501");
});

test("deleting a user removes their secrets, connections and intents; audit rows stay without the user", async () => {
  const a = await member();
  await fixtureSecret(a.uid);
  await fixtureConnection(a.uid);
  await fixtureIntent(a.uid);
  await pool.query(`INSERT INTO ${S}.secret_audit_events (user_id, event, actor) VALUES ($1, 'secret_saved', 'user')`, [a.uid]);
  // 0001 keeps identities RESTRICT, so an operator removes them first.
  await pool.query(`DELETE FROM ${S}.user_identities WHERE user_id = $1`, [a.uid]);
  await pool.query(`DELETE FROM ${S}.users WHERE id = $1`, [a.uid]);
  for (const t of ["user_secrets", "oauth_connections", "oauth_connect_intents"]) {
    const r = await pool.query(`SELECT 1 FROM ${S}.${t} WHERE user_id = $1`, [a.uid]);
    assert.equal(r.rowCount, 0, t);
  }
  const audit = await pool.query(`SELECT user_id FROM ${S}.secret_audit_events WHERE event = 'secret_saved' AND user_id IS NULL`);
  assert.ok(audit.rowCount! >= 1);
});

// ------------------------------------------------------------ store

test("saving a key seals it to its row; the overview shows only the last 4", async () => {
  const a = await member();
  const saved = await store.saveSecret(a, { kind: "youtube_oauth_client", publicValue: GOOGLE_CLIENT_ID, secret: `  ${GOOGLE_SECRET} ` });
  assert.ok(saved.ok);
  assert.equal(saved.replaced, false);
  const row = (await pool.query(`SELECT id, envelope, key_slot, version, hint, public_value FROM ${S}.user_secrets WHERE user_id = $1`, [a.uid])).rows[0];
  assert.equal(row.hint, "ab12");
  assert.equal(row.version, 1);
  assert.equal(row.key_slot, 1);
  assert.equal(row.public_value, GOOGLE_CLIENT_ID);
  const aad = secretAad({ table: "user_secrets", rowId: row.id, userId: a.uid, kind: "youtube_oauth_client", version: 1 });
  assert.deepEqual(JSON.parse(openForTest(row.envelope, aad).plaintext.toString("utf8")), { client_secret: GOOGLE_SECRET });

  const view = await store.overview(a);
  assert.ok(view.ok);
  assert.deepEqual(
    view.secrets.map((s) => ({ kind: s.kind, publicValue: s.publicValue, hint: s.hint, version: s.version })),
    [{ kind: "youtube_oauth_client", publicValue: GOOGLE_CLIENT_ID, hint: "ab12", version: 1 }],
  );
  assert.doesNotMatch(JSON.stringify(view), new RegExp(GOOGLE_SECRET), "no secret in the overview");
  assert.deepEqual(view.audit.map((e) => [e.event, e.subject, e.actor]), [["secret_saved", "youtube_oauth_client", "user"]]);
});

test("replacing a key keeps the row, bumps the version and binds the new ciphertext to it", async () => {
  const a = await member();
  await store.saveSecret(a, { kind: "elevenlabs_api_key", secret: ELEVEN_KEY });
  const first = (await pool.query(`SELECT id FROM ${S}.user_secrets WHERE user_id = $1`, [a.uid])).rows[0];
  const next = ELEVEN_KEY.replace(/9z8y$/, "7w6v");
  const r = await store.saveSecret(a, { kind: "elevenlabs_api_key", secret: next });
  assert.ok(r.ok);
  assert.equal(r.replaced, true);
  const row = (await pool.query(`SELECT id, envelope, version, hint FROM ${S}.user_secrets WHERE user_id = $1`, [a.uid])).rows[0];
  assert.equal(row.id, first.id);
  assert.equal(row.version, 2);
  assert.equal(row.hint, "7w6v");
  const ctx = { table: "user_secrets" as const, rowId: row.id, userId: a.uid, kind: "elevenlabs_api_key" };
  assert.deepEqual(JSON.parse(openForTest(row.envelope, secretAad({ ...ctx, version: 2 })).plaintext.toString()), { api_key: next });
  assert.throws(() => openForTest(row.envelope, secretAad({ ...ctx, version: 1 })), "old version AAD does not open it");
  const view = await store.overview(a);
  assert.ok(view.ok);
  assert.deepEqual(view.audit.map((e) => e.event), ["secret_replaced", "secret_saved"]);
});

test("each kind validates its public value and secret", async () => {
  const a = await member();
  const save = (input: Parameters<KeyStore["saveSecret"]>[1]) => store.saveSecret(a, input);
  assert.deepEqual(await save({ kind: "aws_root_key", secret: ELEVEN_KEY }), { ok: false, code: "INVALID_KIND" });
  assert.deepEqual(await save({ kind: "youtube_oauth_client", publicValue: "not-a-client-id", secret: GOOGLE_SECRET }), { ok: false, code: "INVALID_PUBLIC_VALUE" });
  assert.deepEqual(await save({ kind: "youtube_oauth_client", secret: GOOGLE_SECRET }), { ok: false, code: "INVALID_PUBLIC_VALUE" });
  assert.deepEqual(await save({ kind: "instagram_app", publicValue: "12ab", secret: IG_SECRET }), { ok: false, code: "INVALID_PUBLIC_VALUE" });
  assert.deepEqual(await save({ kind: "elevenlabs_api_key", publicValue: "x", secret: ELEVEN_KEY }), { ok: false, code: "INVALID_PUBLIC_VALUE" });
  assert.deepEqual(await save({ kind: "elevenlabs_api_key", secret: "short" }), { ok: false, code: "INVALID_SECRET" });
  assert.deepEqual(await save({ kind: "elevenlabs_api_key", secret: "has a space inside it 0000" }), { ok: false, code: "INVALID_SECRET" });
  assert.deepEqual(await save({ kind: "elevenlabs_api_key", secret: "x".repeat(513) }), { ok: false, code: "INVALID_SECRET" });
  const ok = await save({ kind: "instagram_app", publicValue: IG_APP_ID, secret: IG_SECRET });
  assert.ok(ok.ok);
  const row = (await pool.query(`SELECT id, envelope FROM ${S}.user_secrets WHERE user_id = $1`, [a.uid])).rows[0];
  const aad = secretAad({ table: "user_secrets", rowId: row.id, userId: a.uid, kind: "instagram_app", version: 1 });
  assert.deepEqual(JSON.parse(openForTest(row.envelope, aad).plaintext.toString()), { app_secret: IG_SECRET });
  const rows = await pool.query(`SELECT count(*)::int AS n FROM ${S}.user_secrets WHERE user_id = $1`, [a.uid]);
  assert.equal(rows.rows[0].n, 1, "rejected saves wrote nothing");
});

test("stale sessions are signed out and non-owners are refused (phase 1 is owner-only)", async () => {
  const a = await member();
  const stale = { ...a, sv: a.sv + 1 };
  assert.deepEqual(await store.saveSecret(stale, { kind: "elevenlabs_api_key", secret: ELEVEN_KEY }), { ok: false, code: "NOT_SIGNED_IN" });
  assert.deepEqual(await store.overview(stale), { ok: false, code: "NOT_SIGNED_IN" });
  assert.deepEqual(await store.deleteSecret(stale, "elevenlabs_api_key"), { ok: false, code: "NOT_SIGNED_IN" });
  const guest = await member({ owner: false });
  assert.deepEqual(await store.saveSecret(guest, { kind: "elevenlabs_api_key", secret: ELEVEN_KEY }), { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(await store.overview(guest), { ok: false, code: "FORBIDDEN" });
});

test("members only ever see their own keys, connections and history", async () => {
  const a = await member();
  const b = await member();
  await store.saveSecret(a, { kind: "elevenlabs_api_key", secret: ELEVEN_KEY });
  await fixtureConnection(a.uid);
  const view = await store.overview(b);
  assert.ok(view.ok);
  assert.deepEqual(view.secrets, []);
  assert.deepEqual(view.connections, []);
  assert.deepEqual(view.audit, []);
});

test("app credentials in use need confirmation to delete, which also disconnects", async () => {
  const a = await member();
  assert.deepEqual(await store.deleteSecret(a, "youtube_oauth_client"), { ok: false, code: "NOT_FOUND" });
  await store.saveSecret(a, { kind: "youtube_oauth_client", publicValue: GOOGLE_CLIENT_ID, secret: GOOGLE_SECRET });
  await fixtureConnection(a.uid, "youtube");
  await fixtureConnection(a.uid, "instagram");
  assert.deepEqual(await store.deleteSecret(a, "youtube_oauth_client"), { ok: false, code: "IN_USE" });
  assert.deepEqual(await store.deleteSecret(a, "youtube_oauth_client", { confirmDisconnect: true }), { ok: true, disconnected: 1 });
  const left = await pool.query(`SELECT provider FROM ${S}.oauth_connections WHERE user_id = $1`, [a.uid]);
  assert.deepEqual(left.rows.map((r) => r.provider), ["instagram"], "only YouTube connections go");
  assert.equal((await pool.query(`SELECT 1 FROM ${S}.user_secrets WHERE user_id = $1`, [a.uid])).rowCount, 0);
  const view = await store.overview(a);
  assert.ok(view.ok);
  assert.deepEqual(view.audit.map((e) => [e.event, e.subject]).slice(0, 2), [
    ["secret_deleted", "youtube_oauth_client"],
    ["oauth_disconnected", "youtube"],
  ]);
  // A key that no connection depends on deletes without confirmation.
  await store.saveSecret(a, { kind: "elevenlabs_api_key", secret: ELEVEN_KEY });
  assert.deepEqual(await store.deleteSecret(a, "elevenlabs_api_key"), { ok: true, disconnected: 0 });
});

test("the overview lists connections and only the 20 newest history events", async () => {
  const a = await member();
  const conn = await fixtureConnection(a.uid, "instagram", "17841400000000000");
  for (let i = 0; i < 25; i++) await store.saveSecret(a, { kind: "elevenlabs_api_key", secret: `${ELEVEN_KEY.slice(0, -2)}${String(i).padStart(2, "0")}` });
  const view = await store.overview(a);
  assert.ok(view.ok);
  assert.equal(view.audit.length, 20);
  assert.deepEqual(
    view.connections.map((c) => ({ id: c.id, provider: c.provider, label: c.accountLabel, status: c.status })),
    [{ id: conn, provider: "instagram", label: "Fixture channel", status: "active" }],
  );
  assert.equal(view.secrets[0].version, 25);
});
