// Real-PostgreSQL tests for migration 0006 (app_source) and the connect store
// used by /api/keys/oauth/* and disconnect (docs/design/settings-keys.md §2, §2a).
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { pgErrorCode } from "../../lib/accounts/db";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { createPgConnectStore, type ConnectStore } from "../../lib/keys/connect-store";
import { secretAad } from "../../lib/keys/envelope";
import { createPgKeyStore } from "../../lib/keys/store";
import { openForTest, TEST_PUBLIC_KEY } from "../fixtures/envelope/open";
import { throwawayDb, type ThrowawayDb } from "./harness";

let db: ThrowawayDb;
let pool: Pool;
let connect: ConnectStore;
let seq = 0;
const S = "kubcode_accounts";
const WRAP = { slot: 1, publicKeyPem: TEST_PUBLIC_KEY };
const KUBCODE_CLIENT = "111111111111-kubcodesharedapp.apps.googleusercontent.com";
const MEMBER_CLIENT = "222222222222-memberownclient.apps.googleusercontent.com";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();
const token = () => randomBytes(32).toString("base64url");

before(async () => {
  db = await throwawayDb();
  pool = db.pool;
  connect = createPgConnectStore(db.appPool, WRAP);
});
after(async () => db?.cleanup());

async function member(opts: { owner?: boolean } = {}): Promise<SessionClaims> {
  const n = ++seq;
  const r = await createPgAccountStore(pool).resolveLogin({ provider: "google", subject: `g-oc-${n}`, displayName: `OC ${n}`, email: `oc${n}@example.test` });
  if (r.status !== "ok") throw new Error("login failed");
  await pool.query(`UPDATE ${S}.users SET is_owner = $2 WHERE id = $1`, [r.userId, opts.owner ?? true]);
  return sessionClaims(accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: `g-oc-${n}`, name: "OC", email: `oc${n}@example.test` }));
}

const start = (s: SessionClaims, provider: "youtube" | "instagram", over: Partial<Parameters<ConnectStore["startConnect"]>[1]> = {}) => {
  const input = { provider, kubcodeClientId: KUBCODE_CLIENT, state: token(), cookieToken: token(), verifier: provider === "youtube" ? token() : null, ...over };
  return connect.startConnect(s, input).then((r) => ({ r, input }));
};

