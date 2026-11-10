// Real-PostgreSQL tests for migration 0011 (article stars + comments) and the
// community feed (latest visible comments across pages).
// Run: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { createPool } from "../../lib/accounts/db";
import { loadMigrations, migrate } from "../../lib/accounts/migrate";
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
  store = createPgInteractionStore(db.appPool);
});
after(async () => db?.cleanup());

const ARTICLE = { kind: "article", slug: "style-author-renderer" } as const;
const TOOL = { kind: "tool", slug: "remotion" } as const;
const SKILL = { kind: "skill", slug: "freshstack-what-if" } as const;

async function member(opts: { owner?: boolean; name?: string; email?: string } = {}): Promise<SessionClaims> {
  const n = ++seq;
  const accounts = createPgAccountStore(pool);
  const profile = { provider: "google" as const, subject: `g-cm-${n}`, displayName: opts.name ?? `Member ${n}`, email: opts.email ?? `cm${n}@example.test` };
  const r = await accounts.resolveLogin(profile);
  if (r.status !== "ok") throw new Error("login failed");
  await pool.query(
    "UPDATE kubcode_accounts.users SET created_at = now() - interval '48 hours', is_owner = $2 WHERE id = $1",
    [r.userId, opts.owner ?? false],
  );
  return sessionClaims(accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email }));
}

/** Backdates every comment so the 20 s interval never interferes and order is fixed. */
const ageAll = (seconds: number) =>
  pool.query("UPDATE kubcode_accounts.page_comments SET created_at = created_at - make_interval(secs => $1)", [seconds]);

test("article pages take stars and comments; counts stay per kind", async () => {
  const a = await member();
  const b = await member();
  assert.deepEqual(await store.toggleStar(a, ARTICLE), { ok: true, starred: true, stars: 1 });
  assert.deepEqual(await store.toggleStar(b, ARTICLE), { ok: true, starred: true, stars: 2 });
  await store.toggleStar(a, { kind: "tool", slug: ARTICLE.slug }); // same slug, other kind
  assert.equal((await store.starCounts("article"))[ARTICLE.slug], 2);
  assert.equal((await store.starCounts("tool"))[ARTICLE.slug], 1);
  const c = await store.addComment(a, ARTICLE, "บทความนี้ช่วยได้มาก", null);
  assert.ok(c.ok);
  const reply = await store.addComment(b, ARTICLE, "เห็นด้วย", c.comment.id);
  assert.ok(reply.ok);
  const state = await store.pageState(ARTICLE, b);
  assert.equal(state.stars, 2);
  assert.equal(state.starred, true);
  assert.equal(state.commentCount, 1);
  assert.deepEqual(state.comments.map((x) => x.body), ["บทความนี้ช่วยได้มาก", "เห็นด้วย"]);
  assert.deepEqual(await store.addComment(a, TOOL, "ข้ามชนิด", c.comment.id), { ok: false, code: "NOT_FOUND" });
  await ageAll(3600);
});

test("owner hide and member reports work on article comments", async () => {
  const owner = await member({ owner: true });
  const a = await member();
  const b = await member();
  const c = await store.addComment(a, ARTICLE, "ข้อความที่ต้องซ่อน", null);
  assert.ok(c.ok);
  assert.deepEqual(await store.report(b, c.comment.id), { ok: true });
  assert.equal((await store.pageState(ARTICLE, owner)).comments.find((x) => x.id === c.comment.id)?.reports, 1);
  assert.deepEqual(await store.setHidden(owner, c.comment.id, true), { ok: true });
  assert.equal((await store.pageState(ARTICLE, null)).comments.some((x) => x.id === c.comment.id), false);
  assert.equal((await store.latestComments()).comments.some((x) => x.id === c.comment.id), false);
  assert.deepEqual(await store.setHidden(owner, c.comment.id, false), { ok: true });
  assert.ok((await store.latestComments()).comments.some((x) => x.id === c.comment.id));
  await ageAll(3600);
});

test("other page kinds are still refused by the database", async () => {
  const a = await member();
  await assert.rejects(
    pool.query("INSERT INTO kubcode_accounts.page_stars (user_id, page_kind, page_slug) VALUES ($1, 'page', 'x')", [a.uid]),
    (e: { code?: string }) => e.code === "23514",
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO kubcode_accounts.page_comments (user_id, page_kind, page_slug, body, body_hash) VALUES ($1, 'page', 'x', 'b', sha256('b'::bytea))",
      [a.uid],
    ),
    (e: { code?: string }) => e.code === "23514",
  );
});

