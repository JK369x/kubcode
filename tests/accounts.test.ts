// Central accounts + explicit Google/LINE linking: offline contract tests.
// Every credential, subject, URL and token below is fictional TEST DATA. These
// tests never reach a database; SQL behaviour is covered by the explicit
// integration suite in tests/accounts-db (npm run test:accounts-db).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function load<T>(path: string): T {
  try {
    return require(path) as T;
  } catch (error) {
    assert.fail(`${path} is not loadable: ${String((error as Error).message).split("\n")[0]}`);
  }
}

type Config = typeof import("../lib/accounts/config");
const config = () => load<Config>("../lib/accounts/config");

const FICTIONAL_DB = "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test";

// ------------------------------------------------------------ feature flag

test("accounts default OFF unless explicitly enabled with a database URL", () => {
  const { readAccountsConfig } = config();
  assert.deepEqual(readAccountsConfig({}), { mode: "off" });
  assert.deepEqual(readAccountsConfig({ DATABASE_URL: FICTIONAL_DB }), { mode: "off" });
  assert.deepEqual(readAccountsConfig({ KUBCODE_ACCOUNTS_ENABLED: "false", DATABASE_URL: FICTIONAL_DB }), {
    mode: "off",
  });
  assert.deepEqual(readAccountsConfig({ KUBCODE_ACCOUNTS_ENABLED: "", DATABASE_URL: FICTIONAL_DB }), { mode: "off" });
  const on = readAccountsConfig({ KUBCODE_ACCOUNTS_ENABLED: "true", DATABASE_URL: FICTIONAL_DB });
  assert.deepEqual(on, { mode: "on", databaseUrl: FICTIONAL_DB });
});

test("explicitly enabled but broken accounts config fails closed, never off", () => {
  const { readAccountsConfig } = config();
  const broken = [
    { KUBCODE_ACCOUNTS_ENABLED: "true" },
    { KUBCODE_ACCOUNTS_ENABLED: "true", DATABASE_URL: "" },
    { KUBCODE_ACCOUNTS_ENABLED: "true", DATABASE_URL: "not a url" },
    { KUBCODE_ACCOUNTS_ENABLED: "true", DATABASE_URL: "mysql://u:p@127.0.0.1/db" },
    { KUBCODE_ACCOUNTS_ENABLED: "true", DATABASE_URL: "postgres://" },
    { KUBCODE_ACCOUNTS_ENABLED: "true", DATABASE_URL: ` ${FICTIONAL_DB}` },
    // Ambiguous flag values are an operator mistake: fail closed, do not guess.
    { KUBCODE_ACCOUNTS_ENABLED: "TRUE", DATABASE_URL: FICTIONAL_DB },
    { KUBCODE_ACCOUNTS_ENABLED: "1", DATABASE_URL: FICTIONAL_DB },
    { KUBCODE_ACCOUNTS_ENABLED: "yes", DATABASE_URL: FICTIONAL_DB },
  ];
  for (const env of broken) assert.equal(readAccountsConfig(env).mode, "broken", JSON.stringify(env));
});

// ---------------------------------------------------- session token model

type Session = typeof import("../lib/accounts/session");
const session = () => load<Session>("../lib/accounts/session");
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const UID2 = "6f0f5e1c-0000-4000-8000-00000000f1a2";

test("accounts: central token carries internal id, random session binding and version", () => {
  const { accountToken, parseAccountToken } = session();
  const a = accountToken({ userId: UID, sessionVersion: 3, provider: "line", subject: "Ufixture-1", name: "N", email: null });
  const b = accountToken({ userId: UID, sessionVersion: 3, provider: "line", subject: "Ufixture-1", name: "N", email: null });
  assert.equal(a.uid, UID);
  assert.equal(a.sv, 3);
  assert.match(a.sid, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.sid, b.sid, "each fresh sign-in gets its own browser/session binding");
  assert.equal(a.email, undefined, "LINE never carries email");
  assert.deepEqual(parseAccountToken({ ...a, iat: 1, exp: 2, jti: "x", picture: "p" }), a);
  const g = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: null, email: "g@example.test" });
  assert.equal(g.email, "g@example.test");
});

test("accounts: old stateless and malformed tokens never become central users", () => {
  const { parseAccountToken, accountToken } = session();
  const good = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  const bad: unknown[] = [
    null,
    {},
    { provider: "google", sub: "g-1", name: "N", email: "g@example.test" },
    { sub: "legacy-1", name: "Legacy", email: "legacy@example.test" },
    { provider: "line", sub: "Ufixture" },
    { ...good, kc: 2 },
    { ...good, uid: "not-a-uuid" },
    { ...good, uid: undefined },
    { ...good, sid: "short" },
    { ...good, sid: undefined },
    { ...good, sv: 0 },
    { ...good, sv: 1.5 },
    { ...good, sv: "1" },
    { ...good, provider: "github" },
    { ...good, sub: "" },
    { ...good, sub: "x".repeat(256) },
    { ...good, provider: "line", email: "smuggled@example.test" },
    { ...good, email: undefined },
  ];
  for (const t of bad) assert.equal(parseAccountToken(t), null, JSON.stringify(t));
});

test("accounts: public session exposes provider, name and Google email only, never ids or subject", () => {
  const { accountToken, publicSessionFromAccountToken } = session();
  const t = accountToken({ userId: UID2, sessionVersion: 9, provider: "google", subject: "g-secret-sub", name: "N", email: "g@example.test" });
  const s = publicSessionFromAccountToken(t, "2026-11-04T00:00:00.000Z");
  assert.deepEqual(s, { user: { provider: "google", name: "N", email: "g@example.test", image: null }, expires: "2026-11-04T00:00:00.000Z" });
  assert.doesNotMatch(JSON.stringify(s), new RegExp(`g-secret-sub|${UID2}|${t.sid}|"sv"|"uid"|"sid"`));
  assert.deepEqual(publicSessionFromAccountToken({ provider: "google", sub: "x", email: "x@example.test" }, "e"), { expires: "e" });
});

