// Route tests for the OAuth connect flow (docs/design/settings-keys.md §2):
// start, callback and disconnect, with a fake store and a fake Lambda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import { connectHeaders, readConnectConfig } from "../lib/keys/connect-config";
import { handleConnectCallback, handleConnectStart, handleDisconnect, type ConnectRouteDeps } from "../lib/keys/connect-routes";
import type { ConnectStore } from "../lib/keys/connect-store";

const AUTH_ENV = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
  KUBCODE_ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test",
  KUBCODE_KEYS_ENABLED: "true",
});
const HMAC_KEY = "FIXTURE-ONLY-connect-hmac-key-0000000000000000";
const ON_ENV = Object.freeze({
  ...AUTH_ENV,
  KUBCODE_CONNECT_URL: "https://abc123.lambda-url.ap-southeast-1.on.aws/",
  KUBCODE_CONNECT_HMAC_KEY: HMAC_KEY,
  KUBCODE_YOUTUBE_CLIENT_ID: "111111111111-kubcodesharedapp.apps.googleusercontent.com",
});
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CSRF = "C".repeat(43);
const CONN = "0b0e8a1e-0000-4000-8000-0000000000c1";
const OAUTH_COOKIE = "O".repeat(43);

const untouchable = new Proxy({}, { get: (_t, k) => () => assert.fail(`store.${String(k)} must not be called`) }) as ConnectStore;
const noFetch = (async () => assert.fail("the Lambda must not be called")) as typeof fetch;

async function sessionCookie() {
  const token = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  return `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
}

async function post(path: string, body: unknown, opts: { origin?: string; signedIn?: boolean } = {}) {
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

async function callback(provider: string, query: string, opts: { signedIn?: boolean; oauthCookie?: string | null } = {}) {
  const cookies: string[] = [];
  if (opts.signedIn !== false) cookies.push(await sessionCookie());
  if (opts.oauthCookie !== null) cookies.push(`__Host-kubcode-oauth=${opts.oauthCookie ?? OAUTH_COOKIE}`);
  return new Request(`https://kubcode.dev/api/keys/oauth/callback/${provider}?${query}`, {
    headers: { host: "kubcode.dev", cookie: cookies.join("; ") },
  });
}

const deps = (store: Partial<ConnectStore>, extra: Partial<ConnectRouteDeps> = {}): ConnectRouteDeps => ({
  env: ON_ENV,
  storeFor: () => store as ConnectStore,
  fetch: noFetch,
  ...extra,
});

const notice = (res: Response) => {
  assert.equal(res.status, 303);
  const loc = new URL(res.headers.get("location")!);
  assert.equal(loc.origin + loc.pathname, "https://kubcode.dev/account/keys");
  return loc.searchParams.get("notice");
};

// ------------------------------------------------------------ config

test("connect config: off without URL+key, broken when half-set or weak, on otherwise", () => {
  assert.deepEqual(readConnectConfig(AUTH_ENV), { mode: "off" });
  assert.deepEqual(readConnectConfig({ ...AUTH_ENV, KUBCODE_CONNECT_URL: ON_ENV.KUBCODE_CONNECT_URL }), { mode: "broken" });
  assert.deepEqual(readConnectConfig({ ...ON_ENV, KUBCODE_CONNECT_HMAC_KEY: "short" }), { mode: "broken" });
  assert.deepEqual(readConnectConfig({ ...ON_ENV, KUBCODE_CONNECT_URL: "http://abc.lambda-url.ap-southeast-1.on.aws/" }), { mode: "broken" });
  assert.deepEqual(readConnectConfig({ ...ON_ENV, KUBCODE_YOUTUBE_CLIENT_ID: "nope" }), { mode: "broken" });
  const on = readConnectConfig(ON_ENV);
  assert.deepEqual(on, { mode: "on", url: ON_ENV.KUBCODE_CONNECT_URL, key: HMAC_KEY, youtubeClientId: ON_ENV.KUBCODE_YOUTUBE_CLIENT_ID });
  const noShared = readConnectConfig({ ...ON_ENV, KUBCODE_YOUTUBE_CLIENT_ID: "" });
  assert.equal(noShared.mode === "on" && noShared.youtubeClientId, null);
});

