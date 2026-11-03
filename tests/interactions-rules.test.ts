import { test } from "node:test";
import assert from "node:assert/strict";
import { commentDecision, countLinks, INTERACTION_LIMITS, publicNameDecision, starDecision } from "../lib/interactions/rules";

const base = {
  accountAgeHours: 48,
  secondsSinceLastComment: null as number | null,
  commentsLastHour: 0,
  commentsLastDay: 0,
  duplicateRecent: false,
  body: "ขอบคุณสำหรับบทความ",
};

test("limits live in one config with the PRD values", () => {
  assert.deepEqual(INTERACTION_LIMITS, {
    commentMinIntervalSeconds: 20,
    newAccountHours: 24,
    newAccount: { perHour: 5, perDay: 100, maxLinks: 0 },
    regular: { perHour: 30, perDay: 100, maxLinks: 2 },
    maxCommentChars: 2000,
    duplicateWindowHours: 24,
    starTogglesPerHour: 60,
    maxPublicNameChars: 40,
  });
});

test("a normal comment is allowed", () => {
  assert.deepEqual(commentDecision(base), { ok: true });
});

test("empty, whitespace-only and over-long comments are rejected", () => {
  assert.deepEqual(commentDecision({ ...base, body: "   \n " }), { ok: false, code: "COMMENT_EMPTY" });
  assert.deepEqual(commentDecision({ ...base, body: "ก".repeat(2001) }), { ok: false, code: "COMMENT_TOO_LONG" });
  assert.deepEqual(commentDecision({ ...base, body: "ก".repeat(2000) }), { ok: true });
});

test("comments need 20 seconds between them", () => {
  assert.deepEqual(commentDecision({ ...base, secondsSinceLastComment: 19 }), { ok: false, code: "COMMENT_TOO_SOON" });
  assert.deepEqual(commentDecision({ ...base, secondsSinceLastComment: 20 }), { ok: true });
});

test("new accounts (<24h): at most 5 per hour and no links", () => {
  const fresh = { ...base, accountAgeHours: 3 };
  assert.deepEqual(commentDecision({ ...fresh, commentsLastHour: 5 }), { ok: false, code: "RATE_LIMITED" });
  assert.deepEqual(commentDecision({ ...fresh, commentsLastHour: 4 }), { ok: true });
  assert.deepEqual(commentDecision({ ...fresh, body: "ดู https://example.com" }), { ok: false, code: "COMMENT_LINKS" });
});

test("other accounts: at most 30 per hour, 100 per day, 2 links", () => {
  assert.deepEqual(commentDecision({ ...base, commentsLastHour: 30 }), { ok: false, code: "RATE_LIMITED" });
  assert.deepEqual(commentDecision({ ...base, commentsLastDay: 100 }), { ok: false, code: "RATE_LIMITED" });
  assert.deepEqual(commentDecision({ ...base, body: "https://a.dev https://b.dev" }), { ok: true });
  assert.deepEqual(commentDecision({ ...base, body: "https://a.dev https://b.dev www.c.dev" }), {
    ok: false,
    code: "COMMENT_LINKS",
  });
});

test("duplicate text is blocked", () => {
  assert.deepEqual(commentDecision({ ...base, duplicateRecent: true }), { ok: false, code: "COMMENT_DUPLICATE" });
});

test("links are counted as http(s) URLs and www. hosts", () => {
  assert.equal(countLinks("no links here"), 0);
  assert.equal(countLinks("see https://x.dev/a?b=1 and http://y.dev"), 2);
  assert.equal(countLinks("www.example.com"), 1);
});

test("stars: at most 60 toggles per hour", () => {
  assert.deepEqual(starDecision({ togglesLastHour: 59 }), { ok: true });
  assert.deepEqual(starDecision({ togglesLastHour: 60 }), { ok: false, code: "RATE_LIMITED" });
});

test("public names are trimmed, at most 40 characters, with no links or control characters", () => {
  assert.deepEqual(publicNameDecision("  สมชาย   ใจดี  "), { ok: true, name: "สมชาย ใจดี" });
  assert.deepEqual(publicNameDecision(""), { ok: true, name: "" });
  assert.deepEqual(publicNameDecision("ก".repeat(41)), { ok: false, code: "NAME_INVALID" });
  for (const bad of ["see https://x.dev", "www.spam.com", "buy at spam.com", "tab\tname", "line\nbreak"]) {
    assert.deepEqual(publicNameDecision(bad), { ok: false, code: "NAME_INVALID" }, bad);
  }
});