test("accounts: the session keeps an allowlisted provider picture; anything else is dropped without signing out", () => {
  const { accountToken, parseAccountToken, publicSessionFromAccountToken } = session();
  const PIC = "https://lh3.googleusercontent.com/a/ACg8oc-fixture=s96-c";
  const t = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test", picture: PIC });
  assert.equal(t.picture, PIC);
  assert.equal(parseAccountToken(t)?.picture, PIC);
  assert.equal(publicSessionFromAccountToken(t, "e").user?.image, PIC);

  const line = accountToken({ userId: UID, sessionVersion: 1, provider: "line", subject: "U1", name: "L", email: null, picture: "https://profile.line-scdn.net/0hFixture" });
  assert.equal(publicSessionFromAccountToken(line, "e").user?.image, "https://profile.line-scdn.net/0hFixture");

  for (const bad of ["https://evil.example/a.png", "http://lh3.googleusercontent.com/a", "javascript:alert(1)", 5]) {
    const smuggled = parseAccountToken({ ...t, picture: bad });
    assert.ok(smuggled, "token still valid");
    assert.equal(smuggled?.picture, undefined, String(bad));
    assert.equal(publicSessionFromAccountToken({ ...t, picture: bad }, "e").user?.image, null);
  }
  const none = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test", picture: "https://evil.example/x" });
  assert.equal(none.picture, undefined);
});

// ----------------------------------------------------- crypto and cookies

type Crypto = typeof import("../lib/accounts/crypto");
const crypto = () => load<Crypto>("../lib/accounts/crypto");

test("accounts: opaque tokens are high entropy and only their SHA-256 hash is stored", () => {
  const { newOpaqueToken, hashOpaqueToken, isOpaqueToken } = crypto();
  const a = newOpaqueToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, newOpaqueToken());
  const h = hashOpaqueToken(a);
  assert.equal(h.length, 32);
  assert.notEqual(h.toString("base64url"), a);
  assert.deepEqual(hashOpaqueToken(a), h);
  for (const v of ["", "short", `${a}=`, `${a} `, "x".repeat(43).replace(/x$/, "!"), undefined, null, 1])
    assert.equal(isOpaqueToken(v), false, String(v));
  assert.equal(isOpaqueToken(a), true);
});

test("accounts: csrf comparison is exact, constant-shape and rejects missing values", () => {
  const { newOpaqueToken, csrfMatches } = crypto();
  const t = newOpaqueToken();
  assert.equal(csrfMatches(t, t), true);
  assert.equal(csrfMatches(t, newOpaqueToken()), false);
  assert.equal(csrfMatches(t, null), false);
  assert.equal(csrfMatches(null, t), false);
  assert.equal(csrfMatches("", ""), false);
  assert.equal(csrfMatches("short", "short"), false, "malformed tokens never match");
});

// ------------------------------------------------------------ link rules

type Rules = typeof import("../lib/accounts/rules");
const rules = () => load<Rules>("../lib/accounts/rules");
const BOTH = { google: true, line: true } as const;
const SID = "S".repeat(43);

function fixture(over: Record<string, unknown> = {}) {
  const { hashOpaqueToken } = crypto();
  const session = { uid: UID, sid: SID, sv: 4, provider: "google" as const, sub: "g-source" };
  const user = { id: UID, status: "active" as const, sessionVersion: 4 };
  const intent = {
    kind: "link" as const,
    phase: "await_source" as const,
    status: "open" as const,
    expired: false,
    userId: UID,
    sessionBindingHash: hashOpaqueToken(SID),
    sessionVersion: 4,
    sourceProvider: "google" as const,
    sourceSubject: "g-source",
    targetProvider: "line" as const,
    ...over,
  };
  return { session, user, intent };
}

test("accounts: link intent binding rejects every stale, foreign or replayed state", () => {
  const { checkIntentBinding } = rules();
  const ok = fixture();
  assert.equal(checkIntentBinding(ok.intent, ok.user, ok.session, true), null);
  const cases: Array<[string, unknown, unknown, unknown, boolean, string]> = [
    ["missing intent", null, ok.user, ok.session, true, "LINK_INVALID"],
    ["consumed (replay)", { ...ok.intent, status: "consumed" }, ok.user, ok.session, true, "LINK_INVALID"],
    ["cancelled", { ...ok.intent, status: "cancelled" }, ok.user, ok.session, true, "LINK_INVALID"],
    ["rejected", { ...ok.intent, status: "rejected" }, ok.user, ok.session, true, "LINK_INVALID"],
    ["expired", { ...ok.intent, expired: true }, ok.user, ok.session, true, "LINK_EXPIRED"],
    ["no session (logged out)", ok.intent, ok.user, null, true, "LINK_INVALID"],
    ["other user's session", ok.intent, ok.user, { ...ok.session, uid: UID2 }, true, "LINK_INVALID"],
    ["intent of other user", { ...ok.intent, userId: UID2 }, ok.user, ok.session, true, "LINK_INVALID"],
    ["other browser session", ok.intent, ok.user, { ...ok.session, sid: "T".repeat(43) }, true, "LINK_INVALID"],
    ["session version bumped", ok.intent, { ...ok.user, sessionVersion: 5 }, ok.session, true, "LINK_INVALID"],
    ["intent from older version", { ...ok.intent, sessionVersion: 3 }, ok.user, ok.session, true, "LINK_INVALID"],
    ["suspended user", ok.intent, { ...ok.user, status: "suspended" }, ok.session, true, "LINK_INVALID"],
    ["session identity unlinked", ok.intent, ok.user, ok.session, false, "LINK_INVALID"],
    ["source identity gone", { ...ok.intent, sourceSubject: null }, ok.user, ok.session, true, "LINK_INVALID"],
    ["session is not the source", ok.intent, ok.user, { ...ok.session, sub: "g-other" }, true, "LINK_INVALID"],
  ];
  for (const [name, intent, user, session, owned, code] of cases)
    assert.equal(checkIntentBinding(intent as never, user as never, session as never, owned), code, name);
});

