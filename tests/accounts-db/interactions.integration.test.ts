// Real-PostgreSQL tests for stars, comments, reports and owner hide.
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { createPgInteractionStore, type InteractionStore } from "../../lib/interactions/store";
import { throwawayDb, type ThrowawayDb } from "./harness";

let db: ThrowawayDb;
let pool: Pool;
let store: InteractionStore;
let seq = 0;

before(async () => {
  db = await throwawayDb();
  pool = db.pool;
  // The store under test runs as the runtime role, like production.
  store = createPgInteractionStore(db.appPool);
});
after(async () => db?.cleanup());

const TOOL = { kind: "tool", slug: "remotion" } as const;
const SKILL = { kind: "skill", slug: "freshstack-what-if" } as const;

/** A fictional signed-in member; ageHours backdates the account. */
async function member(opts: { ageHours?: number; owner?: boolean; name?: string } = {}): Promise<SessionClaims> {
  const n = ++seq;
  const accounts = createPgAccountStore(pool);
  const profile = { provider: "google" as const, subject: `g-kb-${n}`, displayName: opts.name ?? `Member ${n}`, email: `kb${n}@example.test` };
  const r = await accounts.resolveLogin(profile);
  if (r.status !== "ok") throw new Error("login failed");
  await pool.query(
    "UPDATE kubcode_accounts.users SET created_at = now() - make_interval(hours => $2), is_owner = $3 WHERE id = $1",
    [r.userId, opts.ageHours ?? 48, opts.owner ?? false],
  );
  return sessionClaims(accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email }));
}

/** Moves a user's recent activity into the past so interval rules don't interfere. */
async function age(s: SessionClaims, seconds: number) {
  await pool.query(
    "UPDATE kubcode_accounts.page_comments SET created_at = created_at - make_interval(secs => $2) WHERE user_id = $1",
    [s.uid, seconds],
  );
}

test("stars toggle on and off per user and the public count follows", async () => {
  const a = await member();
  const b = await member();
  assert.deepEqual(await store.toggleStar(a, TOOL), { ok: true, starred: true, stars: 1 });
  assert.deepEqual(await store.toggleStar(b, TOOL), { ok: true, starred: true, stars: 2 });
  assert.deepEqual(await store.toggleStar(a, TOOL), { ok: true, starred: false, stars: 1 });
  const anon = await store.pageState(TOOL, null);
  assert.equal(anon.stars, 1);
  assert.equal(anon.starred, false);
  assert.equal((await store.pageState(TOOL, b)).starred, true);
});

test("star counts group by page within one kind, for the tool index", async () => {
  const a = await member();
  const b = await member();
  const FFMPEG = { kind: "tool", slug: "ffmpeg" } as const;
  const before = await store.starCounts("tool");
  await store.toggleStar(a, FFMPEG);
  await store.toggleStar(b, FFMPEG);
  await store.toggleStar(a, SKILL);
  const counts = await store.starCounts("tool");
  assert.equal(counts.ffmpeg, (before.ffmpeg ?? 0) + 2);
  assert.equal(counts["freshstack-what-if"], undefined, "skill stars are not tool stars");
  assert.equal((await store.starCounts("skill"))["freshstack-what-if"] >= 1, true);
});

test("a stale or foreign session cannot write", async () => {
  const a = await member();
  const stale = { ...a, sv: a.sv + 1 };
  assert.deepEqual(await store.toggleStar(stale, SKILL), { ok: false, code: "NOT_SIGNED_IN" });
  assert.deepEqual(await store.toggleStar({ ...a, sub: "someone-else" }, SKILL), { ok: false, code: "NOT_SIGNED_IN" });
  assert.deepEqual(await store.addComment(stale, SKILL, "สวัสดี", null), { ok: false, code: "NOT_SIGNED_IN" });
});

test("star toggles are limited to 60 per hour, even across unstarring", async () => {
  const a = await member();
  await pool.query(
    "INSERT INTO kubcode_accounts.star_toggles (user_id) SELECT $1 FROM generate_series(1, 60)",
    [a.uid],
  );
  assert.deepEqual(await store.toggleStar(a, SKILL), { ok: false, code: "RATE_LIMITED" });
});

