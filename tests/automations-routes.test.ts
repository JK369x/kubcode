// Route tests for the owner's automation rules (docs/design/ig-comment-dm.md
// §4.6): POST /api/channels/{id}/automations, PATCH and DELETE
// /api/channels/{id}/automations/{ruleId}, with a fake store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import { automationsEnabled, readAutomationsConfig } from "../lib/automations/config";
import { handleRuleCreate, handleRuleDelete, handleRuleUpdate, type AutomationRouteDeps } from "../lib/automations/routes";
import type { AutomationStore, RuleView } from "../lib/automations/store";

const AUTH_ENV = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
  KUBCODE_ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test",
});
const PUBLISHING_ENV = Object.freeze({
  ...AUTH_ENV,
  KUBCODE_PUBLISHING_ENABLED: "true",
  KUBCODE_PUBLISHING_URL: "https://abcdefghij0123456789abcdefghij01.lambda-url.ap-southeast-1.on.aws/",
  KUBCODE_PUBLISHING_HMAC_KEY: "FIXTURE-ONLY-publishing-hmac-key-000000000000",
});
const ON_ENV = Object.freeze({ ...PUBLISHING_ENV, KUBCODE_AUTOMATIONS_ENABLED: "true" });
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CSRF = "C".repeat(43);
const CHANNEL = "0b0e8a1e-0000-4000-8000-0000000000c1";
const RULE_ID = "7a1b2c3d-0000-4000-8000-0000000000a1";
const BODY = { keywords: "ลิงก์, link", scope: "all", publicReply: "ส่งให้ใน DM แล้วนะ", dmText: "https://kubcode.dev/go/demo", replyPolicy: "after_dm" };

const VIEW: RuleView = {
  id: RULE_ID,
  keywords: ["ลิงก์", "link"],
  matchMode: "contains",
  platformPostId: null,
  publicReply: "ส่งให้ใน DM แล้วนะ",
  dmText: "https://kubcode.dev/go/demo",
  replyPolicy: "after_dm",
  active: true,
  position: 0,
  updatedAt: "2026-11-10T00:00:00.000Z",
};

const untouchable = new Proxy({}, { get: (_t, k) => () => assert.fail(`store.${String(k)} must not be called`) }) as AutomationStore;

async function sessionCookie() {
  const token = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  return `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
}

async function req(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown, opts: { origin?: string; signedIn?: boolean; csrf?: string } = {}) {
  const cookies = [`__Host-kubcode-csrf=${CSRF}`];
  if (opts.signedIn !== false) cookies.push(await sessionCookie());
  const headers: Record<string, string> = {
    host: "kubcode.dev",
    origin: opts.origin ?? "https://kubcode.dev",
    "sec-fetch-site": "same-origin",
    "x-kubcode-csrf": opts.csrf ?? CSRF,
    cookie: cookies.join("; "),
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`https://kubcode.dev${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const deps = (store: Partial<AutomationStore>, extra: Partial<AutomationRouteDeps> = {}): AutomationRouteDeps => ({
  env: ON_ENV,
  storeFor: () => store as AutomationStore,
  ...extra,
});

const create = async (body: unknown, store: Partial<AutomationStore>, opts: Parameters<typeof req>[3] = {}, channel = CHANNEL, extra: Partial<AutomationRouteDeps> = {}) =>
  handleRuleCreate(await req("POST", `/api/channels/${channel}/automations`, body, opts), channel, deps(store, extra));

// ------------------------------------------------------------ config

test("automations config: on only when the flag is exactly true and publishing is on", () => {
  assert.deepEqual(readAutomationsConfig(PUBLISHING_ENV), { mode: "off" });
  assert.deepEqual(readAutomationsConfig({ ...ON_ENV, KUBCODE_AUTOMATIONS_ENABLED: "1" }), { mode: "off" });
  assert.deepEqual(readAutomationsConfig({ ...AUTH_ENV, KUBCODE_AUTOMATIONS_ENABLED: "true" }), { mode: "off" }, "publishing off");
  assert.deepEqual(readAutomationsConfig({ ...ON_ENV, KUBCODE_PUBLISHING_HMAC_KEY: "short" }), { mode: "broken" });
  assert.deepEqual(readAutomationsConfig(ON_ENV), { mode: "on" });
  assert.equal(automationsEnabled(ON_ENV), true);
  assert.equal(automationsEnabled({ ...ON_ENV, KUBCODE_PUBLISHING_HMAC_KEY: "short" }), false);
  assert.equal(automationsEnabled(PUBLISHING_ENV), false);
});

// ------------------------------------------------------------ guards

test("off is 404 NOT_FOUND_FEATURE; broken publishing or accounts off is 503; nothing reaches the store", async () => {
  for (const env of [PUBLISHING_ENV, AUTH_ENV]) {
    const res = await create(BODY, untouchable, {}, CHANNEL, { env });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, "NOT_FOUND_FEATURE");
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
  assert.equal((await create(BODY, untouchable, {}, CHANNEL, { env: { ...ON_ENV, KUBCODE_PUBLISHING_HMAC_KEY: "short" } })).status, 503);
  assert.equal((await create(BODY, untouchable, {}, CHANNEL, { env: { ...ON_ENV, KUBCODE_ACCOUNTS_ENABLED: "false" } })).status, 503);
});

