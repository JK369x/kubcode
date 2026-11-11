// The post picker's route (GET /api/channels/{id}/posts): flag, session and
// member gates, the signed Lambda call, and what is let through to the page.
// Fixtures follow Zernio's GET /v1/accounts/{accountId}/posts example as the
// Lambda shapes it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import { handleChannelPosts, pickerPost } from "../lib/automations/posts";
import type { ChannelRouteDeps } from "../lib/channels/routes";
import type { ChannelStore } from "../lib/channels/store";

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
const HMAC_KEY = "FIXTURE-ONLY-publishing-hmac-key-000000000000";
const LAMBDA = "https://abcdefghij0123456789abcdefghij01.lambda-url.ap-southeast-1.on.aws/";
const ON_ENV = Object.freeze({
  ...AUTH_ENV,
  KUBCODE_PUBLISHING_ENABLED: "true",
  KUBCODE_PUBLISHING_URL: LAMBDA,
  KUBCODE_PUBLISHING_HMAC_KEY: HMAC_KEY,
  KUBCODE_AUTOMATIONS_ENABLED: "true",
});
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CHANNEL = "0b0e8a1e-0000-4000-8000-0000000000c1";

const IG_POST = {
  platformPostId: "17900000000000002",
  permalink: "https://www.instagram.com/reel/DAbCdEfGhIj/",
  thumbnailUrl: "https://scontent.cdninstagram.com/v/t51.2885-15/fixture.jpg?stp=dst-jpg",
  caption: "ทำ AI วิดีโอใน 5 นาที",
  createdAt: "2026-11-10T09:14:03Z",
  kubcode: false,
};

const untouchable = new Proxy({}, { get: (_t, k) => () => assert.fail(`store.${String(k)} must not be called`) }) as ChannelStore;
const noFetch = (async () => assert.fail("the Lambda must not be called")) as typeof fetch;
const owner: Partial<ChannelStore> = { member: async () => ({ ok: true, userId: UID }) };

function lambda(reply: Record<string, unknown>, status = 200) {
  const calls: { path: string; body: string; headers: Headers; method?: string }[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ path: new URL(String(input)).pathname, body: String(init?.body), headers: new Headers(init?.headers), method: init?.method });
    return new Response(JSON.stringify(reply), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetch: fetchFn };
}

const deps = (store: Partial<ChannelStore>, extra: Partial<ChannelRouteDeps> = {}): ChannelRouteDeps => ({
  env: ON_ENV,
  storeFor: () => store as ChannelStore,
  fetch: noFetch,
  ...extra,
});

async function get(opts: { signedIn?: boolean; site?: string; host?: string } = {}) {
  const headers: Record<string, string> = { host: opts.host ?? "kubcode.dev", "sec-fetch-site": opts.site ?? "same-origin" };
  if (opts.signedIn !== false) {
    const token = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
    headers.cookie = `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
  }
  return new Request(`https://kubcode.dev/api/channels/${CHANNEL}/posts`, { headers });
}

test("posts: off, bad id, cross-site and signed out never reach the store or the Lambda", async () => {
  assert.equal((await handleChannelPosts(await get(), CHANNEL, deps(untouchable, { env: { ...ON_ENV, KUBCODE_AUTOMATIONS_ENABLED: "false" } }))).status, 404);
  assert.equal((await handleChannelPosts(await get(), "nope", deps(untouchable))).status, 400);
  assert.equal((await handleChannelPosts(await get({ site: "cross-site" }), CHANNEL, deps(untouchable))).status, 403);
  assert.equal((await handleChannelPosts(await get({ signedIn: false }), CHANNEL, deps(untouchable))).status, 401);
  assert.equal((await handleChannelPosts(await get(), CHANNEL, deps(untouchable, { env: { ...ON_ENV, KUBCODE_PUBLISHING_HMAC_KEY: "x" } }))).status, 503);
});

test("posts: a member who may not publish gets 403 without a Lambda call", async () => {
  const res = await handleChannelPosts(await get(), CHANNEL, deps({ member: async () => ({ ok: false, code: "FORBIDDEN" }) }));
  assert.equal(res.status, 403);
});

test("posts: a signed Lambda call with the member's id; the list comes back checked", async () => {
  const l = lambda({
    ok: true,
    complete: true,
    posts: [
      IG_POST,
      { ...IG_POST, platformPostId: "7300000000000000001", thumbnailUrl: "javascript:alert(1)", permalink: "http://x", caption: "a\nb", createdAt: null, kubcode: true },
      { ...IG_POST, platformPostId: "not-digits" },
      "junk",
    ],
  });
  const res = await handleChannelPosts(await get(), CHANNEL, deps(owner, { fetch: l.fetch, now: () => 1_700_000_000_000 }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, max-age=30");
  const body = await res.json();
  assert.equal(body.complete, true);
  assert.deepEqual(body.posts[0], { ...IG_POST, createdAt: "2026-11-10T09:14:03.000Z" });
  assert.deepEqual(body.posts[1], { platformPostId: "7300000000000000001", permalink: null, thumbnailUrl: null, caption: "a b", createdAt: null, kubcode: true });
  assert.equal(body.posts.length, 2);

  assert.equal(l.calls.length, 1);
  const call = l.calls[0];
  assert.equal(call.path, "/api/channels/posts");
  assert.equal(call.method, "POST");
  assert.deepEqual(JSON.parse(call.body), { user_id: UID, channel_id: CHANNEL });
  const toSign = ["KUBCODE-HMAC-V1", "POST", "/api/channels/posts", "1700000000", call.headers.get("x-kubcode-nonce"), createHash("sha256").update(call.body).digest("hex")].join("\n");
  assert.equal(call.headers.get("x-kubcode-signature"), createHmac("sha256", HMAC_KEY).update(toSign).digest("hex"));
});

test("posts: someone else's channel is 404, a Lambda failure is 503", async () => {
  const missing = lambda({ ok: false, code: "channel_not_found" });
  assert.equal((await handleChannelPosts(await get(), CHANNEL, deps(owner, { fetch: missing.fetch }))).status, 404);
  const down = lambda({ ok: false, code: "unavailable" }, 503);
  const res = await handleChannelPosts(await get(), CHANNEL, deps(owner, { fetch: down.fetch }));
  assert.equal(res.status, 503);
  assert.match((await res.json()).message, /ใส่ ID เอง/);
});

test("pickerPost: captions are capped at 120 characters and stripped of control characters", () => {
  const p = pickerPost({ ...IG_POST, caption: "ก".repeat(200) + "\u0007" });
  assert.equal([...p!.caption].length, 120);
  assert.equal(pickerPost({ ...IG_POST, thumbnailUrl: 'https://x/"onerror=' })!.thumbnailUrl, null);
  assert.equal(pickerPost(null), null);
});
