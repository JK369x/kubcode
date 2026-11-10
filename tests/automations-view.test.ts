// View model for /account/channels/<id>/automations (docs/design/ig-comment-dm.md
// §4.6): page states, this month's DM count against the cap, and the last
// outcomes as short Thai labels with no commenter ids.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import { SESSION_COOKIE_NAME } from "../lib/auth-policy";
import type { AutomationStore, RuleView } from "../lib/automations/store";
import { DM_CAP_PER_MONTH, getAutomationsView, outcomeLabel } from "../lib/automations/view";

const ON_ENV = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
  KUBCODE_ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test",
  KUBCODE_PUBLISHING_ENABLED: "true",
  KUBCODE_PUBLISHING_URL: "https://abcdefghij0123456789abcdefghij01.lambda-url.ap-southeast-1.on.aws/",
  KUBCODE_PUBLISHING_HMAC_KEY: "FIXTURE-ONLY-publishing-hmac-key-000000000000",
  KUBCODE_AUTOMATIONS_ENABLED: "true",
});
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CHANNEL = "0b0e8a1e-0000-4000-8000-0000000000c1";
const NOW = new Date("2026-11-10T05:00:00Z");
const RULE: RuleView = {
  id: "7a1b2c3d-0000-4000-8000-0000000000a1",
  keywords: ["ลิงก์"],
  matchMode: "contains",
  platformPostId: null,
  publicReply: null,
  dmText: "https://kubcode.dev/go/demo",
  replyPolicy: "after_dm",
  active: true,
  position: 0,
  updatedAt: "2026-11-10T00:00:00.000Z",
};

const noCookies = async () => ({ get: () => undefined });
async function signedIn() {
  const token = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  const value = await encode({ token, secret: ON_ENV.NEXTAUTH_SECRET });
  return async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME ? { value } : undefined) });
}
const untouchable = new Proxy({}, { get: (_t, k) => () => assert.fail(`store.${String(k)} must not be called`) }) as AutomationStore;
const storeOf = (s: Partial<AutomationStore>) => () => s as AutomationStore;

const ready: Partial<AutomationStore> = {
  rules: async () => ({ ok: true, channel: { id: CHANNEL, displayName: "Lokeek", handle: "lokeekbaebkub" }, rules: [RULE] }),
  usage: async (_s, _c, now) => {
    assert.equal(now.toISOString(), NOW.toISOString());
    return { ok: true, count: 1234 };
  },
  recent: async () => ({
    ok: true,
    items: [
      { receivedAt: "2026-11-10T04:00:00.000Z", outcome: null, status: "pending", platformPostId: "1789" },
      { receivedAt: "2026-11-10T03:00:00.000Z", outcome: "dm_sent", status: "done", platformPostId: "1789" },
    ],
  }),
};

test("states: off and flag-less are disabled, signed out, a bad id or foreign channel not-found", async () => {
  const { KUBCODE_AUTOMATIONS_ENABLED: _flag, ...flagless } = ON_ENV;
  assert.deepEqual(await getAutomationsView(flagless, noCookies, CHANNEL, NOW, storeOf(untouchable)), { state: "disabled" });
  assert.deepEqual(await getAutomationsView({ ...ON_ENV, KUBCODE_PUBLISHING_HMAC_KEY: "x" }, noCookies, CHANNEL, NOW, storeOf(untouchable)), {
    state: "unavailable",
  });
  assert.deepEqual(await getAutomationsView(ON_ENV, noCookies, CHANNEL, NOW, storeOf(untouchable)), { state: "signed-out" });
  assert.deepEqual(await getAutomationsView(ON_ENV, await signedIn(), "nope", NOW, storeOf(untouchable)), { state: "not-found" });
  const missing = storeOf({ rules: async () => ({ ok: false, code: "CHANNEL_NOT_FOUND" }) });
  assert.deepEqual(await getAutomationsView(ON_ENV, await signedIn(), CHANNEL, NOW, missing), { state: "not-found" });
  const forbidden = storeOf({ rules: async () => ({ ok: false, code: "FORBIDDEN" }) });
  assert.deepEqual(await getAutomationsView(ON_ENV, await signedIn(), CHANNEL, NOW, forbidden), { state: "forbidden" });
});

test("ready: channel, rules, DMs this month against 5,000, and labelled outcomes", async () => {
  const view = await getAutomationsView(ON_ENV, await signedIn(), CHANNEL, NOW, storeOf(ready));
  assert.equal(DM_CAP_PER_MONTH, 5000);
  assert.deepEqual(view, {
    state: "ready",
    channel: { id: CHANNEL, displayName: "Lokeek", handle: "lokeekbaebkub" },
    rules: [RULE],
    usage: { count: 1234, cap: 5000 },
    recent: [
      { receivedAt: "2026-11-10T04:00:00.000Z", label: "รอส่ง", platformPostId: "1789" },
      { receivedAt: "2026-11-10T03:00:00.000Z", label: "ส่ง DM แล้ว", platformPostId: "1789" },
    ],
  });
});

test("a database failure is unavailable", async () => {
  const quiet = console.error;
  console.error = () => undefined;
  try {
    const broken = storeOf({ rules: async () => Promise.reject(new Error("boom")) });
    assert.deepEqual(await getAutomationsView(ON_ENV, await signedIn(), CHANNEL, NOW, broken), { state: "unavailable" });
  } finally {
    console.error = quiet;
  }
});

test("every outcome the worker writes has a short Thai label; unknown codes fall back", () => {
  for (const code of ["dm_sent", "dm_failed", "dm_unknown", "dm_consumed", "duplicate", "cap_reached", "too_old", "rule_gone", "no_connection", "no_inbox"]) {
    const label = outcomeLabel(code, "done");
    assert.match(label, /[฀-๿]/, code);
    assert.ok(label.length <= 40, code);
    assert.notEqual(label, outcomeLabel("something_new", "done"), code);
  }
  assert.equal(outcomeLabel("dm_failed_rate_limited", "done"), outcomeLabel("dm_failed", "done"));
  assert.equal(outcomeLabel(null, "pending"), "รอส่ง");
});