test("accounts: callback proof must freshly prove the exact source, then the target provider", () => {
  const { evaluateCallbackProof } = rules();
  const src = fixture().intent;
  assert.deepEqual(evaluateCallbackProof({ intent: src, proof: { provider: "google", subject: "g-source" }, ready: BOTH, targetOwner: "none" }), {
    ok: true,
    step: "source",
    nextPhase: "await_target",
  });
  // Wrong subject or wrong provider in the source round is rejected, never treated as target.
  for (const proof of [
    { provider: "google", subject: "g-other" },
    { provider: "line", subject: "g-source" },
    { provider: "line", subject: "Ufixture" },
  ])
    assert.deepEqual(evaluateCallbackProof({ intent: src, proof, ready: BOTH, targetOwner: "none" } as never), {
      ok: false,
      code: "LINK_WRONG_ACCOUNT",
    });
  const tgt = fixture({ phase: "await_target" }).intent;
  assert.deepEqual(evaluateCallbackProof({ intent: tgt, proof: { provider: "line", subject: "U-new" }, ready: BOTH, targetOwner: "none" }), {
    ok: true,
    step: "target",
    nextPhase: "await_confirm",
  });
  assert.deepEqual(
    evaluateCallbackProof({ intent: tgt, proof: { provider: "google", subject: "g-source" }, ready: BOTH, targetOwner: "self" }),
    { ok: false, code: "LINK_WRONG_ACCOUNT" },
  );
  // Owned by anyone (other user or already self) is one generic conflict: no transfer, no oracle.
  for (const owner of ["other", "self"] as const)
    assert.deepEqual(evaluateCallbackProof({ intent: tgt, proof: { provider: "line", subject: "U-x" }, ready: BOTH, targetOwner: owner }), {
      ok: false,
      code: "LINK_CONFLICT",
    });
  assert.deepEqual(
    evaluateCallbackProof({ intent: tgt, proof: { provider: "line", subject: "U-x" }, ready: { google: true, line: false }, targetOwner: "none" }),
    { ok: false, code: "PROVIDER_UNAVAILABLE" },
  );
  // A third callback (wrong phase) and unlink intents in target phase are rejected.
  for (const intent of [fixture({ phase: "await_confirm" }).intent, fixture({ kind: "unlink", phase: "await_target" }).intent])
    assert.deepEqual(evaluateCallbackProof({ intent, proof: { provider: "line", subject: "U-x" }, ready: BOTH, targetOwner: "none" } as never), {
      ok: false,
      code: "LINK_INVALID",
    });
  const unlink = fixture({ kind: "unlink" }).intent;
  assert.deepEqual(evaluateCallbackProof({ intent: unlink, proof: { provider: "google", subject: "g-source" }, ready: BOTH, targetOwner: "none" }), {
    ok: true,
    step: "source",
    nextPhase: "await_confirm",
  });
});

test("accounts: start rules refuse disabled, duplicate, missing and last usable login methods", () => {
  const { canStartLink, canStartUnlink } = rules();
  const g = { id: "i-g", provider: "google" as const };
  const l = { id: "i-l", provider: "line" as const };
  assert.equal(canStartLink([g], "line", BOTH), null);
  assert.equal(canStartLink([g], "line", { google: true, line: false }), "PROVIDER_UNAVAILABLE");
  assert.equal(canStartLink([g, l], "line", BOTH), "ALREADY_LINKED");
  assert.equal(canStartLink([g], "google", BOTH), "ALREADY_LINKED");
  assert.equal(canStartUnlink([g, l], "line", BOTH), null);
  assert.equal(canStartUnlink([g], "line", BOTH), "NOT_LINKED");
  assert.equal(canStartUnlink([g], "google", BOTH), "LAST_LOGIN_METHOD");
  // The remaining method must be usable on this server, not merely present in the DB.
  assert.equal(canStartUnlink([g, l], "google", { google: true, line: false }), "LAST_LOGIN_METHOD");
});

test("accounts: confirm re-checks phase, provider, ownership and last usable method", () => {
  const { evaluateConfirm } = rules();
  const g = { id: "i-g", provider: "google" as const };
  const l = { id: "i-l", provider: "line" as const };
  const link = fixture({ phase: "await_confirm" }).intent;
  assert.deepEqual(evaluateConfirm({ intent: link, ready: BOTH, identities: [g], hasPendingTarget: true }), { ok: true });
  for (const [input, code] of [
    [{ intent: fixture({ phase: "await_target" }).intent, ready: BOTH, identities: [g], hasPendingTarget: true }, "LINK_INVALID"],
    [{ intent: fixture({ phase: "await_source" }).intent, ready: BOTH, identities: [g], hasPendingTarget: true }, "LINK_INVALID"],
    [{ intent: link, ready: BOTH, identities: [g], hasPendingTarget: false }, "LINK_INVALID"],
    [{ intent: link, ready: { google: true, line: false }, identities: [g], hasPendingTarget: true }, "PROVIDER_UNAVAILABLE"],
    [{ intent: link, ready: BOTH, identities: [g, l], hasPendingTarget: true }, "LINK_CONFLICT"],
  ] as const)
    assert.deepEqual(evaluateConfirm(input as never), { ok: false, code }, JSON.stringify(input));
  const unlink = fixture({ kind: "unlink", phase: "await_confirm", targetProvider: "line" }).intent;
  assert.deepEqual(evaluateConfirm({ intent: unlink, ready: BOTH, identities: [g, l], hasPendingTarget: false }), { ok: true });
  assert.deepEqual(evaluateConfirm({ intent: unlink, ready: BOTH, identities: [g], hasPendingTarget: false }), { ok: false, code: "NOT_LINKED" });
  const unlinkGoogle = { ...unlink, targetProvider: "google" as const };
  assert.deepEqual(evaluateConfirm({ intent: unlinkGoogle, ready: { google: true, line: false }, identities: [g, l], hasPendingTarget: false }), {
    ok: false,
    code: "LAST_LOGIN_METHOD",
  });
});

// --------------------------------------------------- error contract + guards

type Errors = typeof import("../lib/accounts/errors");
const errors = () => load<Errors>("../lib/accounts/errors");
type Http = typeof import("../lib/accounts/http");
const http = () => load<Http>("../lib/accounts/http");

test("accounts: every error code has a fixed status and fixed Thai message; unknown codes are generic", async () => {
  const { ACCOUNT_ERRORS, accountErrorResponse } = errors();
  const expected: Record<string, number> = {
    ACCOUNTS_DISABLED: 503,
    ACCOUNTS_UNAVAILABLE: 503,
    BAD_ORIGIN: 403,
    CSRF_INVALID: 403,
    UNSUPPORTED_MEDIA_TYPE: 415,
    PAYLOAD_TOO_LARGE: 413,
    BAD_REQUEST: 400,
    NOT_SIGNED_IN: 401,
    PROVIDER_UNAVAILABLE: 409,
    ALREADY_LINKED: 409,
    NOT_LINKED: 409,
    LAST_LOGIN_METHOD: 409,
    LINK_INVALID: 409,
    LINK_EXPIRED: 410,
    LINK_WRONG_ACCOUNT: 409,
    LINK_CONFLICT: 409,
  };
  assert.deepEqual(Object.keys(ACCOUNT_ERRORS).sort(), Object.keys(expected).sort());
  for (const [code, status] of Object.entries(expected)) {
    const res = accountErrorResponse(code as never);
    assert.equal(res.status, status, code);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["code", "message"]);
    assert.equal(body.code, code);
    assert.match(body.message, /[฀-๿]/, `${code} message is Thai`);
  }
  // Conflict text never hints at who owns the identity.
  assert.doesNotMatch(ACCOUNT_ERRORS.LINK_CONFLICT.message, /ผู้ใช้อื่น|another|owner|@/);
  const unknown = await accountErrorResponse("<script>" as never).json();
  assert.equal(unknown.code, "ACCOUNTS_UNAVAILABLE");
});

