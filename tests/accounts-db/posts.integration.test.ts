// Real-PostgreSQL test for /account/posts reads (lib/posts/store.ts) with
// migration 0015: per-channel caption/options come back to the web role for
// the member's own workspace only, and only for paying members or the owner.
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { createPgPostStore } from "../../lib/posts/store";
import { throwawayDb, type ThrowawayDb } from "./harness";

let db: ThrowawayDb;
let pool: Pool;
const S = "kubcode_accounts";
let n = 0;

before(async () => {
  db = await throwawayDb();
  pool = db.pool;
});
after(async () => db?.cleanup());

async function member(paid: boolean): Promise<{ s: SessionClaims; ws: string }> {
  const i = ++n;
  const r = await createPgAccountStore(pool).resolveLogin({ provider: "google", subject: `g-po-${i}`, displayName: `P ${i}`, email: `p${i}@example.test` });
  if (r.status !== "ok") throw new Error("login");
  const ws = (await pool.query(`INSERT INTO ${S}.workspaces (name) VALUES ('w') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO ${S}.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, r.userId]);
  if (paid) await pool.query(`INSERT INTO ${S}.billing_entitlements (workspace_id, slots, period_start, paid_until) VALUES ($1, 2, now(), now() + interval '20 days')`, [ws]);
  return { s: sessionClaims(accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: `g-po-${i}`, name: "P", email: `p${i}@example.test` })), ws };
}

async function postWithDelivery(ws: string, caption: string | null, options: object | null) {
  const ch = (await pool.query(`INSERT INTO ${S}.channels (workspace_id, platform, display_name) VALUES ($1, 'tiktok', 'kube.code') RETURNING id`, [ws])).rows[0].id;
  const conn = (await pool.query(`INSERT INTO ${S}.channel_connections (channel_id, provider, provider_ref, status) VALUES ($1, 'zernio', $2, 'active') RETURNING id`, [ch, `acc-${randomUUID()}`])).rows[0].id;
  const sha = randomBytes(32);
  const asset = (await pool.query(
    `INSERT INTO ${S}.media_assets (workspace_id, clip_ref, kind, s3_key, sha256, bytes, content_type, width, height)
     VALUES ($1, 'web-x', 'video', $2, $3, 10, 'video/mp4', 1080, 1920) RETURNING id`,
    [ws, `clips/${ws}/web-x/${sha.toString("hex")}.mp4`, sha],
  )).rows[0].id;
  const post = (await pool.query(
    `INSERT INTO ${S}.posts (workspace_id, clip_ref, video_asset_id, title, description, status, confirm_digest, confirmed_at)
     VALUES ($1, 'web-x', $2, 't', 'แคปชันรวม', 'confirmed', $3, now()) RETURNING id`,
    [ws, asset, Buffer.alloc(32, 1)],
  )).rows[0].id;
  await pool.query(
    `INSERT INTO ${S}.deliveries (post_id, channel_id, connection_id, provider, platform, publish_at, visibility, idempotency_key, caption, options)
     VALUES ($1, $2, $3, 'zernio', 'tiktok', now() + interval '1 hour', 'public', $4, $5, $6)`,
    [post, ch, conn, randomUUID(), caption, options === null ? null : JSON.stringify(options)],
  );
}

test("posts: caption and option names for the member's own deliveries; others and non-payers see nothing", async () => {
  const store = createPgPostStore(db.appPool);
  const a = await member(true);
  await postWithDelivery(a.ws, "แคปชัน TikTok", { tiktok: { allow_duet: true, draft: true } });
  const b = await member(true);
  await postWithDelivery(b.ws, null, null);
  const r = await store.posts(a.s);
  assert.ok(r.ok);
  assert.equal(r.posts.length, 1, "RLS: only a's post");
  const d = r.posts[0].deliveries[0];
  assert.equal(r.posts[0].caption, "แคปชันรวม");
  assert.equal(d.caption, "แคปชัน TikTok");
  assert.deepEqual(d.options.sort(), ["allow_duet", "draft"]);
  const rb = await store.posts(b.s);
  assert.ok(rb.ok);
  assert.deepEqual([rb.posts[0].deliveries[0].caption, rb.posts[0].deliveries[0].options], [null, []]);
  const unpaid = await member(false);
  assert.deepEqual(await store.posts(unpaid.s), { ok: false, code: "FORBIDDEN" });
});

test("0015 checks: options must be a JSON object; caption ≤ 5000", async () => {
  const a = await member(true);
  await assert.rejects(postWithDelivery(a.ws, "x".repeat(5001), null), /check/i);
  await assert.rejects(postWithDelivery(a.ws, null, [1, 2] as unknown as object), /check/i);
});
