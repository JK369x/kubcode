// Web-host billing (ADR 0008): config, /api/billing/* routes, the connect gate
// and the standing/banner rules, with a fake store and a fake billing Lambda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import { readBillingConfig, PRICE_PER_CHANNEL_SATANG } from "../lib/billing/config";
import { handleBillingCheckout, handleBillingFulfil, type BillingRouteDeps } from "../lib/billing/routes";
import { canConnectAnother, standingAt, type BillingStore, type BillingView } from "../lib/billing/store";
import { handleChannelConnect } from "../lib/channels/routes";
import type { ChannelStore } from "../lib/channels/store";
import { billingOpen } from "../lib/plans";

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
const KEY = "FIXTURE-ONLY-billing-hmac-key-000000000000000000";
const LAMBDA = "https://abcdefghij0123456789abcdefghij01.lambda-url.ap-southeast-1.on.aws/";
const ON = Object.freeze({ ...AUTH_ENV, KUBCODE_BILLING_ENABLED: "true", KUBCODE_BILLING_URL: LAMBDA, KUBCODE_BILLING_HMAC_KEY: KEY, NODE_ENV: "production" });
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CSRF = "C".repeat(43);
const NOW = Date.parse("2026-11-13T05:00:00Z");

const view = (over: Partial<BillingView> = {}): BillingView => ({
  userId: UID,
  exempt: false,
  workspaceId: "0b0e8a1e-0000-4000-8000-0000000000a1",
  slots: 0,
  paidUntil: null,
  standing: "none",
  reminder: null,
  activeChannels: 0,
  pausedChannels: 0,
  purchases: [],
  ...over,
});
const storeOf = (v: BillingView | null): BillingStore => ({ view: async () => v });
const untouchable = new Proxy({}, { get: (_t, k) => () => assert.fail(`store.${String(k)} must not be called`) }) as BillingStore;
const noFetch = (async () => assert.fail("the billing Lambda must not be called")) as typeof fetch;

async function sessionCookie() {
  const token = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  return `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
}

async function post(path: string, body: unknown, opts: { signedIn?: boolean; origin?: string } = {}) {
  const cookies = [`__Host-kubcode-csrf=${CSRF}`];
  if (opts.signedIn !== false) cookies.push(await sessionCookie());
  return new Request(`https://kubcode.dev${path}`, {
    method: "POST",
    headers: {
      host: "kubcode.dev",
      origin: opts.origin ?? "https://kubcode.dev",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "x-kubcode-csrf": CSRF,
      cookie: cookies.join("; "),
    },
    body: JSON.stringify(body),
  });
}

/** A fake Lambda that checks the KUBCODE-HMAC-V1 signature like the Rust side. */
function lambda(answer: (path: string, body: Record<string, unknown>) => unknown, seen: { path: string; body: Record<string, unknown> }[] = []) {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    assert.equal(u.origin + "/", LAMBDA);
    const body = String(init!.body);
    const h = init!.headers as Record<string, string>;
    const sts = `KUBCODE-HMAC-V1\nPOST\n${u.pathname}\n${h["x-kubcode-timestamp"]}\n${h["x-kubcode-nonce"]}\n${createHash("sha256").update(body).digest("hex")}`;
    assert.equal(h["x-kubcode-signature"], createHmac("sha256", KEY).update(sts).digest("hex"), "signed like the Rust verifier expects");
    const parsed = JSON.parse(body);
    seen.push({ path: u.pathname, body: parsed });
    return Response.json(answer(u.pathname, parsed));
  }) as typeof fetch;
}

const deps = (over: Partial<BillingRouteDeps> = {}): BillingRouteDeps => ({ env: ON, now: () => NOW, storeFor: () => storeOf(view()), fetch: noFetch, ...over });