test("comments publish immediately with the author's display name, one reply level", async () => {
  const a = await member({ name: "Fixture Author" });
  const b = await member();
  const top = await store.addComment(a, TOOL, "  ใช้ Remotion  ทำคลิปได้ดีมาก  ", null);
  assert.ok(top.ok);
  const reply = await store.addComment(b, TOOL, "เห็นด้วยครับ", top.comment.id);
  assert.ok(reply.ok);
  assert.deepEqual(await store.addComment(a, TOOL, "ตอบซ้อนอีกชั้น", reply.comment.id), { ok: false, code: "REPLY_DEPTH" });
  assert.deepEqual(await store.addComment(a, SKILL, "ข้ามหน้า", top.comment.id), { ok: false, code: "NOT_FOUND" });

  const state = await store.pageState(TOOL, null);
  const shown = state.comments.find((c) => c.id === top.comment.id)!;
  assert.equal(shown.body, "ใช้ Remotion ทำคลิปได้ดีมาก");
  assert.equal(shown.author, "Fixture Author");
  assert.equal(shown.mine, false);
  assert.equal(state.comments.find((c) => c.id === reply.comment.id)?.parentId, top.comment.id);
});

test("comment limits are enforced from the database", async () => {
  const a = await member();
  assert.ok((await store.addComment(a, SKILL, "ข้อความแรก", null)).ok);
  assert.deepEqual(await store.addComment(a, SKILL, "เร็วเกินไป", null), { ok: false, code: "COMMENT_TOO_SOON" });
  await age(a, 30);
  assert.deepEqual(await store.addComment(a, SKILL, "ข้อความแรก", null), { ok: false, code: "COMMENT_DUPLICATE" });
  await pool.query(
    `INSERT INTO kubcode_accounts.page_comments (user_id, page_kind, page_slug, body, body_hash, created_at)
     SELECT $1, 'skill', 'freshstack-what-if', 'fill ' || g, sha256(('fill ' || g)::bytea), now() - interval '10 minutes'
       FROM generate_series(1, 29) g`,
    [a.uid],
  );
  assert.deepEqual(await store.addComment(a, SKILL, "เกินชั่วโมงละ 30", null), { ok: false, code: "RATE_LIMITED" });

  const fresh = await member({ ageHours: 2 });
  assert.deepEqual(await store.addComment(fresh, SKILL, "ดู https://example.com", null), { ok: false, code: "COMMENT_LINKS" });
});

