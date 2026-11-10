// Real-PostgreSQL tests for the automation rule store used by
// /account/channels/<id>/automations (docs/design/ig-comment-dm.md §4.6,
// migration 0010): member gate, RLS by workspace, Instagram channels only,
// this month's DM count in Asia/Bangkok, and no commenter ids for the web role.
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { pgErrorCode } from "../../lib/accounts/db";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { createPgAutomationStore, type AutomationStore } from "../../lib/automations/store";
import type { RuleInput } from "../../lib/automations/rules";
import { throwawayDb, type ThrowawayDb } from "./harness";

let db: ThrowawayDb;
let pool: Pool;
let store: AutomationStore;
let seq = 0;
const S = "kubcode_accounts";

before(async () => {
  db = await throwawayDb();
  pool = db.pool;
  store = createPgAutomationStore(db.appPool);
});
after(async () => db?.cleanup());

const RULE: RuleInput = {
  keywords: ["ลิงก์", "link"],
  matchMode: "contains",
  platformPostId: null,
  publicReply: "ส่งให้ใน DM แล้วนะ",
  dmText: "นี่ลิงก์ https://kubcode.dev/go/demo",
  replyPolicy: "after_dm",
  active: true,
};

/** A signed-in member with their own workspace (fixtures written by the schema owner). */
async function member(opts: { owner?: boolean } = {}): Promise<{ s: SessionClaims; workspace: string }> {
  const n = ++seq;
  const r = await createPgAccountStore(pool).resolveLogin({ provider: "google", subject: `g-au-${n}`, displayName: `AU ${n}`, email: `au${n}@example.test` });
  if (r.status !== "ok") throw new Error("login failed");
  await pool.query(`UPDATE ${S}.users SET is_owner = $2 WHERE id = $1`, [r.userId, opts.owner ?? true]);
  const workspace = (await pool.query(`INSERT INTO ${S}.workspaces (name) VALUES ($1) RETURNING id`, [`WS ${n}`])).rows[0].id;
  await pool.query(`INSERT INTO ${S}.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [workspace, r.userId]);
  const s = sessionClaims(accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: `g-au-${n}`, name: "AU", email: `au${n}@example.test` }));
  return { s, workspace };
}

async function channel(workspace: string, platform = "instagram"): Promise<string> {
  return (
    await pool.query(`INSERT INTO ${S}.channels (workspace_id, platform, display_name, handle) VALUES ($1, $2, 'Lokeek', 'lokeekbaebkub') RETURNING id`, [
      workspace,
      platform,
    ])
  ).rows[0].id;
}

async function comment(channelId: string, receivedAt: string, over: { outcome?: string | null; status?: string; post?: string } = {}) {
  return (
    await pool.query(
      `INSERT INTO ${S}.comment_items (channel_id, provider, comment_id, platform_post_id, author_id, received_at, status, outcome)
       VALUES ($1, 'zernio', $2, $3, $4, $5, $6, $7) RETURNING id`,
      [channelId, `c-${randomUUID()}`, over.post ?? "1789", `author-${randomUUID()}`, receivedAt, over.status ?? "done", over.outcome === undefined ? "dm_sent" : over.outcome],
    )
  ).rows[0].id as string;
}

async function ledger(channelId: string, createdAt: string, dmState: string) {
  const item = await comment(channelId, createdAt);
  await pool.query(
    `INSERT INTO ${S}.dm_ledger (channel_id, platform_post_id, author_id, comment_item_id, dm_state, created_at)
     VALUES ($1, '1789', $2, $3, $4, $5)`,
    [channelId, `author-${randomUUID()}`, item, dmState, createdAt],
  );
}

// ------------------------------------------------------------ gate

test("the gate: a stale session is NOT_SIGNED_IN, a non-owner FORBIDDEN, a YouTube or foreign channel CHANNEL_NOT_FOUND", async () => {
  const a = await member();
  const ig = await channel(a.workspace);
  assert.deepEqual(await store.member(a.s), { ok: true, userId: a.s.uid });
  assert.deepEqual(await store.rules({ ...a.s, sv: a.s.sv + 1 }, ig), { ok: false, code: "NOT_SIGNED_IN" });
  const plain = await member({ owner: false });
  assert.deepEqual(await store.member(plain.s), { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(await store.create(plain.s, await channel(plain.workspace), RULE), { ok: false, code: "FORBIDDEN" });
  const yt = await channel(a.workspace, "youtube");
  assert.deepEqual(await store.rules(a.s, yt), { ok: false, code: "CHANNEL_NOT_FOUND" });
  assert.deepEqual(await store.create(a.s, yt, RULE), { ok: false, code: "CHANNEL_NOT_FOUND" });
  assert.deepEqual(await store.rules(a.s, randomUUID()), { ok: false, code: "CHANNEL_NOT_FOUND" });
});

// ------------------------------------------------------------ rules

test("create, list, update and remove a rule on the member's own Instagram channel", async () => {
  const a = await member();
  const ig = await channel(a.workspace);
  const listed = await store.rules(a.s, ig);
  assert.deepEqual(listed, { ok: true, channel: { id: ig, displayName: "Lokeek", handle: "lokeekbaebkub" }, rules: [] });

  const first = await store.create(a.s, ig, RULE);
  assert.ok(first.ok);
  const { id, updatedAt, ...rest } = first.rule;
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.ok(!Number.isNaN(Date.parse(updatedAt)));
  assert.deepEqual(rest, { ...RULE, position: 0 });
  const second = await store.create(a.s, ig, { ...RULE, keywords: ["สนใจ"], platformPostId: "1789", publicReply: null, matchMode: "exact" });
  assert.ok(second.ok);
  assert.equal(second.rule.position, 1, "new rules go last");

  const all = await store.rules(a.s, ig);
  assert.ok(all.ok);
  assert.deepEqual(all.rules.map((r) => r.id), [id, second.rule.id]);

  const paused = await store.update(a.s, ig, id, { active: false });
  assert.ok(paused.ok);
  assert.equal(paused.rule.active, false);
  assert.deepEqual(paused.rule.keywords, RULE.keywords, "a pause changes nothing else");
  const edited = await store.update(a.s, ig, id, { keywords: ["x"], publicReply: null, replyPolicy: "always" });
  assert.ok(edited.ok);
  assert.deepEqual([edited.rule.keywords, edited.rule.publicReply, edited.rule.replyPolicy, edited.rule.active], [["x"], null, "always", false]);

  assert.deepEqual(await store.remove(a.s, ig, id), { ok: true });
  assert.deepEqual(await store.remove(a.s, ig, id), { ok: false, code: "RULE_NOT_FOUND" });
  assert.deepEqual(await store.update(a.s, ig, id, { active: true }), { ok: false, code: "RULE_NOT_FOUND" });
  const left = await store.rules(a.s, ig);
  assert.ok(left.ok);
  assert.deepEqual(left.rules.map((r) => r.id), [second.rule.id]);
});

test("RLS: another member's channel and rules stay out of reach, even by id", async () => {
  const a = await member();
  const b = await member();
  const aCh = await channel(a.workspace);
  const bCh = await channel(b.workspace);
  const bRule = await store.create(b.s, bCh, RULE);
  assert.ok(bRule.ok);
  assert.deepEqual(await store.rules(a.s, bCh), { ok: false, code: "CHANNEL_NOT_FOUND" });
  assert.deepEqual(await store.create(a.s, bCh, RULE), { ok: false, code: "CHANNEL_NOT_FOUND" });
  assert.deepEqual(await store.update(a.s, bCh, bRule.rule.id, { active: false }), { ok: false, code: "CHANNEL_NOT_FOUND" });
  assert.deepEqual(await store.remove(a.s, bCh, bRule.rule.id), { ok: false, code: "CHANNEL_NOT_FOUND" });
  // B's rule id under A's own channel is just not found.
  assert.deepEqual(await store.update(a.s, aCh, bRule.rule.id, { active: false }), { ok: false, code: "RULE_NOT_FOUND" });
  assert.deepEqual(await store.remove(a.s, aCh, bRule.rule.id), { ok: false, code: "RULE_NOT_FOUND" });
  assert.deepEqual(await store.usage(a.s, bCh, new Date()), { ok: false, code: "CHANNEL_NOT_FOUND" });
  assert.deepEqual(await store.recent(a.s, bCh), { ok: false, code: "CHANNEL_NOT_FOUND" });
  const still = (await pool.query(`SELECT active FROM ${S}.automation_rules WHERE id = $1`, [bRule.rule.id])).rows[0];
  assert.deepEqual(still, { active: true });

  // Even with the gate bypassed, the web role's RLS hides B's rows from A.
  const c = await db.appPool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('kubcode.user_id', $1, true)", [a.s.uid]);
    assert.equal((await c.query(`SELECT 1 FROM ${S}.automation_rules WHERE channel_id = $1`, [bCh])).rowCount, 0);
    assert.equal((await c.query(`UPDATE ${S}.automation_rules SET active = false WHERE id = $1`, [bRule.rule.id])).rowCount, 0);
    await assert.rejects(
      c.query(`INSERT INTO ${S}.automation_rules (channel_id, keywords, dm_text) VALUES ($1, '{x}', 'y')`, [bCh]),
      (e) => pgErrorCode(e) === "42501",
    );
    await c.query("ROLLBACK");
  } finally {
    c.release();
  }
});

// ------------------------------------------------------------ usage + recent

test("usage counts this channel's DMs since the 1st in Asia/Bangkok, only states that spend a DM", async () => {
  const a = await member();
  const ig = await channel(a.workspace);
  const other = await channel(a.workspace);
  const now = new Date("2026-11-10T05:00:00Z");
  await ledger(ig, "2026-10-31T17:00:00Z", "dm_sent"); // 1 Nov 00:00 Bangkok: counts
  await ledger(ig, "2026-10-31T16:59:59Z", "dm_sent"); // 31 Oct 23:59 Bangkok: last month
  await ledger(ig, "2026-11-05T00:00:00Z", "dm_unknown");
  await ledger(ig, "2026-11-05T00:00:01Z", "dm_sending");
  await ledger(ig, "2026-11-05T00:00:02Z", "dm_failed");
  await ledger(ig, "2026-11-05T00:00:03Z", "dm_consumed");
  await ledger(ig, "2026-11-05T00:00:04Z", "claimed");
  await ledger(other, "2026-11-05T00:00:00Z", "dm_sent");
  assert.deepEqual(await store.usage(a.s, ig, now), { ok: true, count: 3 });
  assert.deepEqual(await store.usage(a.s, other, now), { ok: true, count: 1 });
});

test("recent: newest first, at most 20, outcome and status only — the web role cannot read commenter ids", async () => {
  const a = await member();
  const ig = await channel(a.workspace);
  for (let i = 0; i < 22; i++) await comment(ig, new Date(Date.UTC(2026, 10, 9, 0, i)).toISOString(), { outcome: i === 21 ? "duplicate" : "dm_sent" });
  await comment(ig, "2026-11-09T01:00:00Z", { status: "pending", outcome: null, post: "4242" });
  const r = await store.recent(a.s, ig);
  assert.ok(r.ok);
  assert.equal(r.items.length, 20);
  assert.deepEqual(r.items[0], { receivedAt: "2026-11-09T01:00:00.000Z", outcome: null, status: "pending", platformPostId: "4242" });
  assert.deepEqual(r.items[1], { receivedAt: "2026-11-09T00:21:00.000Z", outcome: "duplicate", status: "done", platformPostId: "1789" });
  assert.deepEqual(Object.keys(r.items[0]).sort(), ["outcome", "platformPostId", "receivedAt", "status"]);
  assert.equal((await store.recent(a.s, ig, 5)).ok && (await store.recent(a.s, ig, 5) as any).items.length, 5);

  const c = await db.appPool.connect();
  try {
    for (const sql of [
      `SELECT author_id FROM ${S}.comment_items`,
      `SELECT comment_id FROM ${S}.comment_items`,
      `SELECT * FROM ${S}.comment_items`,
      `SELECT author_id FROM ${S}.dm_ledger`,
      `SELECT comment_item_id FROM ${S}.dm_ledger`,
    ]) {
      await c.query("BEGIN");
      await c.query("SELECT set_config('kubcode.user_id', $1, true)", [a.s.uid]);
      await assert.rejects(c.query(sql), (e) => pgErrorCode(e) === "42501", sql);
      await c.query("ROLLBACK");
    }
  } finally {
    c.release();
  }
});

test("a channel holds at most 50 rules", async () => {
  const a = await member();
  const ig = await channel(a.workspace);
  await pool.query(
    `INSERT INTO ${S}.automation_rules (channel_id, keywords, dm_text, position) SELECT $1, '{k}', 'd', g FROM generate_series(0, 48) g`,
    [ig],
  );
  const last = await store.create(a.s, ig, RULE);
  assert.ok(last.ok);
  assert.equal(last.rule.position, 49);
  assert.deepEqual(await store.create(a.s, ig, RULE), { ok: false, code: "RULE_LIMIT" });
});