const CANON = "https://kubcode.dev";
function writeRequest(over: { headers?: Record<string, string>; body?: string; url?: string } = {}) {
  const token = "C".repeat(43);
  const headers: Record<string, string> = {
    host: "kubcode.dev",
    origin: CANON,
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
    cookie: `__Host-kubcode-csrf=${token}`,
    "x-kubcode-csrf": token,
    ...over.headers,
  };
  for (const [k, v] of Object.entries(headers)) if (v === "") delete headers[k];
  return new Request(over.url ?? `${CANON}/api/account/link/start`, { method: "POST", headers, body: over.body ?? '{"provider":"line"}' });
}

test("accounts: write guard accepts only canonical same-origin JSON with matching double-submit CSRF", async () => {
  const { readGuardedJson } = http();
  assert.deepEqual(await readGuardedJson(writeRequest()), { ok: true, body: { provider: "line" } });
  const charset = await readGuardedJson(writeRequest({ headers: { "content-type": "application/json; charset=utf-8" } }));
  assert.equal(charset.ok, true);
  const cases: Array<[string, Parameters<typeof writeRequest>[0], string]> = [
    ["alias host", { headers: { host: "kubcode-preview.vercel.app" } }, "BAD_ORIGIN"],
    ["forwarded alias", { headers: { "x-forwarded-host": "evil.example" } }, "BAD_ORIGIN"],
    ["http proto", { headers: { "x-forwarded-proto": "http" } }, "BAD_ORIGIN"],
    ["missing origin", { headers: { origin: "" } }, "BAD_ORIGIN"],
    ["foreign origin", { headers: { origin: "https://evil.example" } }, "BAD_ORIGIN"],
    ["null origin", { headers: { origin: "null" } }, "BAD_ORIGIN"],
    ["subdomain origin", { headers: { origin: "https://www.kubcode.dev" } }, "BAD_ORIGIN"],
    ["cross-site fetch", { headers: { "sec-fetch-site": "cross-site" } }, "BAD_ORIGIN"],
    ["same-site fetch", { headers: { "sec-fetch-site": "same-site" } }, "BAD_ORIGIN"],
    ["form post", { headers: { "content-type": "application/x-www-form-urlencoded" } }, "UNSUPPORTED_MEDIA_TYPE"],
    ["text/plain", { headers: { "content-type": "text/plain" } }, "UNSUPPORTED_MEDIA_TYPE"],
    ["no content type", { headers: { "content-type": "" } }, "UNSUPPORTED_MEDIA_TYPE"],
    ["huge body", { body: JSON.stringify({ provider: "x".repeat(5000) }) }, "PAYLOAD_TOO_LARGE"],
    ["not json", { body: "provider=line" }, "BAD_REQUEST"],
    ["json array", { body: "[]" }, "BAD_REQUEST"],
    ["json null", { body: "null" }, "BAD_REQUEST"],
    ["missing csrf header", { headers: { "x-kubcode-csrf": "" } }, "CSRF_INVALID"],
    ["missing csrf cookie", { headers: { cookie: "" } }, "CSRF_INVALID"],
    ["mismatched csrf", { headers: { "x-kubcode-csrf": "D".repeat(43) } }, "CSRF_INVALID"],
    ["malformed csrf", { headers: { cookie: "__Host-kubcode-csrf=x", "x-kubcode-csrf": "x" } }, "CSRF_INVALID"],
  ];
  for (const [name, over, code] of cases) assert.deepEqual(await readGuardedJson(writeRequest(over)), { ok: false, code }, name);
});

test("accounts: link cookie is Lax for OAuth return and csrf cookie remains Strict", () => {
  const { linkCookie, clearLinkCookie, csrfCookie, clearSessionCookie } = http();
  const t = "L".repeat(43);
  const link = linkCookie(t);
  assert.match(link, /^__Host-kubcode-link=L{43}; /);
  for (const attr of [/; Path=\/(;|$)/, /; Secure(;|$)/, /; HttpOnly(;|$)/, /; SameSite=Lax(;|$)/, /; Max-Age=600(;|$)/])
    assert.match(link, attr);
  assert.doesNotMatch(link, /Domain=/i);
  assert.match(clearLinkCookie(), /^__Host-kubcode-link=; .*Max-Age=0/);
  const csrf = csrfCookie(t);
  assert.match(csrf, /^__Host-kubcode-csrf=L{43}; /);
  assert.match(csrf, /; SameSite=Strict(;|$)/);
  assert.match(csrf, /; HttpOnly(;|$)/);
  assert.match(clearSessionCookie(), /^__Secure-next-auth\.session-token=; .*Max-Age=0/);
});

// ------------------------------------------------- auth integration (mode on)

const AUTH_ENV = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
});
const ON_ENV = Object.freeze({ ...AUTH_ENV, KUBCODE_ACCOUNTS_ENABLED: "true", DATABASE_URL: FICTIONAL_DB });
const ENV_KEYS = Object.keys(ON_ENV);

