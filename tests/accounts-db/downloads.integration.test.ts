// Real-PostgreSQL tests for the download log and the per-member download limit.
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { DOWNLOAD_LIMIT, createPgDownloadStore, type DownloadStore } from "../../lib/downloads/store";
import { throwawayDb, type ThrowawayDb } from "./harness";

let db: ThrowawayDb;
let pool: Pool;
let store: DownloadStore;
let seq = 0;

before(async () => {
  db = await throwawayDb();
  pool = db.pool;
  store = createPgDownloadStore(db.appPool);
});
after(async () => db?.cleanup());

const WHAT_IF = { slug: "freshstack-what-if", version: "0.1.0" };

async function member(): Promise<SessionClaims> {
  const n = ++seq;
  const accounts = createPgAccountStore(pool);
  const profile = { provider: "google" as const, subject: `g-dl-${n}`, displayName: `Member ${n}`, email: `dl${n}@example.test` };
  const r = await accounts.resolveLogin(profile);
  if (r.status !== "ok") throw new Error("login failed");
  return sessionClaims(
    accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email }),
  );
}

const events = async (s: SessionClaims) =>
  (
    await pool.query<{ package_slug: string; package_version: string }>(
      "SELECT package_slug, package_version FROM kubcode_accounts.download_events WHERE user_id = $1",
      [s.uid],
    )
  ).rows;

test("a download is logged against the member and the package version", async () => {
  const m = await member();
  assert.deepEqual(await store.recordDownload(m, WHAT_IF), { ok: true });
  assert.deepEqual(await events(m), [{ package_slug: "freshstack-what-if", package_version: "0.1.0" }]);
});

test(`the limit allows ${DOWNLOAD_LIMIT} downloads in 24 hours, then says when the next one is possible`, async () => {
  const m = await member();
  for (let i = 0; i < DOWNLOAD_LIMIT; i++) assert.deepEqual(await store.recordDownload(m, WHAT_IF), { ok: true }, `download ${i + 1}`);
  // Make the oldest one 23 hours old: the next slot opens one hour from now.
  await pool.query(
    `UPDATE kubcode_accounts.download_events SET created_at = now() - interval '23 hours'
      WHERE id = (SELECT min(id) FROM kubcode_accounts.download_events WHERE user_id = $1)`,
    [m.uid],
  );
  const refused = await store.recordDownload(m, WHAT_IF);
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.code === "DOWNLOAD_LIMIT");
  const retryIn = new Date((refused as { retryAt: string }).retryAt).getTime() - Date.now();
  assert.ok(retryIn > 55 * 60_000 && retryIn <= 60 * 60_000, `retry in ${retryIn} ms`);
  assert.equal((await events(m)).length, DOWNLOAD_LIMIT, "a refused download is not logged");
});

test("downloads older than 24 hours no longer count", async () => {
  const m = await member();
  for (let i = 0; i < DOWNLOAD_LIMIT; i++) await store.recordDownload(m, WHAT_IF);
  await pool.query(
    "UPDATE kubcode_accounts.download_events SET created_at = now() - interval '24 hours 1 second' WHERE user_id = $1",
    [m.uid],
  );
  assert.deepEqual(await store.recordDownload(m, WHAT_IF), { ok: true });
});

test("parallel requests cannot race past the limit", async () => {
  const m = await member();
  const results = await Promise.all(Array.from({ length: DOWNLOAD_LIMIT + 6 }, () => store.recordDownload(m, WHAT_IF)));
  assert.equal(results.filter((r) => r.ok).length, DOWNLOAD_LIMIT);
  assert.equal((await events(m)).length, DOWNLOAD_LIMIT);
});

test("one member's downloads do not use up another's", async () => {
  const a = await member();
  const b = await member();
  for (let i = 0; i < DOWNLOAD_LIMIT; i++) await store.recordDownload(a, WHAT_IF);
  assert.deepEqual(await store.recordDownload(b, WHAT_IF), { ok: true });
});

test("a revoked or suspended session cannot download and nothing is logged", async () => {
  const revoked = await member();
  await pool.query("UPDATE kubcode_accounts.users SET session_version = session_version + 1 WHERE id = $1", [revoked.uid]);
  assert.deepEqual(await store.recordDownload(revoked, WHAT_IF), { ok: false, code: "NOT_SIGNED_IN" });
  assert.deepEqual(await events(revoked), []);

  const suspended = await member();
  await pool.query("UPDATE kubcode_accounts.users SET status = 'suspended' WHERE id = $1", [suspended.uid]);
  assert.deepEqual(await store.recordDownload(suspended, WHAT_IF), { ok: false, code: "NOT_SIGNED_IN" });

  const forged = { ...(await member()), uid: "00000000-0000-4000-8000-000000000000" };
  assert.deepEqual(await store.recordDownload(forged, WHAT_IF), { ok: false, code: "NOT_SIGNED_IN" });
});

test("the runtime role can only insert and read the download log", async () => {
  const m = await member();
  await store.recordDownload(m, WHAT_IF);
  for (const sql of [
    "UPDATE kubcode_accounts.download_events SET package_version = '9.9.9'",
    "DELETE FROM kubcode_accounts.download_events",
  ]) {
    await assert.rejects(db.appPool.query(sql), (e: { code?: string }) => e.code === "42501", sql);
  }
  const api = await pool.query(
    `SELECT grantee FROM information_schema.role_table_grants
      WHERE table_schema = 'kubcode_accounts' AND table_name = 'download_events'
        AND grantee IN ('anon', 'authenticated', 'PUBLIC')`,
  );
  assert.equal(api.rowCount, 0);
});

test("the table rejects slugs and versions that are not package-shaped", async () => {
  const m = await member();
  await assert.rejects(store.recordDownload(m, { slug: "../etc", version: "0.1.0" }));
  await assert.rejects(store.recordDownload(m, { slug: "freshstack-what-if", version: "latest" }));
});
