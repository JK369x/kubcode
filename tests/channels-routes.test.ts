// Route tests for connecting channels through the publishing Lambda
// (docs/design/publishing-core.md §5.2): start, callback, disconnect, with a
// fake store and a fake Lambda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import { CONNECTABLE, readPublishingConfig } from "../lib/channels/config";
import {
  CHANNEL_COOKIE,
  handleChannelCallback,
  handleChannelConnect,
  handleChannelDisconnect,
  sessionBinding,
  type ChannelRouteDeps,
} from "../lib/channels/routes";
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
});
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CSRF = "C".repeat(43);
const CHANNEL = "0b0e8a1e-0000-4000-8000-0000000000c1";
const COOKIE_TOKEN = "K".repeat(43);
const STATE = "ab".repeat(32);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();

const untouchable = new Proxy({}, { get: (_t, k) => () => assert.fail(`store.${String(k)} must not be called`) }) as ChannelStore;
const noFetch = (async () => assert.fail("the Lambda must not be called")) as typeof fetch;
const owner: Partial<ChannelStore> = { member: async () => ({ ok: true, userId: UID }) };

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

async function callback(query: string, opts: { signedIn?: boolean; cookie?: string | null } = {}) {
  const cookies: string[] = [];
  if (opts.signedIn !== false) cookies.push(await sessionCookie());
  if (opts.cookie !== null) cookies.push(`${CHANNEL_COOKIE}=${opts.cookie ?? COOKIE_TOKEN}`);
  return new Request(`https://kubcode.dev/api/channels/callback?${query}`, {
    headers: { host: "kubcode.dev", cookie: cookies.join("; ") },
  });
}