async function fixtureConnection(uid: string, provider: string, appSource: string) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO ${S}.oauth_connections (id, user_id, provider, external_account_id, account_label, app_secret_version, envelope, key_slot, app_source)
     VALUES ($1, $2, $3, $4, 'Fixture', 1, $5, 1, $6)`,
    [id, uid, provider, `ext-${++seq}`, randomBytes(64), appSource],
  );
  return id;
}

// ------------------------------------------------------------ 0006

test("0006 adds app_source ('kubcode' | 'member') to intents and connections", async () => {
  const a = await member();
  await assert.rejects(fixtureConnection(a.uid, "youtube", "someone"), (e) => pgErrorCode(e) === "23514");
  const id = await fixtureConnection(a.uid, "youtube", "kubcode");
  // The web role reads it (column grant); the worker may change it on reconnect.
  const c = await db.appPool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('kubcode.user_id', $1, true)", [a.uid]);
    assert.equal((await c.query(`SELECT app_source FROM ${S}.oauth_connections WHERE id = $1`, [id])).rows[0].app_source, "kubcode");
    await c.query(`SELECT app_source FROM ${S}.oauth_connect_intents`);
    await c.query("COMMIT");
  } finally {
    c.release();
  }
  await db.workerPool.query(`UPDATE ${S}.oauth_connections SET app_source = 'member' WHERE id = $1`, [id]);
});

// ------------------------------------------------------------ start

test("start: YouTube uses kubcode's shared app unless the member saved their own client", async () => {
  const a = await member();
  const { r } = await start(a, "youtube");
  assert.ok(r.ok);
  assert.deepEqual([r.appSource, r.clientId], ["kubcode", KUBCODE_CLIENT]);
  await createPgKeyStore(db.appPool, WRAP).saveSecret(a, { kind: "youtube_oauth_client", publicValue: MEMBER_CLIENT, secret: "FIXTURE-ONLY-member-secret-00000" });
  const again = (await start(a, "youtube")).r;
  assert.ok(again.ok);
  assert.deepEqual([again.appSource, again.clientId], ["member", MEMBER_CLIENT]);
  const b = await member();
  assert.deepEqual((await start(b, "youtube", { kubcodeClientId: null })).r, { ok: false, code: "APP_NOT_CONFIGURED" });
});

test("start: Instagram needs the member's own app for now", async () => {
  const a = await member();
  assert.deepEqual((await start(a, "instagram")).r, { ok: false, code: "APP_NOT_CONFIGURED" });
  await createPgKeyStore(db.appPool, WRAP).saveSecret(a, { kind: "instagram_app", publicValue: "1234567890123456", secret: "fixtureonly0000000000000000003c4d" });
  const { r } = await start(a, "instagram");
  assert.ok(r.ok);
  assert.deepEqual([r.appSource, r.clientId], ["member", "1234567890123456"]);
});

test("start stores only hashes, seals the PKCE verifier to its intent, and keeps one open intent", async () => {
  const a = await member();
  const first = await start(a, "youtube");
  const { r, input } = await start(a, "youtube");
  assert.ok(r.ok);
  const rows = (await pool.query(`SELECT * FROM ${S}.oauth_connect_intents WHERE user_id = $1 ORDER BY created_at, id`, [a.uid])).rows;
  const open = rows.filter((x) => x.status === "open");
  assert.equal(open.length, 1, "starting again closes the previous intent");
  const prev = rows.find((x) => x.state_hash.equals(sha(first.input.state)))!;
  assert.deepEqual([prev.phase, prev.status, prev.verifier_envelope], ["closed", "expired", null]);
  const row = open[0];
  assert.equal(row.id, r.intentId);
  assert.ok(row.state_hash.equals(sha(input.state)) && row.cookie_hash.equals(sha(input.cookieToken)));
  assert.ok(!JSON.stringify(row).includes(input.state), "no raw state stored");
  assert.equal(row.app_source, "kubcode");
  const aad = secretAad({ table: "oauth_connect_intents", rowId: row.id, userId: a.uid, kind: "youtube", version: 1 });
  assert.equal(openForTest(row.verifier_envelope, aad).plaintext.toString(), input.verifier);
  assert.ok(row.expires_at.getTime() - Date.now() > 9 * 60_000 && row.expires_at.getTime() - Date.now() <= 10 * 60_000);
  const audit = await pool.query(`SELECT event, subject FROM ${S}.secret_audit_events WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [a.uid]);
  assert.deepEqual(audit.rows[0], { event: "oauth_connect_started", subject: "youtube" });
});

test("start: stale sessions and non-owners are refused; YouTube without a wrap key is NOT_READY", async () => {
  const a = await member();
  assert.deepEqual((await start({ ...a, sv: a.sv + 1 }, "youtube")).r, { ok: false, code: "NOT_SIGNED_IN" });
  assert.deepEqual((await start(await member({ owner: false }), "youtube")).r, { ok: false, code: "FORBIDDEN" });
  const keyless = createPgConnectStore(db.appPool, null);
  const r = await keyless.startConnect(a, { provider: "youtube", kubcodeClientId: KUBCODE_CLIENT, state: token(), cookieToken: token(), verifier: token() });
  assert.deepEqual(r, { ok: false, code: "NOT_READY" });
});

// ------------------------------------------------------------ callback

test("callback: the right session, cookie and provider move the intent to exchanging, once", async () => {
  const a = await member();
  const { r, input } = await start(a, "youtube");
  assert.ok(r.ok);
  const args = { provider: "youtube" as const, state: input.state, cookieToken: input.cookieToken };
  assert.deepEqual(await connect.beginExchange(a, { ...args, provider: "instagram" }), { ok: false, code: "INTENT_INVALID" });
  assert.deepEqual(await connect.beginExchange(a, { ...args, cookieToken: token() }), { ok: false, code: "INTENT_INVALID" });
  assert.deepEqual(await connect.beginExchange(await member(), args), { ok: false, code: "INTENT_INVALID" }, "another member never sees it");
  // A different sign-in of the same member (new sid) is a different browser session.
  assert.deepEqual(await connect.beginExchange({ ...a, sid: token() }, args), { ok: false, code: "INTENT_INVALID" });
  assert.deepEqual(await connect.beginExchange(a, args), { ok: true, intentId: r.intentId });
  assert.deepEqual(await connect.beginExchange(a, args), { ok: false, code: "INTENT_INVALID" }, "single use");
  const row = (await pool.query(`SELECT phase, status FROM ${S}.oauth_connect_intents WHERE id = $1`, [r.intentId])).rows[0];
  assert.deepEqual(row, { phase: "exchanging", status: "open" });
});

