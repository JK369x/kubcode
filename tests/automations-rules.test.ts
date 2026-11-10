// Unit tests for the automation rule input (docs/design/ig-comment-dm.md §4.1,
// migration 0010): what the owner's form may send, normalised to what the
// table accepts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RULE_ERROR_MESSAGES, dmHasLink, parseRuleInput, parseRulePatch } from "../lib/automations/rules";

const base = { keywords: ["ลิงก์"], dmText: "นี่ลิงก์ https://kubcode.dev/go/demo" };

test("a minimal rule gets the defaults: contains, all posts, no public reply, after_dm, active", () => {
  assert.deepEqual(parseRuleInput(base), {
    ok: true,
    value: {
      keywords: ["ลิงก์"],
      matchMode: "contains",
      platformPostId: null,
      publicReply: null,
      dmText: "นี่ลิงก์ https://kubcode.dev/go/demo",
      replyPolicy: "after_dm",
      active: true,
    },
  });
});

test("every field is read and normalised", () => {
  const r = parseRuleInput({
    keywords: "  ขอลิงก์ , link\n\nสนใจ ,",
    mode: "exact",
    scope: "17895695668004550",
    publicReply: "  ส่งให้ใน DM แล้วนะ  ",
    dmText: "  ลิงก์ https://kubcode.dev/go/x  ",
    replyPolicy: "always",
    active: false,
  });
  assert.deepEqual(r, {
    ok: true,
    value: {
      keywords: ["ขอลิงก์", "link", "สนใจ"],
      matchMode: "exact",
      platformPostId: "17895695668004550",
      publicReply: "ส่งให้ใน DM แล้วนะ",
      dmText: "ลิงก์ https://kubcode.dev/go/x",
      replyPolicy: "always",
      active: false,
    },
  });
});

test("keywords: array or separated string, trimmed, empties and repeats dropped, 1–20 of at most 100 characters", () => {
  const kw = (keywords: unknown) => parseRuleInput({ ...base, keywords });
  assert.deepEqual((kw([" a ", "", "a", "b"]) as any).value.keywords, ["a", "b"]);
  assert.deepEqual(kw([]), { ok: false, field: "keywords", code: "REQUIRED" });
  assert.deepEqual(kw(" , \n "), { ok: false, field: "keywords", code: "REQUIRED" });
  assert.deepEqual(kw(undefined), { ok: false, field: "keywords", code: "REQUIRED" });
  assert.deepEqual(kw([1]), { ok: false, field: "keywords", code: "INVALID" });
  assert.deepEqual(kw({ a: 1 }), { ok: false, field: "keywords", code: "INVALID" });
  assert.equal(kw(Array.from({ length: 20 }, (_, i) => `k${i}`)).ok, true);
  assert.deepEqual(kw(Array.from({ length: 21 }, (_, i) => `k${i}`)), { ok: false, field: "keywords", code: "TOO_MANY" });
  assert.equal(kw(["ก".repeat(100)]).ok, true);
  assert.deepEqual(kw(["ก".repeat(101)]), { ok: false, field: "keywords", code: "TOO_LONG" });
});

test("mode, scope, reply policy and active accept only their own values", () => {
  const bad = (extra: Record<string, unknown>, field: string) =>
    assert.deepEqual(parseRuleInput({ ...base, ...extra }), { ok: false, field, code: "INVALID" }, JSON.stringify(extra));
  bad({ mode: "word" }, "matchMode");
  bad({ scope: "abc" }, "scope");
  bad({ scope: "123 456" }, "scope");
  bad({ scope: "1".repeat(65) }, "scope");
  bad({ scope: 123 }, "scope");
  bad({ replyPolicy: "never" }, "replyPolicy");
  bad({ active: "true" }, "active");
  assert.equal((parseRuleInput({ ...base, scope: "all" }) as any).value.platformPostId, null);
  assert.equal((parseRuleInput({ ...base, scope: " 1".padEnd(65, "1") }) as any).value.platformPostId, "1".repeat(64));
});

test("texts: DM required (≤1,000), public reply optional (≤2,200), counted in characters like the database", () => {
  const t = (extra: Record<string, unknown>) => parseRuleInput({ ...base, ...extra });
  assert.deepEqual(t({ dmText: "   " }), { ok: false, field: "dmText", code: "REQUIRED" });
  assert.deepEqual(t({ dmText: 5 }), { ok: false, field: "dmText", code: "INVALID" });
  assert.equal(t({ dmText: "😀".repeat(1000) }).ok, true, "emoji are one character each, as char_length counts them");
  assert.deepEqual(t({ dmText: "ก".repeat(1001) }), { ok: false, field: "dmText", code: "TOO_LONG" });
  assert.deepEqual(t({ dmText: "a\u0000b" }), { ok: false, field: "dmText", code: "INVALID" });
  assert.equal((t({ publicReply: "  " }) as any).value.publicReply, null);
  assert.equal((t({ publicReply: null }) as any).value.publicReply, null);
  assert.equal(t({ publicReply: "ก".repeat(2200) }).ok, true);
  assert.deepEqual(t({ publicReply: "ก".repeat(2201) }), { ok: false, field: "publicReply", code: "TOO_LONG" });
});

test("a DM without a link is still accepted; the page only hints", () => {
  assert.equal(parseRuleInput({ ...base, dmText: "ทักมาได้เลย" }).ok, true);
  assert.equal(dmHasLink("ทักมาได้เลย"), false);
  assert.equal(dmHasLink("ดูที่ http://kubcode.dev"), false);
  assert.equal(dmHasLink("ดูที่ https://kubcode.dev/go/demo นะ"), true);
});

test("unknown keys are refused", () => {
  assert.deepEqual(parseRuleInput({ ...base, channelId: "x" }), { ok: false, field: "body", code: "INVALID" });
});

test("patch: any non-empty subset of the fields, each checked the same way", () => {
  assert.deepEqual(parseRulePatch({ active: false }), { ok: true, value: { active: false } });
  assert.deepEqual(parseRulePatch({ keywords: "a, b", scope: "all" }), { ok: true, value: { keywords: ["a", "b"], platformPostId: null } });
  assert.deepEqual(parseRulePatch({ publicReply: "" }), { ok: true, value: { publicReply: null } });
  assert.deepEqual(parseRulePatch({}), { ok: false, field: "body", code: "INVALID" });
  assert.deepEqual(parseRulePatch({ active: 1 }), { ok: false, field: "active", code: "INVALID" });
  assert.deepEqual(parseRulePatch({ dmText: "" }), { ok: false, field: "dmText", code: "REQUIRED" });
  assert.deepEqual(parseRulePatch({ id: "x" }), { ok: false, field: "body", code: "INVALID" });
});

test("every failure has a Thai message", () => {
  for (const [field, codes] of Object.entries(RULE_ERROR_MESSAGES)) {
    for (const message of Object.values(codes)) assert.match(message, /[฀-๿]/, field);
  }
});