test("config: off unless the flag is exactly true; broken without a Lambda URL and a 32-byte key", () => {
  assert.equal(readBillingConfig({}).mode, "off");
  assert.equal(readBillingConfig({ KUBCODE_BILLING_ENABLED: "1" }).mode, "off");
  assert.equal(readBillingConfig({ KUBCODE_BILLING_ENABLED: "true" }).mode, "broken");
  assert.equal(readBillingConfig({ ...ON, KUBCODE_BILLING_HMAC_KEY: "short" }).mode, "broken");
  assert.equal(readBillingConfig({ ...ON, KUBCODE_BILLING_URL: "http://127.0.0.1:3091/" }).mode, "broken", "no loopback in production");
  assert.equal(readBillingConfig({ ...ON, NODE_ENV: "development", KUBCODE_BILLING_URL: "http://127.0.0.1:3091/" }).mode, "on");
  assert.equal(readBillingConfig(ON).mode, "on");
  assert.equal(PRICE_PER_CHANNEL_SATANG, 28_900);
  assert.equal(billingOpen({}), false, "the pricing CTA stays off by default");
  assert.equal(billingOpen({ KUBCODE_BILLING_ENABLED: "true" }), false, "flag alone is not enough");
  assert.equal(billingOpen(ON), true);
});

