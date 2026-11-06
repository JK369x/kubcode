// Route-level tests for /api/keys/* and the /account/keys view loader
// (docs/design/settings-keys.md §8). No database: the store is injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import { canUseKeys, keysEnabled } from "../lib/keys/access";
import { handleDeleteSecret, handleSaveSecret, type KeyRouteDeps } from "../lib/keys/routes";
import type { KeyStore, Overview } from "../lib/keys/store";
import { getKeysView } from "../lib/keys/view";

const AUTH_ENV = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
});
const ACCOUNTS_ENV = Object.freeze({
  ...AUTH_ENV,
  KUBCODE_ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test",
});
const ON_ENV = Object.freeze({ ...ACCOUNTS_ENV, KUBCODE_KEYS_ENABLED: "true" });
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CSRF = "C".repeat(43);
const SECRET = "FIXTURE-ONLY-eleven-key-00000000wxyz";

const untouchable = new Proxy({}, { get: (_t, key) => (key === "sealing" ? true : () => assert.fail(`store.${String(key)} must not be called`)) }) as KeyStore;

async function sessionCookie() {
  const token = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  return `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
}

type WriteOpts = { origin?: string; signedIn?: boolean; method?: string; csrf?: string | null; type?: string; raw?: string };
async function write(path: string, body: unknown, opts: WriteOpts = {}) {
  const cookies = [`__Host-kubcode-csrf=${CSRF}`];
  if (opts.signedIn !== false) cookies.push(await sessionCookie());
  const headers: Record<string, string> = {
    host: "kubcode.dev",
    origin: opts.origin ?? "https://kubcode.dev",
    "sec-fetch-site": "same-origin",
    "content-type": opts.type ?? "application/json",
    cookie: cookies.join("; "),
  };
  if (opts.csrf !== null) headers["x-kubcode-csrf"] = opts.csrf ?? CSRF;
  return new Request(`https://kubcode.dev${path}`, {
    method: opts.method ?? "POST",
    headers,
    body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}
const save = (body: unknown, opts?: WriteOpts) => write("/api/keys/secrets", body, opts);
const del = (kind: string, body: unknown, opts?: WriteOpts) => write(`/api/keys/secrets/${kind}`, body, { method: "DELETE", ...opts });

const deps = (store: Partial<KeyStore>, env: Record<string, string> = ON_ENV): KeyRouteDeps => ({
  env,
  storeFor: () => ({ sealing: true, ...store }) as KeyStore,
});

async function expectError(res: Response, status: number, code: string) {
  assert.equal(res.status, status, code);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.code, code);
  assert.equal(typeof body.message, "string");
  return body;
}

const GOOD = { kind: "elevenlabs_api_key", publicValue: null, secret: SECRET };

test("the feature flag and the owner rule live in one place each", () => {
  assert.equal(keysEnabled(ON_ENV), true);
  assert.equal(keysEnabled({ ...ON_ENV, KUBCODE_KEYS_ENABLED: "1" }), false, "only exactly 'true'");
  assert.equal(keysEnabled(ACCOUNTS_ENV), false);
  assert.equal(canUseKeys({ isOwner: true }), true);
  assert.equal(canUseKeys({ isOwner: false }), false);
});

test("with the keys flag or accounts off, writes say so and never touch the store", async () => {
  await expectError(await handleSaveSecret(await save(GOOD), deps(untouchable, ACCOUNTS_ENV)), 503, "KEYS_DISABLED");
  await expectError(await handleSaveSecret(await save(GOOD), deps(untouchable, { ...AUTH_ENV, KUBCODE_KEYS_ENABLED: "true" })), 503, "ACCOUNTS_DISABLED");
  await expectError(await handleDeleteSecret(await del("elevenlabs_api_key", {}), "elevenlabs_api_key", deps(untouchable, ACCOUNTS_ENV)), 503, "KEYS_DISABLED");
});