test("bad ids, origin, CSRF, body or session never reach the store", async () => {
  assert.equal((await create(BODY, untouchable, {}, "not-a-uuid")).status, 400);
  assert.equal((await create(BODY, untouchable, { origin: "https://evil.example" })).status, 403);
  assert.equal((await create(BODY, untouchable, { csrf: "D".repeat(43) })).status, 403);
  assert.equal((await create({ ...BODY, dmText: "x".repeat(9000) }, untouchable)).status, 413, "body over 8 KB");
  assert.equal((await create(BODY, untouchable, { signedIn: false })).status, 401);
  const patch = await handleRuleUpdate(await req("PATCH", `/api/channels/${CHANNEL}/automations/x`, { active: false }), CHANNEL, "x", deps(untouchable));
  assert.equal(patch.status, 400);
  const del = await handleRuleDelete(await req("DELETE", `/api/channels/${CHANNEL}/automations/x`), CHANNEL, "x", deps(untouchable));
  assert.equal(del.status, 400);
});

test("an invalid rule is 400 INVALID_RULE with the field and a Thai message", async () => {
  const res = await create({ ...BODY, keywords: [] }, untouchable);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.deepEqual([body.code, body.field], ["INVALID_RULE", "keywords"]);
  assert.match(body.message, /คีย์เวิร์ด/);
  const scope = await (await create({ ...BODY, scope: "https://instagram.com/p/x" }, untouchable)).json();
  assert.equal(scope.field, "scope");
});

test("a member who may not publish gets 403", async () => {
  const res = await create(BODY, { create: async () => ({ ok: false, code: "FORBIDDEN" }) });
  assert.equal(res.status, 403);
});

// ------------------------------------------------------------ create / update / delete

test("create: passes the normalised rule for the channel and answers {ok, rule}", async () => {
  const seen: unknown[] = [];
  const res = await create(BODY, {
    create: async (s, channelId, input) => {
      seen.push([s.uid, channelId, input]);
      return { ok: true, rule: VIEW };
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { ok: true, rule: VIEW });
  assert.deepEqual(seen, [
    [
      UID,
      CHANNEL,
      {
        keywords: ["ลิงก์", "link"],
        matchMode: "contains",
        platformPostId: null,
        publicReply: "ส่งให้ใน DM แล้วนะ",
        dmText: "https://kubcode.dev/go/demo",
        replyPolicy: "after_dm",
        active: true,
      },
    ],
  ]);
});

test("create: a missing channel is 404, a full channel 409, a database failure 503", async () => {
  const notFound = await create(BODY, { create: async () => ({ ok: false, code: "CHANNEL_NOT_FOUND" }) });
  assert.equal(notFound.status, 404);
  assert.match((await notFound.json()).message, /ช่อง/);
  assert.equal((await create(BODY, { create: async () => ({ ok: false, code: "RULE_LIMIT" }) })).status, 409);
  const quiet = console.error;
  console.error = () => undefined;
  try {
    assert.equal((await create(BODY, { create: async () => Promise.reject(new Error("boom")) })).status, 503);
  } finally {
    console.error = quiet;
  }
});

test("update: pause/resume with {active}, or edit fields; a missing rule is 404", async () => {
  const seen: unknown[] = [];
  const store: Partial<AutomationStore> = {
    update: async (_s, channelId, ruleId, patch) => {
      seen.push([channelId, ruleId, patch]);
      return ruleId === RULE_ID ? { ok: true, rule: { ...VIEW, active: false } } : { ok: false, code: "RULE_NOT_FOUND" };
    },
  };
  const path = `/api/channels/${CHANNEL}/automations/${RULE_ID}`;
  const res = await handleRuleUpdate(await req("PATCH", path, { active: false }), CHANNEL, RULE_ID, deps(store));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).rule.active, false);
  await handleRuleUpdate(await req("PATCH", path, { keywords: ["x"], publicReply: "" }), CHANNEL, RULE_ID, deps(store));
  assert.deepEqual(seen, [
    [CHANNEL, RULE_ID, { active: false }],
    [CHANNEL, RULE_ID, { keywords: ["x"], publicReply: null }],
  ]);
  assert.equal((await handleRuleUpdate(await req("PATCH", path, {}), CHANNEL, RULE_ID, deps(untouchable))).status, 400);
  const other = "7a1b2c3d-0000-4000-8000-0000000000a2";
  assert.equal((await handleRuleUpdate(await req("PATCH", path, { active: true }), CHANNEL, other, deps(store))).status, 404);
});

test("delete: needs no body, answers {ok}; a missing rule is 404", async () => {
  const path = `/api/channels/${CHANNEL}/automations/${RULE_ID}`;
  const store: Partial<AutomationStore> = {
    remove: async (_s, channelId, ruleId) => (channelId === CHANNEL && ruleId === RULE_ID ? { ok: true } : { ok: false, code: "RULE_NOT_FOUND" }),
  };
  const res = await handleRuleDelete(await req("DELETE", path), CHANNEL, RULE_ID, deps(store));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const other = "7a1b2c3d-0000-4000-8000-0000000000a2";
  assert.equal((await handleRuleDelete(await req("DELETE", path), CHANNEL, other, deps(store))).status, 404);
  assert.equal((await handleRuleDelete(await req("DELETE", path, undefined, { origin: "https://evil.example" }), CHANNEL, RULE_ID, deps(untouchable))).status, 403);
});