test("checkout: off → 404 without touching anything; guards before the Lambda", async () => {
  let r = await handleBillingCheckout(await post("/api/billing/checkout", { kind: "new", slots: 1 }), deps({ env: AUTH_ENV, storeFor: () => untouchable }));
  assert.equal(r.status, 404);
  r = await handleBillingCheckout(await post("/api/billing/checkout", { kind: "new", slots: 1 }, { origin: "https://evil.example" }), deps({ storeFor: () => untouchable }));
  assert.equal(r.status, 403);
  for (const body of [{ kind: "renew", slots: 1 }, { kind: "new", slots: 0 }, { kind: "new", slots: 51 }, { kind: "new", slots: 1.5 }, { kind: "new", slots: 1, amount: 1 }]) {
    r = await handleBillingCheckout(await post("/api/billing/checkout", body), deps({ storeFor: () => untouchable }));
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  r = await handleBillingCheckout(await post("/api/billing/checkout", { kind: "new", slots: 1 }, { signedIn: false }), deps({ storeFor: () => untouchable }));
  assert.equal(r.status, 401);
});

test("checkout: signs the call with the member's own user id and returns only a Stripe Checkout URL", async () => {
  const seen: { path: string; body: Record<string, unknown> }[] = [];
  const ok = lambda(() => ({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_abc#x" }), seen);
  const r = await handleBillingCheckout(await post("/api/billing/checkout", { kind: "new", slots: 3 }), deps({ fetch: ok }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_abc#x" });
  assert.deepEqual(seen, [{ path: "/api/checkout", body: { user_id: UID, kind: "new", slots: 3 } }]);
  for (const url of ["https://evil.example/pay", "http://checkout.stripe.com/x", "javascript:alert(1)", ""]) {
    const bad = await handleBillingCheckout(await post("/api/billing/checkout", { kind: "new", slots: 1 }), deps({ fetch: lambda(() => ({ ok: true, url })) }));
    assert.equal(bad.status, 503, url);
  }
});

test("checkout: Lambda refusals map to Thai messages; the owner never pays", async () => {
  const r = await handleBillingCheckout(await post("/api/billing/checkout", { kind: "add", slots: 1 }), deps({ fetch: lambda(() => ({ ok: false, code: "no_active_pass" })) }));
  assert.equal(r.status, 409);
  assert.match((await r.json()).message, /ยังไม่มีแพ็กเกจ/);
  const down = await handleBillingCheckout(await post("/api/billing/checkout", { kind: "new", slots: 1 }), deps({ fetch: (async () => new Response("", { status: 503 })) as typeof fetch }));
  assert.equal(down.status, 503);
  const owner = await handleBillingCheckout(await post("/api/billing/checkout", { kind: "new", slots: 1 }), deps({ storeFor: () => storeOf(view({ exempt: true })) }));
  assert.equal(owner.status, 409);
});

test("fulfil: only a well-formed session id is forwarded, with the member's id; the result is a fixed code", async () => {
  const seen: { path: string; body: Record<string, unknown> }[] = [];
  const f = lambda(() => ({ ok: true, result: "granted", entitlement: { slots: 2 } }), seen);
  const r = await handleBillingFulfil(await post("/api/billing/fulfil", { session_id: "cs_test_abc123" }), deps({ fetch: f }));
  assert.deepEqual(await r.json(), { ok: true, result: "granted" });
  assert.deepEqual(seen[0], { path: "/api/fulfil", body: { user_id: UID, session_id: "cs_test_abc123" } });
  for (const sid of ["cs_test_", "pi_123", "cs_test_abc/../x", "x".repeat(300)]) {
    const bad = await handleBillingFulfil(await post("/api/billing/fulfil", { session_id: sid }), deps({ storeFor: () => untouchable }));
    assert.equal(bad.status, 400, sid);
  }
  const odd = await handleBillingFulfil(await post("/api/billing/fulfil", { session_id: "cs_test_abc" }), deps({ fetch: lambda(() => ({ ok: true, result: "<script>" })) }));
  assert.equal((await odd.json()).result, "unknown");
});

test("standing and banner follow paid_until: 7/3/0 days, 3-day grace, then paused", () => {
  const at = (iso: string) => standingAt(new Date("2026-12-13T05:00:00Z"), 2, new Date(iso));
  assert.deepEqual(at("2026-11-20T05:00:00Z"), { standing: "active", reminder: null, usable: 2 });
  assert.equal(at("2026-12-06T05:00:00Z").reminder, "t7");
  assert.equal(at("2026-12-10T05:00:00Z").reminder, "t3");
  assert.equal(at("2026-12-13T00:00:00Z").reminder, "t0");
  assert.deepEqual(at("2026-12-14T05:00:00Z"), { standing: "grace", reminder: "grace", usable: 2 });
  assert.deepEqual(at("2026-12-16T05:00:00Z"), { standing: "lapsed", reminder: "paused", usable: 0 });
  assert.deepEqual(standingAt(null, 0, new Date()), { standing: "none", reminder: null, usable: 0 });
});

test("connect gate: channels ≤ paid slots; grace still counts; owner exempt", () => {
  const now = new Date(NOW);
  const until = "2026-12-13T05:00:00Z";
  assert.equal(canConnectAnother(view(), now), false, "no pass, no new channel");
  assert.equal(canConnectAnother(view({ slots: 2, paidUntil: until, activeChannels: 1 }), now), true);
  assert.equal(canConnectAnother(view({ slots: 2, paidUntil: until, activeChannels: 2 }), now), false);
  assert.equal(canConnectAnother(view({ slots: 2, paidUntil: until, activeChannels: 1 }), new Date("2026-12-14T05:00:00Z")), true, "grace");
  assert.equal(canConnectAnother(view({ slots: 2, paidUntil: until, activeChannels: 0 }), new Date("2026-12-17T05:00:00Z")), false, "lapsed");
  assert.equal(canConnectAnother(view({ exempt: true, activeChannels: 40 }), now), true);
});

test("channel connect: with billing on, a full workspace gets 402 before the publishing Lambda is called", async () => {
  const pubEnv = {
    ...ON,
    KUBCODE_PUBLISHING_ENABLED: "true",
    KUBCODE_PUBLISHING_URL: "https://abcdefghij0123456789abcdefghij02.lambda-url.ap-southeast-1.on.aws/",
    KUBCODE_PUBLISHING_HMAC_KEY: "FIXTURE-ONLY-publishing-hmac-key-000000000000",
  };
  const member: Partial<ChannelStore> = { member: async () => ({ ok: true, userId: UID }) };
  const full = view({ slots: 1, paidUntil: "2026-12-13T05:00:00Z", activeChannels: 1 });
  const r = await handleChannelConnect(await post("/api/channels/connect", { platform: "tiktok" }), {
    env: pubEnv,
    now: () => NOW,
    storeFor: () => member as ChannelStore,
    billingStoreFor: () => storeOf(full),
    fetch: (async () => assert.fail("publishing Lambda must not be called")) as typeof fetch,
  });
  assert.equal(r.status, 402);
  assert.match((await r.json()).message, /ซื้อช่องเพิ่ม/);
  // Billing off: the gate is skipped (today's owner-only beta keeps working).
  const { KUBCODE_BILLING_ENABLED: _f, ...noBilling } = pubEnv;
  let called = false;
  await handleChannelConnect(await post("/api/channels/connect", { platform: "tiktok" }), {
    env: noBilling,
    now: () => NOW,
    storeFor: () => member as ChannelStore,
    billingStoreFor: () => untouchable,
    fetch: (async () => {
      called = true;
      return Response.json({ ok: false });
    }) as typeof fetch,
  });
  assert.ok(called);
});