test("writes reject cross-site, missing CSRF, wrong media type and oversized bodies before the store", async () => {
  const d = deps(untouchable);
  await expectError(await handleSaveSecret(await save(GOOD, { origin: "https://evil.example" }), d), 403, "BAD_ORIGIN");
  await expectError(await handleSaveSecret(await save(GOOD, { csrf: null }), d), 403, "CSRF_INVALID");
  await expectError(await handleSaveSecret(await save(GOOD, { csrf: "D".repeat(43) }), d), 403, "CSRF_INVALID");
  await expectError(await handleSaveSecret(await save(GOOD, { type: "text/plain" }), d), 415, "UNSUPPORTED_MEDIA_TYPE");
  await expectError(await handleSaveSecret(await save(undefined, { raw: JSON.stringify({ ...GOOD, secret: "x".repeat(5000) }) }), d), 413, "PAYLOAD_TOO_LARGE");
  await expectError(await handleDeleteSecret(await del("elevenlabs_api_key", {}, { origin: "https://evil.example" }), "elevenlabs_api_key", d), 403, "BAD_ORIGIN");
});

test("bodies must have exactly the expected fields and types", async () => {
  const d = deps(untouchable);
  for (const body of [
    { kind: "elevenlabs_api_key", secret: SECRET },
    { ...GOOD, extra: 1 },
    { ...GOOD, secret: 5 },
    { ...GOOD, kind: ["elevenlabs_api_key"] },
    { ...GOOD, publicValue: 12 },
  ])
    await expectError(await handleSaveSecret(await save(body), d), 400, "BAD_REQUEST");
  await expectError(await handleDeleteSecret(await del("elevenlabs_api_key", { confirmDisconnect: "yes" }), "elevenlabs_api_key", d), 400, "BAD_REQUEST");
  await expectError(await handleDeleteSecret(await del("elevenlabs_api_key", { other: true }), "elevenlabs_api_key", d), 400, "BAD_REQUEST");
});

test("signed-out callers get 401 before the store", async () => {
  const d = deps(untouchable);
  await expectError(await handleSaveSecret(await save(GOOD, { signedIn: false }), d), 401, "NOT_SIGNED_IN");
  await expectError(await handleDeleteSecret(await del("elevenlabs_api_key", {}, { signedIn: false }), "elevenlabs_api_key", d), 401, "NOT_SIGNED_IN");
});

test("a save reaches the store with the session and returns metadata only", async () => {
  let seen: unknown;
  const meta = { kind: "elevenlabs_api_key", publicValue: null, hint: "wxyz", version: 1, updatedAt: "2026-11-05T00:00:00.000Z" } as const;
  const res = await handleSaveSecret(
    await save({ ...GOOD, secret: `  ${SECRET}  ` }),
    deps({ saveSecret: async (s, input) => ((seen = { uid: s.uid, input }), { ok: true, replaced: false, secret: meta }) }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const text = await res.text();
  assert.doesNotMatch(text, /FIXTURE-ONLY-eleven/, "the secret never comes back");
  assert.deepEqual(JSON.parse(text), { ok: true, replaced: false, secret: meta });
  assert.deepEqual(seen, { uid: UID, input: { kind: "elevenlabs_api_key", publicValue: null, secret: `  ${SECRET}  ` } });
});

test("store refusals map to Thai errors with the right status", async () => {
  const cases: Array<[string, number]> = [
    ["FORBIDDEN", 403],
    ["INVALID_KIND", 422],
    ["INVALID_PUBLIC_VALUE", 422],
    ["INVALID_SECRET", 422],
    ["NOT_READY", 503],
    ["NOT_SIGNED_IN", 401],
  ];
  for (const [code, status] of cases) {
    const body = await expectError(
      await handleSaveSecret(await save(GOOD), deps({ saveSecret: async () => ({ ok: false, code: code as never }) })),
      status,
      code,
    );
    assert.match(body.message, /[฀-๿]/, `${code} message is Thai`);
  }
  await expectError(await handleSaveSecret(await save(GOOD), deps({ saveSecret: async () => { throw new Error("db down"); } })), 503, "ACCOUNTS_UNAVAILABLE");
});

test("delete takes the kind from the path and needs confirmation when connections use it", async () => {
  const calls: unknown[] = [];
  const d = deps({
    deleteSecret: async (s, kind, options) => {
      calls.push({ uid: s.uid, kind, options });
      return options?.confirmDisconnect ? { ok: true, disconnected: 2 } : { ok: false, code: "IN_USE" };
    },
  });
  await expectError(await handleDeleteSecret(await del("youtube_oauth_client", {}), "youtube_oauth_client", d), 409, "IN_USE");
  const ok = await handleDeleteSecret(await del("youtube_oauth_client", { confirmDisconnect: true }), "youtube_oauth_client", d);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, disconnected: 2 });
  assert.deepEqual(calls, [
    { uid: UID, kind: "youtube_oauth_client", options: { confirmDisconnect: false } },
    { uid: UID, kind: "youtube_oauth_client", options: { confirmDisconnect: true } },
  ]);
  await expectError(await handleDeleteSecret(await del("BAD KIND", {}), "BAD KIND", deps(untouchable)), 400, "BAD_REQUEST");
});