async function withEnv<T>(env: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const saved = { ...process.env };
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return await run();
  } finally {
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

async function quiet<T>(run: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const original = { error: console.error, warn: console.warn, info: console.info, log: console.log };
  console.error = console.warn = console.info = console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  try {
    return { result: await run(), logs };
  } finally {
    Object.assign(console, original);
  }
}

// A store that proves a code path never touched the database.
const untouchable = new Proxy({}, { get: (_t, key) => () => assert.fail(`store.${String(key)} must not be called`) });
// A store whose database is down: every call rejects like a broken connection.
const downStore = new Proxy({}, { get: () => async () => Promise.reject(Object.assign(new Error("FIXTURE-DB-DOWN secret=LEAK"), { code: "08006" })) });

type Auth = typeof import("../lib/auth");
type Runtime = typeof import("../lib/accounts/runtime");
const runtime = () => load<Runtime>("../lib/accounts/runtime");
function onOptions(store: unknown, request: Record<string, unknown> = {}) {
  const policy = load<typeof import("../lib/auth-policy")>("../lib/auth-policy");
  const result = policy.readAuthConfig(AUTH_ENV);
  if (!result.ok) throw new Error("fixture env must be valid");
  const ctx = { ...runtime().emptyRequestContext(), ...request };
  const options = load<Auth>("../lib/auth").buildAuthOptions(result.config, {
    store: store as never,
    ready: { google: true, line: true },
    request: ctx as never,
  });
  return { options, ctx };
}
const lineAccount = { provider: "line", type: "oauth", providerAccountId: "Ufixture-target" };
const lineProfile = { sub: "Ufixture-target", name: "Fixture LINE" };

test("accounts: mode-on options keep PKCE/state/nonce, JWT and no adapter or email auto-linking", () => {
  const { options } = onOptions(untouchable);
  assert.equal(options.adapter, undefined);
  assert.equal(options.session?.strategy, "jwt");
  for (const p of options.providers as unknown as Array<{ options: Record<string, unknown> }>) {
    assert.deepEqual([...(p.options.checks as string[])].sort(), ["nonce", "pkce", "state"]);
    assert.notEqual(p.options.allowDangerousEmailAccountLinking, true);
  }
});

test("accounts: an old stateless JWT is signed out in mode on without touching the database", async () => {
  const { options } = onOptions(untouchable);
  for (const legacy of [
    { provider: "google", sub: "g-1", name: "N", email: "g@example.test" },
    { sub: "legacy-1", email: "legacy@example.test" },
    { provider: "line", sub: "Ufixture" },
  ])
    assert.deepEqual(await options.callbacks!.jwt!({ token: legacy } as never), {}, JSON.stringify(legacy));
});

test("accounts: sign-in keeps the provider picture in the session only, never in the database call", async () => {
  const PIC = "https://profile.line-scdn.net/0hFixturePicture";
  const seen: unknown[] = [];
  const store = { resolveLogin: async (p: unknown) => (seen.push(p), { status: "ok", userId: UID, sessionVersion: 1 }) };
  for (const [picture, expected] of [
    [PIC, PIC],
    ["https://evil.example/p.png", undefined],
  ] as const) {
    seen.length = 0;
    const { options } = onOptions(store);
    const profile = { ...lineProfile, picture };
    assert.equal(await options.callbacks!.signIn!({ account: lineAccount, profile, user: {} } as never), true);
    assert.equal(JSON.stringify(seen).includes("picture"), false, "the store never receives the picture");
    const token = (await options.callbacks!.jwt!({ token: {}, account: lineAccount, profile } as never)) as { picture?: string };
    assert.equal(token.picture, expected, picture);
  }
});

test("accounts: session reads re-check the database and fail closed on revocation or outage", async () => {
  const token = session().accountToken({ userId: UID, sessionVersion: 2, provider: "line", subject: "Ufixture", name: "N", email: null });
  const seen: unknown[] = [];
  const revoked = { checkSession: async (s: unknown) => (seen.push(s), false) };
  assert.deepEqual(await onOptions(revoked).options.callbacks!.jwt!({ token } as never), {});
  assert.deepEqual(seen, [{ uid: UID, sid: token.sid, sv: 2, provider: "line", sub: "Ufixture" }]);
  const valid = { checkSession: async () => true };
  assert.deepEqual(await onOptions(valid).options.callbacks!.jwt!({ token, session: { uid: UID2, sv: 99 }, trigger: "update" } as never), token);
  const { result, logs } = await quiet(async () => onOptions(downStore).options.callbacks!.jwt!({ token } as never));
  assert.deepEqual(result, {});
  assert.doesNotMatch(logs.join("\n"), /LEAK|FIXTURE-DB|Ufixture|postgres/);
  // A provider disabled on this server cannot keep a session alive from DB presence.
  const policy = load<typeof import("../lib/auth-policy")>("../lib/auth-policy");
  const cfg = policy.readAuthConfig(AUTH_ENV);
  if (!cfg.ok) throw new Error("x");
  const googleOnly = load<Auth>("../lib/auth").buildAuthOptions(cfg.config, {
    store: untouchable as never,
    ready: { google: true, line: false },
    request: runtime().emptyRequestContext(),
  });
  assert.deepEqual(await googleOnly.callbacks!.jwt!({ token } as never), {});
});

test("accounts: public session in mode on never exposes internal id, binding or subject", async () => {
  const token = session().accountToken({ userId: UID, sessionVersion: 2, provider: "google", subject: "g-secret", name: "N", email: "g@example.test" });
  const s = await onOptions(untouchable).options.callbacks!.session!({ session: { expires: "e" }, token } as never);
  assert.deepEqual(s, { user: { provider: "google", name: "N", email: "g@example.test", image: null }, expires: "e" });
});

test("accounts: database outage during sign-in fails closed with a fixed error and no session", async () => {
  const { options, ctx } = onOptions(downStore);
  const { result, logs } = await quiet(async () =>
    options.callbacks!.signIn!({ account: lineAccount, profile: lineProfile, user: {} } as never),
  );
  assert.equal(result, "https://kubcode.dev/account?error=AccountUnavailable");
  assert.equal((ctx as { login: unknown }).login, null);
  assert.doesNotMatch(logs.join("\n"), /LEAK|Ufixture|FIXTURE-DB/);
  await assert.rejects(Promise.resolve(options.callbacks!.jwt!({ token: {}, account: lineAccount, profile: lineProfile } as never)));
  const msg = load<typeof import("../lib/auth-policy")>("../lib/auth-policy").authErrorMessage("AccountUnavailable");
  assert.match(String(msg), /[฀-๿]/);
});

test("accounts: untrusted profiles are refused before any database access", async () => {
  const { options } = onOptions(untouchable);
  assert.equal(await options.callbacks!.signIn!({ account: { ...lineAccount, provider: "github" }, profile: lineProfile, user: {} } as never), false);
  assert.equal(
    await options.callbacks!.signIn!({ account: { provider: "google", type: "oauth" }, profile: { sub: "g", email: "g@example.test", email_verified: false }, user: {} } as never),
    false,
  );
});

test("accounts: any link cookie diverts the callback away from ordinary sign-in", async () => {
  // Malformed cookie: rejected without DB access, cookie cleared, no session.
  const malformed = onOptions(untouchable, { linkCookie: "malformed" });
  assert.equal(
    await malformed.options.callbacks!.signIn!({ account: lineAccount, profile: lineProfile, user: {} } as never),
    "https://kubcode.dev/account/settings?link_error=LINK_INVALID",
  );
  assert.equal((malformed.ctx as { clearLinkCookie: boolean }).clearLinkCookie, true);
  // Well-formed cookie with a database refusal: still never a normal sign-in.
  const calls: string[] = [];
  const refusing = {
    advanceIntent: async () => (calls.push("advance"), { ok: false, code: "LINK_CONFLICT" }),
    resolveLogin: async () => assert.fail("ordinary login must not run while a link cookie is present"),
  };
  const flow = onOptions(refusing, { linkCookie: crypto().hashOpaqueToken(crypto().newOpaqueToken()) });
  assert.equal(
    await flow.options.callbacks!.signIn!({ account: lineAccount, profile: lineProfile, user: {} } as never),
    "https://kubcode.dev/account/settings?link_error=LINK_CONFLICT",
  );
  assert.deepEqual(calls, ["advance"]);
  // Outage during a link callback is also a link error, never a sign-in.
  const down = onOptions(downStore, { linkCookie: crypto().hashOpaqueToken(crypto().newOpaqueToken()) });
  const { result } = await quiet(async () =>
    down.options.callbacks!.signIn!({ account: lineAccount, profile: lineProfile, user: {} } as never),
  );
  assert.equal(result, "https://kubcode.dev/account/settings?link_error=ACCOUNTS_UNAVAILABLE");
});

// ------------------------------------------------------- nextauth route

type NextAuthRoute = typeof import("../app/api/auth/[...nextauth]/route");
const authRoute = () => load<NextAuthRoute>("../app/api/auth/[...nextauth]/route");
const nextServer = () => load<typeof import("next/server")>("next/server");
const ctxFor = (...parts: string[]) => ({ params: Promise.resolve({ nextauth: parts }) });

test("accounts: explicitly enabled but broken accounts config makes every auth route 503 (no stateless fallback)", async () => {
  await withEnv({ ...AUTH_ENV, KUBCODE_ACCOUNTS_ENABLED: "true" }, async () => {
    const { NextRequest } = nextServer();
    const { result } = await quiet(async () =>
      authRoute().GET(new NextRequest("https://kubcode.dev/api/auth/session", { headers: { host: "kubcode.dev" } }), ctxFor("session")),
    );
    assert.equal(result.status, 503);
    assert.equal((await result.json()).code, "ACCOUNTS_UNAVAILABLE");
    assert.equal(result.headers.get("set-cookie"), null);
  });
});

test("accounts: feature ON passes OAuth callback directly to the SDK without an HTML bounce", async () => {
  await withEnv(ON_ENV, async () => {
    const { NextRequest } = nextServer();
    await assert.rejects(
      authRoute().GET(
        new NextRequest("https://kubcode.dev/api/auth/callback/google?code=FICTIONAL&state=FICTIONAL", {
          headers: { host: "kubcode.dev", "sec-fetch-site": "cross-site" },
        }), ctxFor("callback", "google")), /outside a request scope/,
    );
  });
});

test("accounts: feature OFF keeps the stateless callback path (no bounce page)", async () => {
  await withEnv(AUTH_ENV, async () => {
    const { NextRequest } = nextServer();
    // OFF hands the callback straight to next-auth, which (outside a real Next
    // request scope) throws on cookies(); a bounce page would have returned.
    await assert.rejects(
      authRoute().GET(
        new NextRequest("https://kubcode.dev/api/auth/callback/google?code=c&state=s", { headers: { host: "kubcode.dev" } }),
        ctxFor("callback", "google"),
      ),
      /outside a request scope/,
    );
  });
});

// ---------------------------------------------------------- write routes

type Routes = typeof import("../lib/accounts/routes");
const routes = () => load<Routes>("../lib/accounts/routes");

async function sessionCookie(token: Record<string, unknown>) {
  const { encode } = load<typeof import("next-auth/jwt")>("next-auth/jwt");
  return `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
}

test("accounts: write routes are truthful when the feature is off or broken", async () => {
  const { handleLinkStart, handleCsrf } = routes();
  const off = await handleLinkStart(writeRequest(), { env: AUTH_ENV, storeFor: () => untouchable as never });
  assert.equal(off.status, 503);
  assert.equal((await off.json()).code, "ACCOUNTS_DISABLED");
  const broken = await handleLinkStart(writeRequest(), { env: { ...AUTH_ENV, KUBCODE_ACCOUNTS_ENABLED: "true" }, storeFor: () => untouchable as never });
  assert.equal((await broken.json()).code, "ACCOUNTS_UNAVAILABLE");
  assert.equal((await (await handleCsrf(new Request(`${CANON}/api/account/csrf`, { headers: { host: "kubcode.dev" } }), { env: AUTH_ENV })).json()).code, "ACCOUNTS_DISABLED");
});

test("accounts: write routes reject bad origin/CSRF, missing or legacy sessions and bad bodies before the database", async () => {
  const { handleLinkStart, handleUnlinkStart, handleConfirm } = routes();
  const deps = { env: ON_ENV, storeFor: () => untouchable as never };
  const csrf = "C".repeat(43);
  const legacy = await sessionCookie({ provider: "google", sub: "g-1", name: "N", email: "g@example.test" });
  const valid = await sessionCookie(session().accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" }));
  const withCookies = (c: string, body?: string) => writeRequest({ headers: { cookie: `__Host-kubcode-csrf=${csrf}; ${c}` }, body });
  const expect = async (res: Response, status: number, code: string) => {
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal((await res.json()).code, code);
  };
  await expect(await handleLinkStart(writeRequest({ headers: { origin: "https://evil.example" } }), deps), 403, "BAD_ORIGIN");
  await expect(await handleLinkStart(writeRequest({ headers: { "x-kubcode-csrf": "D".repeat(43) } }), deps), 403, "CSRF_INVALID");
  await expect(await handleLinkStart(writeRequest(), deps), 401, "NOT_SIGNED_IN");
  await expect(await handleLinkStart(withCookies(legacy), deps), 401, "NOT_SIGNED_IN");
  for (const body of ['{"provider":"github"}', '{"provider":"line","extra":1}', "{}", '{"provider":["line"]}'])
    await expect(await handleLinkStart(withCookies(valid, body), deps), 400, "BAD_REQUEST");
  await expect(await handleUnlinkStart(withCookies(valid, '{"provider":"x"}'), deps), 400, "BAD_REQUEST");
  // Confirm without a link-intent cookie never reaches the store.
  await expect(await handleConfirm(withCookies(valid, "{}"), deps), 409, "LINK_INVALID");
  await expect(await handleConfirm(withCookies(valid, '{"confirm":true}'), deps), 400, "BAD_REQUEST");
});

test("accounts: database outage on a write route is a fixed 503 with a generic log line", async () => {
  const { handleLinkStart } = routes();
  const valid = await sessionCookie(session().accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" }));
  const req = writeRequest({ headers: { cookie: `__Host-kubcode-csrf=${"C".repeat(43)}; ${valid}` } });
  const { result, logs } = await quiet(() => handleLinkStart(req, { env: ON_ENV, storeFor: () => downStore as never }));
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, "ACCOUNTS_UNAVAILABLE");
  assert.equal(result.headers.get("set-cookie"), null, "no link cookie for a failed start");
  assert.deepEqual(logs, ["[accounts] DB_LINK_START_FAILED SQLSTATE_08"]);
});

test("accounts: cancel always clears the link cookie and the csrf endpoint issues a Strict token", async () => {
  const { handleCancel, handleCsrf } = routes();
  const res = await handleCancel(writeRequest({ body: "{}" }), { env: ON_ENV, storeFor: () => untouchable as never });
  assert.equal(res.status, 200);
  assert.match(String(res.headers.get("set-cookie")), /__Host-kubcode-link=; .*Max-Age=0/);
  const csrfRes = await handleCsrf(new Request(`${CANON}/api/account/csrf`, { headers: { host: "kubcode.dev" } }), { env: ON_ENV });
  assert.equal(csrfRes.headers.get("cache-control"), "no-store");
  const { csrfToken } = await csrfRes.json();
  assert.match(csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(String(csrfRes.headers.get("set-cookie")), new RegExp(`^__Host-kubcode-csrf=${csrfToken}; .*SameSite=Strict`));
  const alias = await handleCsrf(new Request(`${CANON}/api/account/csrf`, { headers: { host: "kubcode-preview.vercel.app" } }), { env: ON_ENV });
  assert.equal(alias.status, 403);
});

// --------------------------------------------------------------------- UI

// Node cannot load CSS modules; next-auth client helpers become a recorder.
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
  _load: (request: string, ...rest: unknown[]) => unknown;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const clientCalls: unknown[][] = [];
const originalLoad = NodeModule._load;
NodeModule._load = function (request: string, ...rest: unknown[]) {
  if (request === "next-auth/react")
    return {
      signIn: async (...args: unknown[]) => void clientCalls.push(["signIn", ...args]),
      signOut: async (...args: unknown[]) => void clientCalls.push(["signOut", ...args]),
    };
  return originalLoad.call(this, request, ...rest);
};
const { createElement } = require("react") as typeof import("react");
const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");

type SettingsUi = typeof import("../components/AccountSettings");
const settingsUi = () => load<SettingsUi>("../components/AccountSettings");
const gId = { provider: "google", displayName: "Fixture G", email: "fixture@example.test", linkedAt: "2026-11-01T00:00:00.000Z", current: true };
const lId = { provider: "line", displayName: "Fixture L", email: null, linkedAt: "2026-11-02T00:00:00.000Z", current: false };
const readyView = (over: Record<string, unknown> = {}) => ({
  state: "ready",
  providers: { google: true, line: true },
  identities: [gId],
  intent: null,
  staleIntentCookie: false,
  ...over,
});
const renderSettings = (view: Record<string, unknown>, notice: string | null = null) =>
  renderToStaticMarkup(createElement(settingsUi().AccountSettings as never, { view, notice } as never));
const allButtons = (html: string) => html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
const button = (html: string, label: RegExp) => allButtons(html).find((b) => label.test(b)) ?? "";
const disabled = (b: string) => /\sdisabled(=""|\s|>)/.test(b);

test("accounts UI: lists connected methods truthfully and explains explicit linking", () => {
  const html = renderSettings(readyView());
  assert.match(html, /Fixture G/);
  assert.match(html, /fixture@example\.test/);
  assert.match(html, /ใช้เข้าสู่ระบบอยู่ตอนนี้/);
  assert.match(html, /ไม่รวมบัญชีให้อัตโนมัติจากอีเมล/);
  assert.match(html, /สิทธิ์สมาชิกเท่ากัน/);
  assert.match(html, /ระบบอนุมัติสมาชิกและการดาวน์โหลดยังไม่เปิด/);
  const linkLine = button(html, /เชื่อม LINE/);
  assert.ok(linkLine, "link LINE action offered");
  assert.equal(disabled(linkLine), false);
  // The only method cannot be unlinked.
  assert.equal(disabled(button(html, /ยกเลิกการเชื่อม Google/) || "<button disabled>"), true);
  assert.match(html, /role="status"/);
  for (const b of allButtons(html)) assert.match(b, /type="button"/);
  assert.doesNotMatch(html, /อนุมัติแล้ว|ดาวน์โหลดได้|g-fixture|Ufixture|undefined|null/);
});

test("accounts UI: disabled providers stay inactive even when present in the database", () => {
  const html = renderSettings(readyView({ providers: { google: true, line: false }, identities: [gId, lId] }));
  assert.match(html, /LINE[\s\S]*ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้/);
  // Google cannot be unlinked because the remaining LINE method is unusable here.
  assert.equal(disabled(button(html, /ยกเลิกการเชื่อม Google/) || "<button disabled>"), true);
  const notReady = renderSettings(readyView({ providers: { google: true, line: false } }));
  const linkLine = button(notReady, /เชื่อม LINE/);
  assert.ok(linkLine);
  assert.equal(disabled(linkLine), true);
  const both = renderSettings(readyView({ identities: [gId, lId] }));
  assert.equal(disabled(button(both, /ยกเลิกการเชื่อม LINE/)), false);
  assert.equal(disabled(button(both, /ยกเลิกการเชื่อม Google/)), false);
});

test("accounts UI: each intent phase offers exactly its next step plus cancel", () => {
  const base = { kind: "link", sourceProvider: "google", targetProvider: "line", pendingTargetName: null, expiresAt: "2026-11-03T10:10:00.000Z" };
  const source = renderSettings(readyView({ intent: { ...base, phase: "await_source" } }));
  assert.match(source, /ขั้นที่ 1 จาก 3/);
  assert.ok(button(source, /ยืนยันตัวตนด้วย Google อีกครั้ง/));
  assert.ok(button(source, /^<button[^>]*>ยกเลิกคำขอ<\/button>$/));
  // While an intent is open, starting another link is disabled.
  const linkWhileOpen = button(source, /^<button[^>]*>เชื่อม LINE<\/button>$/);
  assert.ok(linkWhileOpen);
  assert.equal(disabled(linkWhileOpen), true);
  const target = renderSettings(readyView({ intent: { ...base, phase: "await_target" } }));
  assert.match(target, /ขั้นที่ 2 จาก 3/);
  assert.ok(button(target, /เข้าสู่ระบบด้วย LINE ที่ต้องการเชื่อม/));
  const confirm = renderSettings(readyView({ intent: { ...base, phase: "await_confirm", pendingTargetName: "Fixture L" } }));
  assert.match(confirm, /ขั้นที่ 3 จาก 3/);
  assert.match(confirm, /Fixture L/);
  assert.ok(button(confirm, /ยืนยันการเชื่อม LINE/));
  assert.match(confirm, /ต้องเข้าสู่ระบบใหม่/);
  const unlink = renderSettings(
    readyView({ identities: [gId, lId], intent: { ...base, kind: "unlink", phase: "await_confirm" } }),
  );
  assert.ok(button(unlink, /ยืนยันยกเลิกการเชื่อม LINE/));
  const stale = renderSettings(readyView({ staleIntentCookie: true }));
  assert.match(stale, /คำขอก่อนหน้าใช้ต่อไม่ได้แล้ว/);
  assert.ok(button(stale, /ล้างคำขอ/));
});

test("accounts UI: callback notices and errors are fixed text keyed by code", () => {
  const { settingsNotice } = settingsUi();
  assert.match(String(settingsNotice({ link: "source_verified" })), /[฀-๿]/);
  assert.match(String(settingsNotice({ link: "target_verified" })), /[฀-๿]/);
  assert.equal(settingsNotice({ link_error: "LINK_CONFLICT" }), errors().ACCOUNT_ERRORS.LINK_CONFLICT.message);
  assert.equal(settingsNotice({ link_error: "<img src=x>" }), errors().ACCOUNT_ERRORS.LINK_INVALID.message);
  assert.equal(settingsNotice({}), null);
  const html = renderSettings(readyView(), "<b>x</b>");
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test("accounts UI: reauth uses the library CSRF-protected sign-in with Google account chooser", async () => {
  const { startProviderProof } = settingsUi();
  clientCalls.length = 0;
  await startProviderProof("google");
  await startProviderProof("line");
  assert.deepEqual(clientCalls, [
    ["signIn", "google", { callbackUrl: "/account/settings" }, { prompt: "select_account" }],
    ["signIn", "line", { callbackUrl: "/account/settings" }],
  ]);
});

test("accounts UI: write actions fetch a CSRF token then POST same-origin JSON with the header", async () => {
  const { postAccountAction } = settingsUi();
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    if (url === "/api/account/csrf") return Response.json({ csrfToken: "T".repeat(43) });
    return Response.json({ code: "LINK_CONFLICT", message: "server text ignored" }, { status: 409 });
  };
  const result = await postAccountAction("/api/account/link/start", { provider: "line" }, fakeFetch as never);
  assert.deepEqual(result, { ok: false, code: "LINK_CONFLICT" });
  assert.equal(calls[0][0], "/api/account/csrf");
  assert.equal(calls[0][1]?.credentials, "same-origin");
  assert.equal(calls[1][0], "/api/account/link/start");
  assert.equal(calls[1][1]?.method, "POST");
  assert.equal(calls[1][1]?.credentials, "same-origin");
  const headers = new Headers(calls[1][1]?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("x-kubcode-csrf"), "T".repeat(43));
  assert.equal(calls[1][1]?.body, '{"provider":"line"}');
  const offline = await postAccountAction("/api/account/intent/cancel", {}, (async () => {
    throw new Error("offline");
  }) as never);
  assert.deepEqual(offline, { ok: false, code: "ACCOUNTS_UNAVAILABLE" });
});

type View = typeof import("../lib/accounts/view");
const view = () => load<View>("../lib/accounts/view");
const noCookies = async () => ({ get: () => undefined });

test("accounts UI: settings view is disabled/unavailable/signed-out without leaking data or touching the DB", async () => {
  const { getSettingsView } = view();
  const store = () => untouchable as never;
  assert.deepEqual(await getSettingsView(AUTH_ENV, noCookies, store), { state: "disabled" });
  assert.deepEqual(await getSettingsView({ ...AUTH_ENV, KUBCODE_ACCOUNTS_ENABLED: "true" }, noCookies, store), { state: "unavailable" });
  assert.deepEqual(await getSettingsView(ON_ENV, noCookies, store), { state: "signed-out" });
  const legacy = (await sessionCookie({ provider: "google", sub: "g", email: "g@example.test" })).split("=").slice(1).join("=");
  const legacyCookies = async () => ({ get: (n: string) => (n === "__Secure-next-auth.session-token" ? { value: legacy } : undefined) });
  assert.deepEqual(await getSettingsView(ON_ENV, legacyCookies, store), { state: "signed-out" });
  const valid = (await sessionCookie(session().accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g", name: null, email: "g@example.test" })))
    .split("=").slice(1).join("=");
  const validCookies = async () => ({ get: (n: string) => (n === "__Secure-next-auth.session-token" ? { value: valid } : undefined) });
  const { result } = await quiet(() => getSettingsView(ON_ENV, validCookies, () => downStore as never));
  assert.deepEqual(result, { state: "unavailable" });
  assert.deepEqual(await getSettingsView(ON_ENV, validCookies, () => ({ getSettings: async () => null }) as never), { state: "signed-out" });
});

test("accounts UI: settings page with the feature off says so and shows no account data", async () => {
  await withEnv(AUTH_ENV, async () => {
    const Page = load<{ default: (p: unknown) => Promise<unknown> }>("../app/account/settings/page").default;
    const html = renderToStaticMarkup((await Page({ searchParams: Promise.resolve({}) })) as never);
    assert.match(html, /ตั้งค่าการเข้าสู่ระบบ/);
    assert.match(html, /ยังไม่เปิดใช้งาน/);
    assert.match(html, /href="\/account"/);
    assert.doesNotMatch(html, /<button|ยืนยันการเชื่อม|@/);
  });
});

test("accounts UI: /account links to settings only when accounts are on and a member is signed in", () => {
  const form = load<typeof import("../components/AccountForm")>("../components/AccountForm");
  const user = { provider: "google", name: "N", email: "n@example.test" };
  const withLink = renderToStaticMarkup(createElement(form.AccountForm as never, { state: "signed-in", user, settingsAvailable: true } as never));
  assert.match(withLink, /href="\/account\/settings"/);
  const without = renderToStaticMarkup(createElement(form.AccountForm as never, { state: "signed-in", user } as never));
  assert.doesNotMatch(without, /\/account\/settings/);
  const signedOut = renderToStaticMarkup(
    createElement(form.AccountForm as never, { state: "signed-out", providers: { google: true, line: true }, settingsAvailable: true } as never),
  );
  assert.doesNotMatch(signedOut, /\/account\/settings/);
  const page = readFileSync(join(root, "app/account/page.tsx"), "utf8");
  assert.match(page, /settingsAvailable/);
});

test("accounts config never echoes the database URL in its problem report", () => {
  const result = config().readAccountsConfig({
    KUBCODE_ACCOUNTS_ENABLED: "true",
    DATABASE_URL: "postgres://LEAK-CANARY:LEAK-CANARY@",
  });
  assert.equal(result.mode, "broken");
  assert.doesNotMatch(JSON.stringify(result), /LEAK-CANARY/);
});