test("authors edit and delete their own comments only", async () => {
  const a = await member();
  const b = await member();
  const c = await store.addComment(a, TOOL, "ก่อนแก้", null);
  assert.ok(c.ok);
  assert.deepEqual(await store.editComment(b, c.comment.id, "แก้ของคนอื่น"), { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(await store.editComment(a, c.comment.id, "หลังแก้"), { ok: true });
  let shown = (await store.pageState(TOOL, a)).comments.find((x) => x.id === c.comment.id)!;
  assert.equal(shown.body, "หลังแก้");
  assert.equal(shown.mine, true);
  assert.ok(shown.editedAt);
  assert.deepEqual(await store.deleteComment(b, c.comment.id), { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(await store.deleteComment(a, c.comment.id), { ok: true });
  shown = (await store.pageState(TOOL, a)).comments.find((x) => x.id === c.comment.id)!;
  assert.equal(shown, undefined, "a deleted comment without replies disappears");
  const row = await pool.query("SELECT body, body_hash, status FROM kubcode_accounts.page_comments WHERE id = $1", [c.comment.id]);
  assert.deepEqual(row.rows[0], { body: null, body_hash: null, status: "deleted" });
});

test("only the owner can hide; hidden comments vanish for everyone else", async () => {
  const owner = await member({ owner: true });
  const a = await member();
  const c = await store.addComment(a, SKILL, "สแปม", null);
  assert.ok(c.ok);
  assert.deepEqual(await store.setHidden(a, c.comment.id, true), { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(await store.setHidden(owner, c.comment.id, true), { ok: true });
  assert.equal((await store.pageState(SKILL, null)).comments.some((x) => x.id === c.comment.id), false);
  assert.equal((await store.pageState(SKILL, a)).comments.some((x) => x.id === c.comment.id), false);
  const forOwner = (await store.pageState(SKILL, owner)).comments.find((x) => x.id === c.comment.id);
  assert.equal(forOwner?.hidden, true);
  assert.equal((await store.pageState(SKILL, owner)).viewer.isOwner, true);
  assert.deepEqual(await store.setHidden(owner, c.comment.id, false), { ok: true });
  assert.ok((await store.pageState(SKILL, null)).comments.some((x) => x.id === c.comment.id));
});

test("members report others' comments once; the owner sees the report count", async () => {
  const owner = await member({ owner: true });
  const a = await member();
  const b = await member();
  const c = await store.addComment(a, TOOL, "ข้อความที่ถูกรายงาน", null);
  assert.ok(c.ok);
  assert.deepEqual(await store.report(a, c.comment.id), { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(await store.report(b, c.comment.id), { ok: true });
  assert.deepEqual(await store.report(b, c.comment.id), { ok: true }, "repeat report is idempotent");
  const forOwner = (await store.pageState(TOOL, owner)).comments.find((x) => x.id === c.comment.id);
  assert.equal(forOwner?.reports, 1);
  const forPublic = (await store.pageState(TOOL, null)).comments.find((x) => x.id === c.comment.id);
  assert.equal(forPublic?.reports, undefined);
});

test("the runtime role cannot hard-delete comments, rewrite reports or read the migration ledger", async () => {
  const c = await db.appPool.connect();
  try {
    for (const sql of [
      "DELETE FROM kubcode_accounts.page_comments",
      "UPDATE kubcode_accounts.comment_reports SET created_at = now()",
      "UPDATE kubcode_accounts.star_toggles SET created_at = now()",
      "TRUNCATE kubcode_accounts.page_stars",
      "SELECT 1 FROM kubcode_accounts.schema_migrations",
    ]) {
      await assert.rejects(c.query(sql), (e: { code?: string }) => e.code === "42501", sql);
    }
  } finally {
    c.release();
  }
});

test("the public name starts as the provider name, is editable, and an empty name shows the fallback", async () => {
  const a = await member({ name: "Provider Name" });
  assert.deepEqual(await store.profile(a), { ok: true, publicName: "Provider Name" });
  const c = await store.addComment(a, TOOL, "ชื่อที่แสดง", null);
  assert.ok(c.ok);
  const author = async () => (await store.pageState(TOOL, null)).comments.find((x) => x.id === c.comment.id)?.author;
  assert.equal(await author(), "Provider Name");

  assert.deepEqual(await store.setPublicName(a, "  JK  Studio "), { ok: true, publicName: "JK Studio" });
  assert.equal(await author(), "JK Studio");
  assert.deepEqual(await store.profile(a), { ok: true, publicName: "JK Studio" });

  assert.deepEqual(await store.setPublicName(a, "spam.com"), { ok: false, code: "NAME_INVALID" });
  assert.deepEqual(await store.setPublicName(a, ""), { ok: true, publicName: "" });
  assert.equal(await author(), "สมาชิก");
  assert.deepEqual(await store.setPublicName({ ...a, sv: a.sv + 1 }, "x"), { ok: false, code: "NOT_SIGNED_IN" });
});

test("a hidden comment stays moderated: its author cannot edit it, and deleting it never resurfaces the thread", async () => {
  const owner = await member({ owner: true });
  const a = await member();
  const b = await member();
  const top = await store.addComment(a, SKILL, "เธรดที่ถูกซ่อน", null);
  assert.ok(top.ok);
  const reply = await store.addComment(b, SKILL, "คำตอบในเธรด", top.comment.id);
  assert.ok(reply.ok);
  assert.deepEqual(await store.setHidden(owner, top.comment.id, true), { ok: true });
  assert.deepEqual(await store.editComment(a, top.comment.id, "แอบแก้"), { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(await store.deleteComment(a, top.comment.id), { ok: true });
  const shown = (await store.pageState(SKILL, null)).comments.map((c) => c.id);
  assert.equal(shown.includes(top.comment.id), false);
  assert.equal(shown.includes(reply.comment.id), false);
});

test("comments page newest thread first with a cursor; replies ride with their thread; total counts threads", async () => {
  const PAGE = { kind: "skill", slug: "thai-survival" } as const;
  const a = await member();
  const b = await member();
  const ids: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const c = await store.addComment(a, PAGE, `เธรดที่ ${i}`, null);
    assert.ok(c.ok);
    ids.push(c.comment.id);
    await age(a, 60); // keep the 20 s interval out of the way and order deterministic
  }
  const reply = await store.addComment(b, PAGE, "ตอบเธรดแรก", ids[0]);
  assert.ok(reply.ok);

  const first = await store.pageState(PAGE, null, { limit: 2 });
  assert.equal(first.commentCount, 5);
  const tops = (s: typeof first) => s.comments.filter((c) => c.parentId === null).map((c) => c.body);
  assert.deepEqual(tops(first), ["เธรดที่ 5", "เธรดที่ 4"]);
  assert.ok(first.nextCursor);

  const second = await store.pageState(PAGE, null, { limit: 2, before: first.nextCursor });
  assert.deepEqual(tops(second), ["เธรดที่ 3", "เธรดที่ 2"]);
  const last = await store.pageState(PAGE, null, { limit: 2, before: second.nextCursor });
  assert.deepEqual(tops(last), ["เธรดที่ 1"]);
  assert.equal(last.nextCursor, null);
  assert.deepEqual(
    last.comments.filter((c) => c.parentId === ids[0]).map((c) => c.body),
    ["ตอบเธรดแรก"],
    "replies come with their thread",
  );
});