// ------------------------------------------------------------ view

const cookieJar = async (signedIn: boolean) => {
  const raw = signedIn ? (await sessionCookie()).split("=").slice(1).join("=") : undefined;
  return { get: (name: string) => (signedIn && name === "__Secure-next-auth.session-token" ? { value: raw! } : undefined) };
};
const OVERVIEW: Overview = { ok: true, secrets: [], connections: [], audit: [] };

test("the page view: disabled, signed out, forbidden, then ready with the overview", async () => {
  const store = (overview: KeyStore["overview"], sealing = true) => () => ({ sealing, overview }) as unknown as KeyStore;
  const never = store(async () => assert.fail("overview must not run"));
  assert.deepEqual(await getKeysView(ACCOUNTS_ENV, () => cookieJar(true), never), { state: "disabled" });
  assert.deepEqual(await getKeysView({ ...AUTH_ENV, KUBCODE_KEYS_ENABLED: "true" }, () => cookieJar(true), never), { state: "disabled" });
  assert.deepEqual(await getKeysView(ON_ENV, () => cookieJar(false), never), { state: "signed-out" });
  assert.deepEqual(await getKeysView(ON_ENV, () => cookieJar(true), store(async () => ({ ok: false, code: "FORBIDDEN" }))), { state: "forbidden" });
  assert.deepEqual(await getKeysView(ON_ENV, () => cookieJar(true), store(async () => ({ ok: false, code: "NOT_SIGNED_IN" }))), { state: "signed-out" });
  assert.deepEqual(await getKeysView(ON_ENV, () => cookieJar(true), store(async () => { throw new Error("db"); })), { state: "unavailable" });
  assert.deepEqual(await getKeysView(ON_ENV, () => cookieJar(true), store(async () => OVERVIEW, false)), {
    state: "ready",
    overview: OVERVIEW,
    canSave: false,
    connect: { youtube: false, instagram: false },
  });
});

test("the page view: Connect works when the Lambda is configured and an app is available", async () => {
  const store = (overview: Overview) => () => ({ sealing: true, overview: async () => overview }) as unknown as KeyStore;
  const CONNECT_ENV = {
    ...ON_ENV,
    KUBCODE_CONNECT_URL: "https://abc123.lambda-url.ap-southeast-1.on.aws/",
    KUBCODE_CONNECT_HMAC_KEY: "FIXTURE-ONLY-connect-hmac-key-0000000000000000",
  };
  const meta = (kind: string) => ({ kind, publicValue: null, hint: "abcd", version: 1, updatedAt: "2026-11-06T00:00:00.000Z" }) as never;
  const view = async (env: Record<string, string>, overview: Overview) => {
    const v = await getKeysView(env, () => cookieJar(true), store(overview));
    assert.equal(v.state, "ready");
    return v.state === "ready" ? v.connect : null;
  };
  // No Lambda configured: nothing can connect.
  assert.deepEqual(await view(ON_ENV, { ...OVERVIEW, secrets: [meta("instagram_app")] }), { youtube: false, instagram: false });
  // kubcode's shared YouTube app needs no member setup; Instagram needs the member's app.
  assert.deepEqual(await view({ ...CONNECT_ENV, KUBCODE_YOUTUBE_CLIENT_ID: "111111111111-kubcodesharedapp.apps.googleusercontent.com" }, OVERVIEW), { youtube: true, instagram: false });
  assert.deepEqual(await view(CONNECT_ENV, { ...OVERVIEW, secrets: [meta("instagram_app")] }), { youtube: false, instagram: true });
  assert.deepEqual(await view(CONNECT_ENV, { ...OVERVIEW, secrets: [meta("youtube_oauth_client")] }), { youtube: true, instagram: false });
});
