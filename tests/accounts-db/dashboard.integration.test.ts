// Real-PostgreSQL test for the Social dashboard counts (lib/dashboard/store.ts):
// exact counts from our own records, for the member's own channels only (RLS),
// with the same answer rules as the worker's monthly cap.
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { createPgDashboardStore } from "../../lib/dashboard/store";
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
  const r = await createPgAccountStore(pool).resolveLogin({ provider: "google", subject: `g-da-${i}`, displayName: `D ${i}`, email: `d${i}@example.test` });
  if (r.status !== "ok") throw new Error("login");
  const ws = (await pool.query(`INSERT INTO ${S}.workspaces (name) VALUES ('w') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO ${S}.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, r.userId]);
  if (paid) await pool.query(`INSERT INTO ${S}.billing_entitlements (workspace_id, slots, period_start, paid_until) VALUES ($1, 2, now(), now() + interval '20 days')`, [ws]);
  return { s: sessionClaims(accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: `g-da-${i}`, name: "D", email: `d${i}@example.test` })), ws };
}

async function channel(ws: string, platform: string, handle: string, status: "active" | "revoked" = "active") {
  const ch = (await pool.query(`INSERT INTO ${S}.channels (workspace_id, platform, display_name, handle) VALUES ($1, $2, 'Shop', $3) RETURNING id`, [ws, platform, handle])).rows[0].id;
  const conn = (await pool.query(
    `INSERT INTO ${S}.channel_connections (channel_id, provider, provider_ref, status, revoked_at)
     VALUES ($1, 'zernio', $2, $3, CASE WHEN $3 = 'revoked' THEN now() END) RETURNING id`,
    [ch, `acc-${randomUUID()}`, status],
  )).rows[0].id;
  return { ch, conn };
}

async function delivery(ws: string, ch: string, conn: string, status: string, publishAt: string) {
  const sha = randomBytes(32);
  const asset = (await pool.query(
    `INSERT INTO ${S}.media_assets (workspace_id, clip_ref, kind, s3_key, sha256, bytes, content_type, width, height)
     VALUES ($1, 'web-x', 'video', $2, $3, 10, 'video/mp4', 1080, 1920) RETURNING id`,
    [ws, `clips/${ws}/web-x/${sha.toString("hex")}.mp4`, sha],
  )).rows[0].id;
  const post = (await pool.query(
    `INSERT INTO ${S}.posts (workspace_id, clip_ref, video_asset_id, title, description, status, confirm_digest, confirmed_at)
     VALUES ($1, 'web-x', $2, 't', 'c', 'confirmed', $3, now()) RETURNING id`,
    [ws, asset, Buffer.alloc(32, 1)],
  )).rows[0].id;
  await pool.query(
    `INSERT INTO ${S}.deliveries (post_id, channel_id, connection_id, provider, platform, publish_at, visibility, idempotency_key, status)
     VALUES ($1, $2, $3, 'zernio', 'instagram', now() + $4::interval, 'public', $5, $6)`,
    [post, ch, conn, publishAt, randomUUID(), status],
  );
}

/** One matched comment and, when given, its ledger row. */
async function comment(ch: string, outcome: string | null, ledger: { dm: string; reply?: string; at?: string } | null, receivedAgo = "1 hour") {
  const id = randomUUID();
  const item = (await pool.query(
    `INSERT INTO ${S}.comment_items (channel_id, provider, comment_id, platform_post_id, author_id, received_at, status, outcome)
     VALUES ($1, 'zernio', $2, 'p1', $2, now() - $3::interval, $4, $5) RETURNING id`,
    [ch, id, receivedAgo, outcome ? "done" : "pending", outcome],
  )).rows[0].id;
  if (ledger)
    await pool.query(
      `INSERT INTO ${S}.dm_ledger (channel_id, platform_post_id, author_id, comment_item_id, dm_state, reply_state, created_at)
       VALUES ($1, 'p1', $2, $3, $4, $5, coalesce(now() - $6::interval, now()))`,
      [ch, id, item, ledger.dm, ledger.reply ?? "none", ledger.at ?? null],
    );
}

test("dashboard: exact post, comment and answer counts for the member's own channels", async () => {
  const store = createPgDashboardStore(db.appPool);
  const a = await member(true);
  const ig = await channel(a.ws, "instagram", "myshop");
  const tt = await channel(a.ws, "tiktok", "myshop.tt");
  await channel(a.ws, "youtube", "gone", "revoked");
  // Posts: 2 scheduled, 1 published in 30 days, 1 published long ago (not counted), 1 failed.
  await delivery(a.ws, ig.ch, ig.conn, "scheduled", "1 day");
  await delivery(a.ws, ig.ch, ig.conn, "scheduled", "2 days");
  await delivery(a.ws, ig.ch, ig.conn, "published", "-3 days");
  await delivery(a.ws, ig.ch, ig.conn, "published", "-40 days");
  await delivery(a.ws, ig.ch, ig.conn, "failed", "-1 day");
  // Instagram: sent, maybe sent, consumed (not an answer), failed, still pending.
  await comment(ig.ch, "dm_sent", { dm: "dm_sent" });
  await comment(ig.ch, "dm_unknown", { dm: "dm_unknown" });
  await comment(ig.ch, "dm_consumed", { dm: "dm_consumed" });
  await comment(ig.ch, "dm_failed", { dm: "dm_failed" });
  await comment(ig.ch, null, null);
  await comment(ig.ch, "dm_sent", null, "40 days"); // outside the window
  // TikTok public replies: sent and failed.
  await comment(tt.ch, "reply_sent", { dm: "claimed", reply: "sent" });
  await comment(tt.ch, "reply_failed", { dm: "claimed", reply: "failed" });

  const r = await store.activity(a.s);
  assert.ok(r.ok);
  assert.deepEqual(r.activity.posts, { scheduled: 2, published: 1, failed: 1 });
  assert.deepEqual(
    r.activity.channels.map((c) => [c.platform, c.name, c.answersThisMonth, c.matched, c.answered]),
    [
      ["instagram", "myshop", 2, 5, 2],
      ["tiktok", "myshop.tt", 1, 2, 1],
    ],
    "revoked channel left out; consumed and failed are not answers",
  );
  assert.deepEqual([r.activity.answersThisMonth, r.activity.matched, r.activity.answered], [3, 7, 3]);

  // RLS: another member sees none of it.
  const b = await member(true);
  const rb = await store.activity(b.s);
  assert.ok(rb.ok);
  assert.deepEqual(rb.activity, { posts: { scheduled: 0, published: 0, failed: 0 }, answersThisMonth: 0, matched: 0, answered: 0, channels: [] });
  // Same gate as /account/posts: no paid access, no dashboard data.
  assert.deepEqual(await store.activity((await member(false)).s), { ok: false, code: "FORBIDDEN" });
});
