// Real-PostgreSQL test for the first-run checklist (lib/onboarding/view.ts):
// counted as the web role under RLS, so another workspace's rows never count.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { onboardingOf } from "../../lib/onboarding/view";
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

async function member(owner = false): Promise<{ s: SessionClaims; ws: string; uid: string }> {
  const i = ++n;
  const r = await createPgAccountStore(pool).resolveLogin({ provider: "google", subject: `g-ob-${i}`, displayName: `O ${i}`, email: `o${i}@example.test` });
  if (r.status !== "ok") throw new Error("login");
  await pool.query(`UPDATE ${S}.users SET is_owner = $2 WHERE id = $1`, [r.userId, owner]);
  const ws = (await pool.query(`INSERT INTO ${S}.workspaces (name) VALUES ('w') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO ${S}.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, r.userId]);
  return { s: sessionClaims(accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: `g-ob-${i}`, name: "O", email: `o${i}@example.test` })), ws, uid: r.userId };
}

const steps = (o: Awaited<ReturnType<typeof onboardingOf>>) => o!.steps.map((s) => `${s.id}:${s.done ? 1 : 0}`).join(" ");

test("checklist advances with real rows; only the member's own workspace counts", async () => {
  const a = await member();
  const other = await member();
  // Someone else's channel must not count for a.
  await pool.query(`INSERT INTO ${S}.channels (workspace_id, platform, display_name) VALUES ($1, 'tiktok', 'x')`, [other.ws]);
  assert.equal(steps(await onboardingOf(db.appPool, a.s)), "pay:0 connect:0 rule:0 post:0");

  await pool.query(`INSERT INTO ${S}.billing_entitlements (workspace_id, slots, period_start, paid_until) VALUES ($1, 1, now(), now() + interval '10 days')`, [a.ws]);
  const ch = (await pool.query(`INSERT INTO ${S}.channels (workspace_id, platform, display_name) VALUES ($1, 'tiktok', 'kube.code') RETURNING id`, [a.ws])).rows[0].id;
  let o = await onboardingOf(db.appPool, a.s);
  assert.equal(steps(o), "pay:1 connect:1 rule:0 post:0");
  assert.equal(o!.ruleChannelId, ch);
  assert.ok(o!.paidUntil);

  await pool.query(
    `INSERT INTO ${S}.automation_rules (channel_id, keywords, match_mode, public_reply, dm_text, reply_policy, active) VALUES ($1, ARRAY['ลิงก์'], 'contains', 'ลิงก์อยู่ที่ https://kubcode.dev/go/x ครับ', '-', 'always', true)`,
    [ch],
  );
  const sha = randomBytes(32);
  const asset = (await pool.query(
    `INSERT INTO ${S}.media_assets (workspace_id, clip_ref, kind, s3_key, sha256, bytes, content_type, width, height) VALUES ($1, 'web-x', 'video', $2, $3, 1, 'video/mp4', 1, 1) RETURNING id`,
    [a.ws, `clips/${a.ws}/web-x/${sha.toString("hex")}.mp4`, sha],
  )).rows[0].id;
  await pool.query(
    `INSERT INTO ${S}.posts (workspace_id, clip_ref, video_asset_id, title, description, status, confirm_digest, confirmed_at) VALUES ($1, 'web-x', $2, 't', 'd', 'confirmed', $3, now())`,
    [a.ws, asset, Buffer.alloc(32, 1)],
  );
  o = await onboardingOf(db.appPool, a.s);
  assert.equal(steps(o), "pay:1 connect:1 rule:1 post:1");
  assert.equal(o!.complete, true);
  void randomUUID;
});

test("owner skips paying; an expired pass (past grace) is not paid", async () => {
  const o = await member(true);
  assert.equal(steps(await onboardingOf(db.appPool, o.s)), "connect:0 rule:0 post:0");
  const late = await member();
  await pool.query(`INSERT INTO ${S}.billing_entitlements (workspace_id, slots, period_start, paid_until) VALUES ($1, 1, now() - interval '40 days', now() - interval '5 days')`, [late.ws]);
  assert.equal(steps(await onboardingOf(db.appPool, late.s)), "pay:0 connect:0 rule:0 post:0");
});