/** A fake Lambda that records calls and answers with `reply`. */
function lambda(reply: Record<string, unknown>, status = 200) {
  const calls: { path: string; body: any; headers: Headers }[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
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

const notice = (res: Response) => {
  assert.equal(res.status, 303);
  const loc = new URL(res.headers.get("location")!);
  assert.equal(loc.origin + loc.pathname, "https://kubcode.dev/account/channels");
  return loc.searchParams.get("notice");
};

// ------------------------------------------------------------ config

test("publishing config: off unless the flag is exactly true; broken when the URL or key is unusable", () => {
  assert.deepEqual(readPublishingConfig(AUTH_ENV), { mode: "off" });
  assert.deepEqual(readPublishingConfig({ ...ON_ENV, KUBCODE_PUBLISHING_ENABLED: "1" }), { mode: "off" });
  assert.deepEqual(readPublishingConfig({ ...ON_ENV, KUBCODE_PUBLISHING_HMAC_KEY: "short" }), { mode: "broken" });
  assert.deepEqual(readPublishingConfig({ ...ON_ENV, KUBCODE_PUBLISHING_URL: "http://x.lambda-url.ap-southeast-1.on.aws/" }), { mode: "broken" });
  assert.deepEqual(readPublishingConfig({ ...ON_ENV, KUBCODE_PUBLISHING_URL: "https://evil.example/" }), { mode: "broken" });
  assert.deepEqual(readPublishingConfig(ON_ENV), { mode: "on", url: LAMBDA, key: HMAC_KEY });
});

// ------------------------------------------------------------ connect

test("connect: off, bad origin, bad body and signed out never reach the store or the Lambda", async () => {
  const body = { platform: "youtube" };
  assert.equal((await handleChannelConnect(await post("/api/channels/connect", body), deps(untouchable, { env: AUTH_ENV }))).status, 404);
  assert.equal((await handleChannelConnect(await post("/api/channels/connect", body, { origin: "https://evil.example" }), deps(untouchable))).status, 403);
  assert.equal((await handleChannelConnect(await post("/api/channels/connect", { platform: "myspace" }), deps(untouchable))).status, 400);
  assert.equal((await handleChannelConnect(await post("/api/channels/connect", { platform: "youtube", x: 1 }), deps(untouchable))).status, 400);
  assert.equal((await handleChannelConnect(await post("/api/channels/connect", body, { signedIn: false }), deps(untouchable))).status, 401);
});

test("connect: a member who is not allowed gets 403 and the Lambda is never called", async () => {
  const res = await handleChannelConnect(
    await post("/api/channels/connect", { platform: "youtube" }),
    deps({ member: async () => ({ ok: false, code: "FORBIDDEN" }) }),
  );
  assert.equal(res.status, 403);
});

test("connect: signs the request, sends only hashes plus the state, sets the cookie and returns the consent URL", async () => {
  const l = lambda({ ok: true, auth_url: "https://accounts.google.com/o/oauth2/auth?x=1" });
  const res = await handleChannelConnect(await post("/api/channels/connect", { platform: "youtube" }), deps(owner, { fetch: l.fetch }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).authorizeUrl, "https://accounts.google.com/o/oauth2/auth?x=1");
  assert.equal(l.calls.length, 1);
  const call = l.calls[0];
  assert.equal(call.path, "/api/connect/start");
  assert.ok(call.headers.get("x-kubcode-signature"));
  assert.deepEqual(Object.keys(call.body).sort(), ["cookie_hash", "platform", "session_binding_hash", "state", "user_id"]);
  assert.equal(call.body.user_id, UID);
  assert.match(call.body.state, /^[0-9a-f]{64}$/);
  const setCookie = res.headers.get("set-cookie")!;
  assert.match(setCookie, new RegExp(`^${CHANNEL_COOKIE}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$`));
  const cookieValue = setCookie.split(";")[0].split("=")[1];
  assert.equal(call.body.cookie_hash, sha(cookieValue).toString("hex"), "the cookie value itself never leaves the web host");
});

test("connect: TikTok is connectable like YouTube and Instagram; other platforms are not", async () => {
  assert.deepEqual([...CONNECTABLE], ["youtube", "instagram", "tiktok"]);
  const l = lambda({ ok: true, auth_url: "https://www.tiktok.com/v2/auth/authorize/?client_key=x" });
  const res = await handleChannelConnect(await post("/api/channels/connect", { platform: "tiktok" }), deps(owner, { fetch: l.fetch }));
  assert.equal(res.status, 200);
  assert.equal(l.calls[0].body.platform, "tiktok");
  assert.ok(res.headers.get("set-cookie"));
  for (const platform of ["facebook", "TikTok", "tiktokads"]) {
    assert.equal((await handleChannelConnect(await post("/api/channels/connect", { platform }), deps(untouchable))).status, 400, platform);
  }
});

test("connect: a Lambda failure or a non-https URL is a 503 with no cookie", async () => {
  for (const reply of [{ ok: false, code: "provider_not_configured" }, { ok: true, auth_url: "http://insecure.example" }]) {
    const l = lambda(reply);
    const res = await handleChannelConnect(await post("/api/channels/connect", { platform: "instagram" }), deps(owner, { fetch: l.fetch }));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("set-cookie"), null);
  }
});

test("connect: the provider's account quota being full says so instead of 'not ready'", async () => {
  const l = lambda({ ok: false, code: "payment_required" });
  const res = await handleChannelConnect(await post("/api/channels/connect", { platform: "youtube" }), deps(owner, { fetch: l.fetch }));
  assert.equal(res.status, 409);
  assert.equal(res.headers.get("set-cookie"), null);
  const body = (await res.json()) as { code: string; message: string };
  assert.equal(body.code, "PROVIDER_QUOTA");
  assert.match(body.message, /โควตา/);
});

// ------------------------------------------------------------ callback

const openIntent = (over: Partial<{ cookieHash: Buffer; bindingHash: Buffer; open: boolean; live: boolean }> = {}) => ({
  ...owner,
  intent: async (session: any, stateHash: Buffer) => {
    assert.deepEqual(stateHash, createHash("sha256").update(Buffer.from(STATE, "hex")).digest());
    return {
      cookieHash: sha(COOKIE_TOKEN),
      bindingHash: sessionBinding(session),
      open: true,
      live: true,
      ...over,
    };
  },
});

test("callback: bad state, no session, no cookie or a foreign cookie never reach the Lambda", async () => {
  assert.equal(notice(await handleChannelCallback(await callback("i=nothex"), deps(untouchable))), "connect_failed");
  const signedOut = await handleChannelCallback(await callback(`i=${STATE}`, { signedIn: false }), deps(untouchable));
  assert.equal(new URL(signedOut.headers.get("location")!).pathname, "/account");
  assert.equal(notice(await handleChannelCallback(await callback(`i=${STATE}`, { cookie: null }), deps(untouchable))), "connect_failed");
  const foreign = openIntent({ cookieHash: sha("someone else") });
  assert.equal(notice(await handleChannelCallback(await callback(`i=${STATE}&accountId=a1`), deps(foreign))), "connect_failed");
  const closed = openIntent({ open: false });
  assert.equal(notice(await handleChannelCallback(await callback(`i=${STATE}&accountId=a1`), deps(closed))), "connect_failed");
  const expired = openIntent({ live: false });
  assert.equal(notice(await handleChannelCallback(await callback(`i=${STATE}&accountId=a1`), deps(expired))), "connect_expired");
});

test("callback: forwards the provider's parameters (not ours) and maps the Lambda's answer", async () => {
  const ok = lambda({ ok: true, channel_id: CHANNEL });
  const res = await handleChannelCallback(
    await callback(`i=${STATE}&connected=youtube&accountId=a1&username=lokeekbaeb`),
    deps(openIntent(), { fetch: ok.fetch }),
  );
  assert.equal(notice(res), "connected");
  assert.match(res.headers.get("set-cookie")!, new RegExp(`^${CHANNEL_COOKIE}=; .*Max-Age=0`));
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(ok.calls[0].path, "/api/connect/complete");
  assert.equal(ok.calls[0].body.state, STATE);
  assert.deepEqual(ok.calls[0].body.params, [["connected", "youtube"], ["accountId", "a1"], ["username", "lokeekbaeb"]]);

  const denied = lambda({ ok: false, code: "connect_denied" });
  assert.equal(notice(await handleChannelCallback(await callback(`i=${STATE}&error=oauth_denied`), deps(openIntent(), { fetch: denied.fetch }))), "connect_denied");
  const down = lambda({}, 503);
  assert.equal(notice(await handleChannelCallback(await callback(`i=${STATE}&accountId=a1`), deps(openIntent(), { fetch: down.fetch }))), "connect_failed");
});

// ------------------------------------------------------------ disconnect

test("disconnect: checks the id, asks the Lambda with the member's id and reports ok", async () => {
  assert.equal((await handleChannelDisconnect(await post(`/api/channels/x/disconnect`, {}), "not-a-uuid", deps(untouchable))).status, 400);
  const l = lambda({ ok: true });
  const res = await handleChannelDisconnect(await post(`/api/channels/${CHANNEL}/disconnect`, {}), CHANNEL, deps(owner, { fetch: l.fetch }));
  assert.equal(res.status, 200);
  assert.deepEqual(l.calls[0].body, { user_id: UID, channel_id: CHANNEL });
  const missing = lambda({ ok: false, code: "channel_not_found" });
  assert.equal((await handleChannelDisconnect(await post(`/api/channels/${CHANNEL}/disconnect`, {}), CHANNEL, deps(owner, { fetch: missing.fetch }))).status, 404);
});