test("callback: an expired intent is closed and reported as expired", async () => {
  const a = await member();
  const { r, input } = await start(a, "youtube");
  assert.ok(r.ok);
  await pool.query(`UPDATE ${S}.oauth_connect_intents SET expires_at = now() - interval '1 second' WHERE id = $1`, [r.intentId]);
  assert.deepEqual(await connect.beginExchange(a, { provider: "youtube", state: input.state, cookieToken: input.cookieToken }), { ok: false, code: "INTENT_EXPIRED" });
  const row = (await pool.query(`SELECT phase, status, verifier_envelope FROM ${S}.oauth_connect_intents WHERE id = $1`, [r.intentId])).rows[0];
  assert.deepEqual(row, { phase: "closed", status: "expired", verifier_envelope: null });
});

test("failIntent closes an open intent, wipes the verifier and audits the failure", async () => {
  const a = await member();
  const { r, input } = await start(a, "youtube");
  assert.ok(r.ok);
  await connect.beginExchange(a, { provider: "youtube", state: input.state, cookieToken: input.cookieToken });
  assert.deepEqual(await connect.failIntent(a, r.intentId), { ok: true });
  const row = (await pool.query(`SELECT phase, status, verifier_envelope FROM ${S}.oauth_connect_intents WHERE id = $1`, [r.intentId])).rows[0];
  assert.deepEqual(row, { phase: "closed", status: "failed", verifier_envelope: null });
  assert.deepEqual(await connect.failIntent(a, r.intentId), { ok: true }, "idempotent");
  const events = (await pool.query(`SELECT event FROM ${S}.secret_audit_events WHERE user_id = $1 AND event = 'oauth_connect_failed'`, [a.uid])).rowCount;
  assert.equal(events, 1);
});

// ------------------------------------------------------------ disconnect

test("disconnect: mark revoking, then remove; audits say whether the provider revoke worked", async () => {
  const a = await member();
  const b = await member();
  const id = await fixtureConnection(a.uid, "youtube", "kubcode");
  assert.deepEqual(await connect.markRevoking(b, id), { ok: false, code: "NOT_FOUND" }, "not another member's");
  assert.deepEqual(await connect.markRevoking(a, id), { ok: true, provider: "youtube" });
  assert.equal((await pool.query(`SELECT status FROM ${S}.oauth_connections WHERE id = $1`, [id])).rows[0].status, "revoking");
  assert.deepEqual(await connect.removeConnection(a, id, { revokeFailed: true }), { ok: true });
  assert.equal((await pool.query(`SELECT 1 FROM ${S}.oauth_connections WHERE id = $1`, [id])).rowCount, 0);
  const events = (await pool.query(`SELECT event FROM ${S}.secret_audit_events WHERE user_id = $1 ORDER BY id`, [a.uid])).rows.map((x) => x.event);
  assert.deepEqual(events.slice(-2), ["oauth_disconnected", "oauth_revoke_failed"]);
  assert.deepEqual(await connect.removeConnection(a, id, { revokeFailed: false }), { ok: false, code: "NOT_FOUND" });
});

test("deleting member app credentials disconnects only that member's own-app connections", async () => {
  const a = await member();
  const keys = createPgKeyStore(db.appPool, WRAP);
  await keys.saveSecret(a, { kind: "youtube_oauth_client", publicValue: MEMBER_CLIENT, secret: "FIXTURE-ONLY-member-secret-00000" });
  await fixtureConnection(a.uid, "youtube", "member");
  const shared = await fixtureConnection(a.uid, "youtube", "kubcode");
  assert.deepEqual(await keys.deleteSecret(a, "youtube_oauth_client", { confirmDisconnect: true }), { ok: true, disconnected: 1 });
  const left = (await pool.query(`SELECT id FROM ${S}.oauth_connections WHERE user_id = $1`, [a.uid])).rows.map((x) => x.id);
  assert.deepEqual(left, [shared], "the kubcode-app connection stays");
});

test("the overview says which app each connection uses", async () => {
  const a = await member();
  await fixtureConnection(a.uid, "youtube", "kubcode");
  const view = await createPgKeyStore(db.appPool, WRAP).overview(a);
  assert.ok(view.ok);
  assert.equal(view.connections[0].appSource, "kubcode");
});