test("Lambda requests use the KUBCODE-HMAC-V1 scheme over method, path, time, nonce and body", () => {
  const body = '{"state":"s","code":"c"}';
  const h = connectHeaders(HMAC_KEY, "/oauth/exchange", body, 1700000000, "00112233445566778899aabbccddeeff");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const expected = createHmac("sha256", HMAC_KEY)
    .update(["KUBCODE-HMAC-V1", "POST", "/oauth/exchange", "1700000000", "00112233445566778899aabbccddeeff", bodyHash].join("\n"))
    .digest("hex");
  assert.equal(h["x-kubcode-signature"], expected);
  assert.equal(h["x-kubcode-timestamp"], "1700000000");
});

// ------------------------------------------------------------ start

test("start: flag/config off, bad origin, bad body and signed out never reach the store", async () => {
  const s = (await post("/api/keys/oauth/start", { provider: "youtube" })) as Request;
  assert.equal((await handleConnectStart(s, deps(untouchable, { env: { ...AUTH_ENV, KUBCODE_KEYS_ENABLED: "" } }))).status, 503);
  assert.equal((await handleConnectStart(await post("/api/keys/oauth/start", { provider: "youtube" }), deps(untouchable, { env: AUTH_ENV }))).status, 503);
  assert.equal((await handleConnectStart(await post("/api/keys/oauth/start", { provider: "youtube" }, { origin: "https://evil.example" }), deps(untouchable))).status, 403);
  assert.equal((await handleConnectStart(await post("/api/keys/oauth/start", { provider: "tiktok" }), deps(untouchable))).status, 400);
  assert.equal((await handleConnectStart(await post("/api/keys/oauth/start", { provider: "youtube", x: 1 }), deps(untouchable))).status, 400);
  assert.equal((await handleConnectStart(await post("/api/keys/oauth/start", { provider: "youtube" }, { signedIn: false }), deps(untouchable))).status, 401);
});