test("latest comments: only visible ones, newest first across pages, public name only, cursor pages", async () => {
  // Fresh baseline: everything earlier is older than what this test writes.
  await ageAll(86400);
  const owner = await member({ owner: true });
  const named = await member({ name: "Provider Name", email: "secret-mail@example.test" });
  const other = await member();
  await store.setPublicName(other, "");

  const write = async (s: SessionClaims, page: typeof ARTICLE | typeof TOOL | typeof SKILL, body: string, parent: string | null = null) => {
    const r = await store.addComment(s, page, body, parent);
    assert.ok(r.ok, body);
    await ageAll(60);
    return r.comment.id;
  };
  const t1 = await write(named, ARTICLE, "หนึ่ง");
  const t2 = await write(other, TOOL, "สอง");
  const deleted = await write(named, SKILL, "ลบทิ้ง");
  const hidden = await write(other, ARTICLE, "ซ่อน");
  const replyUnderHidden = await write(named, ARTICLE, "ตอบใต้เธรดที่ซ่อน", hidden);
  const r1 = await write(other, ARTICLE, "ตอบหนึ่ง", t1);
  assert.deepEqual(await store.deleteComment(named, deleted), { ok: true });
  assert.deepEqual(await store.setHidden(owner, hidden, true), { ok: true });

  const feed = await store.latestComments({ limit: 30 });
  const ids = feed.comments.map((c) => c.id);
  for (const gone of [deleted, hidden, replyUnderHidden]) assert.equal(ids.includes(gone), false, "not visible publicly");
  assert.deepEqual(ids.slice(0, 3), [r1, t2, t1], "newest first across kinds");
  const first = feed.comments[0];
  assert.deepEqual(Object.keys(first).sort(), ["author", "body", "createdAt", "id", "isReply", "kind", "slug"]);
  assert.equal(first.isReply, true);
  assert.equal(first.author, "สมาชิก", "an emptied public name shows the fallback");
  assert.equal(feed.comments[2].author, "Provider Name");
  assert.equal(JSON.stringify(feed).includes("secret-mail"), false, "never an email");
  assert.equal(JSON.stringify(feed).includes(named.uid), false, "never a user id");
  assert.deepEqual(feed.comments[2], { ...feed.comments[2], kind: "article", slug: ARTICLE.slug, body: "หนึ่ง", isReply: false });

  // The owner un-hides: the thread and its reply come back.
  assert.deepEqual(await store.setHidden(owner, hidden, false), { ok: true });
  const back = (await store.latestComments()).comments.map((c) => c.id);
  assert.ok(back.includes(hidden) && back.includes(replyUnderHidden));

  // Cursor: pages of 2 walk the whole feed in order without overlap.
  const all = (await store.latestComments({ limit: 30 })).comments.map((c) => c.id);
  const walked: string[] = [];
  let cursor: string | null = null;
  do {
    const page: Awaited<ReturnType<InteractionStore["latestComments"]>> = await store.latestComments({ limit: 2, before: cursor });
    assert.ok(page.comments.length <= 2);
    walked.push(...page.comments.map((c) => c.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(walked, all);
  assert.equal((await store.latestComments({ limit: 500 })).comments.length <= 30, true, "page size is clamped");
});

test("0011 upgrades a database that already has tool and skill rows, keeping them", async () => {
  const name = `kc_it_${randomBytes(6).toString("hex")}_test`;
  const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
  const admin = createPool(base.href, { max: 1 }, {});
  await admin.query(`CREATE DATABASE ${name}`);
  const own = new URL(base.href);
  own.pathname = `/${name}`;
  const p = createPool(own.href, { max: 2 }, {});
  try {
    const all = loadMigrations();
    const upTo10 = all.filter((m) => m.version < "0011");
    await migrate(p, upTo10);
    const u = await p.query<{ id: string }>("INSERT INTO kubcode_accounts.users DEFAULT VALUES RETURNING id");
    const uid = u.rows[0].id;
    await p.query("INSERT INTO kubcode_accounts.page_stars (user_id, page_kind, page_slug) VALUES ($1, 'tool', 'remotion'), ($1, 'skill', 'freshstack-what-if')", [uid]);
    await p.query(
      "INSERT INTO kubcode_accounts.page_comments (user_id, page_kind, page_slug, body, body_hash) VALUES ($1, 'tool', 'remotion', 'เดิม', sha256('เดิม'::bytea))",
      [uid],
    );
    await assert.rejects(
      p.query("INSERT INTO kubcode_accounts.page_stars (user_id, page_kind, page_slug) VALUES ($1, 'article', 'a')", [uid]),
      (e: { code?: string }) => e.code === "23514",
      "before 0011 articles are refused",
    );
    assert.deepEqual((await migrate(p, all)).applied, ["0011_article_interactions"]);
    assert.equal(Number((await p.query("SELECT count(*) AS n FROM kubcode_accounts.page_stars")).rows[0].n), 2);
    assert.equal(Number((await p.query("SELECT count(*) AS n FROM kubcode_accounts.page_comments")).rows[0].n), 1);
    await p.query("INSERT INTO kubcode_accounts.page_stars (user_id, page_kind, page_slug) VALUES ($1, 'article', 'a')", [uid]);
    const cons = await p.query<{ conname: string; convalidated: boolean }>(
      `SELECT conname, convalidated FROM pg_constraint
        WHERE conrelid IN ('kubcode_accounts.page_stars'::regclass, 'kubcode_accounts.page_comments'::regclass)
          AND conname LIKE '%page_kind%' ORDER BY conname`,
    );
    assert.deepEqual(cons.rows, [
      { conname: "page_comments_page_kind_v2_check", convalidated: true },
      { conname: "page_stars_page_kind_v2_check", convalidated: true },
    ]);
  } finally {
    await p.end();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
});