test("start (YouTube): PKCE S256, offline access, fixed redirect, Lax cookie; only hashes go to the store", async () => {
  let seen: Parameters<ConnectStore["startConnect"]>[1] | undefined;
  const res = await handleConnectStart(
    await post("/api/keys/oauth/start", { provider: "youtube" }),
    deps({
      startConnect: async (s, input) => {
        assert.equal(s.uid, UID);
        seen = input;
        return { ok: true, intentId: "i", appSource: "kubcode", clientId: ON_ENV.KUBCODE_YOUTUBE_CLIENT_ID };
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const url = new URL((await res.json()).authorizeUrl);
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  const q = Object.fromEntries(url.searchParams);
  assert.equal(q.client_id, ON_ENV.KUBCODE_YOUTUBE_CLIENT_ID);
  assert.equal(q.redirect_uri, "https://kubcode.dev/api/keys/oauth/callback/youtube");
  assert.equal(q.response_type, "code");
  assert.equal(q.access_type, "offline");
  assert.equal(q.prompt, "consent");
  assert.deepEqual(q.scope.split(" ").sort(), ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.upload"]);
  assert.equal(q.code_challenge_method, "S256");
  assert.equal(q.state, seen!.state);
  assert.match(seen!.state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(seen!.verifier!, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(q.code_challenge, createHash("sha256").update(seen!.verifier!).digest("base64url"));
  assert.equal(seen!.kubcodeClientId, ON_ENV.KUBCODE_YOUTUBE_CLIENT_ID);
  const cookie = res.headers.get("set-cookie")!;
  assert.match(cookie, new RegExp(`^__Host-kubcode-oauth=${seen!.cookieToken}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$`));
});

test("start (Instagram): Business Login, publish scopes, no PKCE", async () => {
  let seen: Parameters<ConnectStore["startConnect"]>[1] | undefined;
  const res = await handleConnectStart(
    await post("/api/keys/oauth/start", { provider: "instagram" }),
    deps({ startConnect: async (_s, input) => ((seen = input), { ok: true, intentId: "i", appSource: "member", clientId: "1234567890123456" }) }),
  );
  const url = new URL((await res.json()).authorizeUrl);
  assert.equal(url.origin + url.pathname, "https://www.instagram.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "1234567890123456");
  assert.equal(url.searchParams.get("redirect_uri"), "https://kubcode.dev/api/keys/oauth/callback/instagram");
  assert.equal(url.searchParams.get("scope"), "instagram_business_basic,instagram_business_content_publish");
  assert.equal(url.searchParams.get("code_challenge"), null);
  assert.equal(seen!.verifier, null);
});

test("start: store refusals map to Thai errors", async () => {
  for (const [code, status] of [["APP_NOT_CONFIGURED", 409], ["NOT_READY", 503], ["FORBIDDEN", 403], ["NOT_SIGNED_IN", 401]] as const) {
    const res = await handleConnectStart(await post("/api/keys/oauth/start", { provider: "youtube" }), deps({ startConnect: async () => ({ ok: false, code }) }));
    assert.equal(res.status, status, code);
    const body = await res.json();
    assert.equal(body.code, code);
    assert.match(body.message, /[฀-๿]/);
  }
});

// ------------------------------------------------------------ callback

test("callback: success calls the Lambda with a signed {state, code} and clears the cookie", async () => {
  let sent: { url: string; headers: Record<string, string>; body: string } | undefined;
  const store = { beginExchange: async () => ({ ok: true as const, intentId: "i" }), failIntent: async () => assert.fail("no failure") };
  const fetch = (async (url: string, init: RequestInit) => {
    sent = { url, headers: init.headers as Record<string, string>, body: String(init.body) };
    return new Response(JSON.stringify({ ok: true, label: "STORY GRID" }), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  const res = await handleConnectCallback(await callback("youtube", "state=S1&code=C1"), "youtube", deps(store, { fetch }));
  assert.equal(notice(res), "connected");
  assert.match(res.headers.get("set-cookie")!, /^__Host-kubcode-oauth=; Path=\/; Max-Age=0;/);
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(sent!.url, "https://abc123.lambda-url.ap-southeast-1.on.aws/oauth/exchange");
  assert.deepEqual(JSON.parse(sent!.body), { state: "S1", code: "C1" });
  const h = sent!.headers;
  assert.equal(h["x-kubcode-signature"], connectHeaders(HMAC_KEY, "/oauth/exchange", sent!.body, Number(h["x-kubcode-timestamp"]), h["x-kubcode-nonce"])["x-kubcode-signature"]);
});

test("callback: the provider's error or a failed exchange closes the intent and says so", async () => {
  let failed = 0;
  const store = { beginExchange: async () => ({ ok: true as const, intentId: "i" }), failIntent: async () => ((failed++), { ok: true as const }) };
  assert.equal(notice(await handleConnectCallback(await callback("youtube", "state=S1&error=access_denied"), "youtube", deps(store))), "connect_denied");
  const lambdaNo = (async () => new Response(JSON.stringify({ ok: false, code: "exchange_failed" }), { status: 200 })) as unknown as typeof fetch;
  assert.equal(notice(await handleConnectCallback(await callback("youtube", "state=S1&code=C1"), "youtube", deps(store, { fetch: lambdaNo }))), "connect_failed");
  const lambdaDown = (async () => { throw new Error("timeout"); }) as unknown as typeof fetch;
  assert.equal(notice(await handleConnectCallback(await callback("youtube", "state=S1&code=C1"), "youtube", deps(store, { fetch: lambdaDown }))), "connect_failed");
  assert.equal(failed, 3);
});

test("callback: bad or replayed state, no cookie, expiry and no session never call the Lambda", async () => {
  const invalid = { beginExchange: async () => ({ ok: false as const, code: "INTENT_INVALID" as const }) };
  assert.equal(notice(await handleConnectCallback(await callback("youtube", "state=S1&code=C1"), "youtube", deps(invalid))), "connect_failed");
  const expired = { beginExchange: async () => ({ ok: false as const, code: "INTENT_EXPIRED" as const }) };
  assert.equal(notice(await handleConnectCallback(await callback("youtube", "state=S1&code=C1"), "youtube", deps(expired))), "connect_expired");
  assert.equal(notice(await handleConnectCallback(await callback("youtube", "state=S1&code=C1", { oauthCookie: null }), "youtube", deps(untouchable))), "connect_failed");
  assert.equal(notice(await handleConnectCallback(await callback("youtube", "code=C1"), "youtube", deps(untouchable))), "connect_failed");
  assert.equal(notice(await handleConnectCallback(await callback("tiktok", "state=S1&code=C1"), "tiktok", deps(untouchable))), "connect_failed");
  const out = await handleConnectCallback(await callback("youtube", "state=S1&code=C1", { signedIn: false }), "youtube", deps(untouchable));
  assert.equal(out.status, 303);
  assert.equal(out.headers.get("location"), "https://kubcode.dev/account");
  const off = await handleConnectCallback(await callback("youtube", "state=S1&code=C1"), "youtube", deps(untouchable, { env: AUTH_ENV }));
  assert.equal(notice(off), "connect_unavailable");
});

// ------------------------------------------------------------ disconnect

test("disconnect YouTube: the Lambda revokes and removes; if it cannot, the web host still wipes the row", async () => {
  const calls: string[] = [];
  const store = {
    markRevoking: async () => ((calls.push("revoking")), { ok: true as const, provider: "youtube" as const }),
    removeConnection: async (_s: unknown, _id: string, r: { revokeFailed: boolean }) => ((calls.push(`remove:${r.revokeFailed}`)), { ok: true as const }),
  };
  let body = "";
  const lambdaOk = (async (_u: string, init: RequestInit) => ((body = String(init.body)), new Response(JSON.stringify({ ok: true, revoked: true }), { status: 200 }))) as unknown as typeof fetch;
  const ok = await handleDisconnect(await post(`/api/keys/connections/${CONN}/disconnect`, {}), CONN, deps(store, { fetch: lambdaOk }));
  assert.deepEqual(await ok.json(), { ok: true, revoked: true });
  assert.deepEqual(JSON.parse(body), { connectionId: CONN, userId: UID });
  assert.deepEqual(calls, ["revoking"], "the Lambda removed it");
  calls.length = 0;
  const lambdaDown = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
  const fallback = await handleDisconnect(await post(`/api/keys/connections/${CONN}/disconnect`, {}), CONN, deps(store, { fetch: lambdaDown }));
  assert.deepEqual(await fallback.json(), { ok: true, revoked: false });
  assert.deepEqual(calls, ["revoking", "remove:true"]);
});

test("disconnect Instagram removes locally (no revoke API); bad ids and foreign rows are refused", async () => {
  const calls: string[] = [];
  const store = {
    markRevoking: async () => ((calls.push("revoking")), { ok: true as const, provider: "instagram" as const }),
    removeConnection: async (_s: unknown, _id: string, r: { revokeFailed: boolean }) => ((calls.push(`remove:${r.revokeFailed}`)), { ok: true as const }),
  };
  const res = await handleDisconnect(await post(`/api/keys/connections/${CONN}/disconnect`, {}), CONN, deps(store));
  assert.deepEqual(await res.json(), { ok: true, revoked: false });
  assert.deepEqual(calls, ["revoking", "remove:false"]);
  assert.equal((await handleDisconnect(await post("/api/keys/connections/nope/disconnect", {}), "nope", deps(untouchable))).status, 400);
  const missing = { markRevoking: async () => ({ ok: false as const, code: "NOT_FOUND" as const }) };
  assert.equal((await handleDisconnect(await post(`/api/keys/connections/${CONN}/disconnect`, {}), CONN, deps(missing))).status, 404);
  assert.equal((await handleDisconnect(await post(`/api/keys/connections/${CONN}/disconnect`, {}, { origin: "https://evil.example" }), CONN, deps(untouchable))).status, 403);
});
