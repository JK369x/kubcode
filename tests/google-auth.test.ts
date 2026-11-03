// Google login (next-auth v4, JWT-only) contract tests.
// Every credential, profile, token and session below is fictional TEST DATA.
// Nothing here proves a real Google sign-in works end to end.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = join(__dirname, "..");

// Node cannot load CSS modules; stub them as identity class maps.
// The next-auth client helpers are replaced with a recorder so UI tests never
// touch the network and never depend on browser globals.
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
  _load: (request: string, ...rest: unknown[]) => unknown;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy(
    {},
    { get: (_t, key) => (key === "__esModule" ? false : String(key)) },
  );
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

// Turn "module does not exist yet" into an assertion failure that names the
// missing behavior, so RED runs fail on behavior rather than crashing.
function load<T>(path: string): T {
  try {
    return require(path) as T;
  } catch (error) {
    const first = String((error as Error).message).split("\n")[0];
    assert.fail(`${path} is not loadable: ${first}`);
  }
}

type Policy = typeof import("../lib/auth-policy");
const policy = () => load<Policy>("../lib/auth-policy");

// Fictional, explicitly-labelled fixtures. Not real credentials.
const FIXTURE_ENV = Object.freeze({
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
});

// ---------------------------------------------------------------- config

test("configured fixture env yields a pinned canonical config", () => {
  const result = policy().readAuthConfig({ ...FIXTURE_ENV });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.config.origin, "https://kubcode.dev");
  assert.equal(result.config.google?.clientId, FIXTURE_ENV.GOOGLE_CLIENT_ID);
  assert.equal(result.config.line, null);
  assert.equal(policy().GOOGLE_CALLBACK_URL, "https://kubcode.dev/api/auth/callback/google");
});

test("missing, blank, placeholder or malformed env fails closed", () => {
  const { readAuthConfig } = policy();
  const bad: Array<[string, string | undefined]> = [
    ["GOOGLE_CLIENT_ID", undefined],
    ["GOOGLE_CLIENT_ID", ""],
    ["GOOGLE_CLIENT_ID", "your-client-id.apps.googleusercontent.com"],
    ["GOOGLE_CLIENT_ID", "123456789012-abc.apps.googleusercontent.com.evil.example"],
    ["GOOGLE_CLIENT_ID", "123456789012-abcdefgh.example.com"],
    ["GOOGLE_CLIENT_SECRET", undefined],
    ["GOOGLE_CLIENT_SECRET", "   "],
    ["GOOGLE_CLIENT_SECRET", "changeme"],
    ["GOOGLE_CLIENT_SECRET", "your_google_client_secret_here"],
    ["NEXTAUTH_SECRET", undefined],
    ["NEXTAUTH_SECRET", "short-but-not-32-characters"],
    ["NEXTAUTH_SECRET", "x".repeat(40)],
    ["NEXTAUTH_SECRET", "replace-me-with-a-long-random-session-secret"],
    ["NEXTAUTH_SECRET", FIXTURE_ENV.GOOGLE_CLIENT_SECRET.padEnd(40, "0")],
    ["NEXTAUTH_URL", undefined],
    ["NEXTAUTH_URL", "http://kubcode.dev"],
    ["NEXTAUTH_URL", "https://kubcode.dev/"],
    ["NEXTAUTH_URL", "https://www.kubcode.dev"],
    ["NEXTAUTH_URL", "https://kubcode.dev.evil.example"],
    ["NEXTAUTH_URL", "http://localhost:3000"],
  ];
  for (const [key, value] of bad) {
    const env: Record<string, string | undefined> = { ...FIXTURE_ENV, [key]: value };
    if (key === "NEXTAUTH_SECRET" && value?.startsWith("FIXTURE-ONLY-client"))
      env.GOOGLE_CLIENT_SECRET = value; // secret reused for both purposes
    const result = readAuthConfig(env);
    assert.equal(result.ok, false, `${key}=${JSON.stringify(value)} must fail closed`);
    // A valid LINE channel next to it never makes this Google config usable.
    const withLine = readAuthConfig({ ...env, LINE_CLIENT_ID: "2000000001", LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01" });
    assert.equal(policy().providerReadiness(withLine).google, false, `${key}=${JSON.stringify(value)} with LINE`);
  }
});

test("validation never trims or repairs literal secrets", () => {
  const { readAuthConfig } = policy();
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXTAUTH_SECRET", "NEXTAUTH_URL"] as const) {
    for (const wrap of [(v: string) => ` ${v}`, (v: string) => `${v}\n`, (v: string) => `${v}\t`]) {
      const result = readAuthConfig({ ...FIXTURE_ENV, [key]: wrap(FIXTURE_ENV[key]) });
      assert.equal(result.ok, false, `${key} with surrounding whitespace must not be normalized`);
    }
  }
});

test("secrets exposed through NEXT_PUBLIC_ variables fail closed", () => {
  const result = policy().readAuthConfig({
    ...FIXTURE_ENV,
    NEXT_PUBLIC_NEXTAUTH_SECRET: FIXTURE_ENV.NEXTAUTH_SECRET,
  });
  assert.equal(result.ok, false);
});

test("config failures report variable names and reasons only, never values", () => {
  const leaky = {
    GOOGLE_CLIENT_ID: "FIXTURE-LEAK-CANARY-ID",
    GOOGLE_CLIENT_SECRET: "FIXTURE-LEAK-CANARY-SECRET ",
    NEXTAUTH_SECRET: "FIXTURE-LEAK-CANARY-SHORT",
    NEXTAUTH_URL: "https://FIXTURE-LEAK-CANARY.example",
  };
  const result = policy().readAuthConfig(leaky);
  assert.equal(result.ok, false);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /LEAK-CANARY/);
  if (!result.ok) {
    assert.deepEqual(
      result.problems.map((p) => p.variable).sort(),
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "LINE_CLIENT_ID", "LINE_CLIENT_SECRET", "NEXTAUTH_SECRET", "NEXTAUTH_URL"],
    );
    // With no LINE channel configured at all, LINE is reported only as missing.
    for (const p of result.problems)
      if (p.variable.startsWith("LINE_")) assert.equal(p.reason, "missing");
  }
});

// ------------------------------------------------------- trusted identity

const googleAccount = { provider: "google", type: "oauth" };
const verifiedProfile = {
  sub: "fixture-sub-0001",
  name: "Fixture Person",
  email: "fixture.person@example.test",
  email_verified: true,
  picture: "https://example.test/avatar.png",
};

test("only Google profiles with email_verified === true are trusted", () => {
  const { isTrustedGoogleSignIn } = policy();
  assert.equal(isTrustedGoogleSignIn({ account: googleAccount, profile: verifiedProfile }), true);
  for (const change of [
    { email_verified: false },
    { email_verified: "true" },
    { email_verified: 1 },
    { email_verified: undefined },
    { email: "" },
    { email: undefined },
    { sub: "" },
    { sub: undefined },
  ])
    assert.equal(
      isTrustedGoogleSignIn({ account: googleAccount, profile: { ...verifiedProfile, ...change } }),
      false,
      JSON.stringify(change),
    );
  assert.equal(isTrustedGoogleSignIn({ account: { provider: "github", type: "oauth" }, profile: verifiedProfile }), false);
  assert.equal(isTrustedGoogleSignIn({ account: null, profile: verifiedProfile }), false);
  assert.equal(isTrustedGoogleSignIn({ account: googleAccount, profile: null }), false);
});

// ------------------------------------------------ token/session whitelist

test("JWT payload keeps only the Google provider tag, sub, name and email", () => {
  const { tokenFromSignIn, minimalToken } = policy();
  assert.deepEqual(tokenFromSignIn({ account: googleAccount, profile: verifiedProfile }), {
    provider: "google",
    sub: "fixture-sub-0001",
    name: "Fixture Person",
    email: "fixture.person@example.test",
  });
  const polluted = {
    sub: "fixture-sub-0001",
    name: "Fixture Person",
    email: "fixture.person@example.test",
    picture: "https://example.test/avatar.png",
    access_token: "FIXTURE-access-token",
    refresh_token: "FIXTURE-refresh-token",
    id_token: "FIXTURE-id-token",
    approved: true,
    admin: true,
    canDownload: true,
    iat: 1,
    exp: 2,
    jti: "x",
  };
  // Provider-less (pre-LINE) encrypted Google sessions migrate as Google.
  assert.deepEqual(minimalToken(polluted), {
    provider: "google",
    sub: "fixture-sub-0001",
    name: "Fixture Person",
    email: "fixture.person@example.test",
  });
});

test("public session exposes only provider, name, email and expiry", () => {
  const { toPublicSession } = policy();
  const session = toPublicSession(
    {
      provider: "google",
      sub: "fixture-sub-0001",
      name: "Fixture Person",
      email: "fixture.person@example.test",
      access_token: "FIXTURE-access-token",
      approved: true,
      admin: true,
    },
    "2026-11-03T00:00:00.000Z",
  );
  assert.deepEqual(session, {
    user: { provider: "google", name: "Fixture Person", email: "fixture.person@example.test" },
    expires: "2026-11-03T00:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(session), /token|approved|admin|sub|download/i);
  assert.deepEqual(toPublicSession({ provider: "google", sub: "fixture-sub-0001" }, "2026-11-03T00:00:00.000Z"), {
    expires: "2026-11-03T00:00:00.000Z",
  });
  assert.deepEqual(toPublicSession({}, "2026-11-03T00:00:00.000Z"), {
    expires: "2026-11-03T00:00:00.000Z",
  });
});

test("server-side profile extraction ignores anything but provider, name and email", () => {
  const { publicUserFromSession } = policy();
  assert.deepEqual(
    publicUserFromSession({ user: { provider: "google", name: "Fixture Person", email: "f@example.test", image: "https://x" }, approved: true }),
    { provider: "google", name: "Fixture Person", email: "f@example.test" },
  );
  assert.deepEqual(publicUserFromSession({ user: { provider: "google", email: "f@example.test" } }), {
    provider: "google",
    name: null,
    email: "f@example.test",
  });
  for (const s of [null, undefined, {}, { user: {} }, { user: { provider: "google", name: "No Email" } }, "x"])
    assert.equal(publicUserFromSession(s), null, JSON.stringify(s));
});

// ------------------------------------------------------------- redirects

test("every redirect resolves to the canonical account page", () => {
  const { accountRedirect } = policy();
  const origin = "https://kubcode.dev";
  for (const url of [
    "/account",
    "https://kubcode.dev/account",
    "/",
    "https://evil.example/account",
    "//evil.example/account",
    "/\\evil.example",
    "\\\\evil.example",
    "https:evil.example",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://kubcode.dev.evil.example/account",
    "https://kubcode.dev@evil.example/account",
    "/account?next=https://evil.example",
    "",
  ])
    assert.equal(accountRedirect(url, origin), "https://kubcode.dev/account", url);
});

test("Vercel canonical proxy headers are accepted without a redirect loop", () => {
  assert.equal(policy().canonicalHostRedirect(new Headers({host: "kubcode.dev", "x-forwarded-host": "kubcode.dev", "x-forwarded-proto": "https"})), null);
});

test("non-canonical hosts are sent to the canonical account page before login", () => {
  const { canonicalHostRedirect } = policy();
  const h = (init: Record<string, string>) => new Headers(init);
  assert.equal(canonicalHostRedirect(h({ host: "kubcode.dev", "x-forwarded-proto": "https" })), null);
  assert.equal(canonicalHostRedirect(h({ host: "kubcode.dev" })), null);
  const attacks: Record<string, string>[] = [
    { host: "kubcode-preview.vercel.app" },
    { host: "www.kubcode.dev" },
    { host: "kubcode.dev", "x-forwarded-host": "evil.example" },
    { host: "kubcode.dev", "x-forwarded-host": "kubcode.dev, evil.example" },
    { host: "kubcode.dev", "x-forwarded-proto": "http" },
    { host: "kubcode.dev.evil.example" },
    {},
  ];
  for (const headers of attacks)
    assert.equal(canonicalHostRedirect(h(headers)), "https://kubcode.dev/account", JSON.stringify(headers));
});

// ---------------------------------------------------- errors and logging

test("client error text comes only from a fixed map", () => {
  const { authErrorMessage } = policy();
  assert.equal(authErrorMessage(undefined), null);
  const known = authErrorMessage("AccessDenied");
  assert.ok(known && known.length > 0);
  const generic = authErrorMessage("Default");
  for (const raw of [
    "<script>alert(1)</script>",
    "invalid_grant: FIXTURE provider error_description",
    "__proto__",
    "toString",
    ["AccessDenied", "x"],
  ]) {
    const message = authErrorMessage(raw);
    assert.equal(message, generic, JSON.stringify(raw));
  }
});

test("logger only emits fixed upper-case codes", () => {
  const { safeLogCode } = policy();
  assert.equal(safeLogCode("OAUTH_CALLBACK_ERROR"), "OAUTH_CALLBACK_ERROR");
  for (const raw of ["access_token=FIXTURE", "Error: FIXTURE body", { secret: "x" }, undefined])
    assert.equal(safeLogCode(raw), "UNKNOWN");
});

test("unconfigured auth responds with a safe 503 JSON body", async () => {
  const response = policy().authUnavailableResponse();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.code, "AUTH_NOT_CONFIGURED");
  assert.deepEqual(Object.keys(body).sort(), ["code", "message"]);
});

// -------------------------------------------------------------------- UI

type Form = typeof import("../components/AccountForm");
const form = () => load<Form>("../components/AccountForm");
const renderForm = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(form().AccountForm as never, props as never));

test("account UI has no email/password signup fields", () => {
  for (const props of [{ state: "unconfigured" }, { state: "signed-out", providers: { google: true, line: true } }]) {
    const html = renderForm(props);
    assert.doesNotMatch(html, /<input\b/, JSON.stringify(props));
    assert.doesNotMatch(html, /<(?:input|textarea)\b[^>]*(?:type|name)=["']password["']/i);
  }
});

test("unconfigured UI shows a disabled Google login and no fake success", () => {
  const html = renderForm({ state: "unconfigured" });
  const button = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.match(button, /Google/);
  assert.match(button, /\sdisabled(=""|\s|>)/);
  assert.doesNotMatch(html, /ออกจากระบบ|เข้าสู่ระบบแล้ว/);
});

test("configured signed-out UI offers an enabled Google login", () => {
  const html = renderForm({ state: "signed-out", providers: { google: true, line: false } });
  const button = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.match(button, /เข้าสู่ระบบด้วย Google/);
  assert.doesNotMatch(button, /\sdisabled(=""|\s|>)/);
  assert.match(html, /href="\/privacy"/);
});

test("signed-out UI shows only the server-mapped error message", () => {
  const html = renderForm({ state: "signed-out", providers: { google: true, line: false }, errorMessage: "FIXED MESSAGE" });
  assert.match(html, /FIXED MESSAGE/);
});

test("signed-in UI shows name, email, logout and the membership distinction", () => {
  const html = renderForm({
    state: "signed-in",
    user: { provider: "google", name: "Fixture Person", email: "fixture.person@example.test" },
  });
  assert.match(html, /Fixture Person/);
  assert.match(html, /fixture\.person@example\.test/);
  assert.match(html, /ออกจากระบบ/);
  assert.match(html, /ยังไม่ใช่สมาชิกที่ได้รับอนุมัติ/);
  assert.match(html, /ระบบอนุมัติสมาชิกยังไม่พร้อม/);
  assert.doesNotMatch(html, /<img\b/);
  assert.doesNotMatch(html, /อนุมัติแล้ว|ดาวน์โหลดได้|รออนุมัติ/);
});

test("client actions use the library CSRF-protected flows with account landing", async () => {
  const { startGoogleSignIn, startSignOut } = form();
  clientCalls.length = 0;
  await startGoogleSignIn();
  await startSignOut();
  assert.deepEqual(clientCalls, [
    ["signIn", "google", { callbackUrl: "/account" }],
    ["signOut", { callbackUrl: "/account" }],
  ]);
});

test("privacy page states the actual data use without compliance promises", () => {
  const Privacy = load<{ default: () => unknown }>("../app/privacy/page").default;
  const html = renderToStaticMarkup(createElement(Privacy as never));
  assert.match(html, /Google/);
  assert.match(html, /อีเมล/);
  assert.match(html, /คุกกี้/);
  assert.match(html, /เข้ารหัส/);
  assert.match(html, /ไม่ได้บันทึก/);
  assert.match(html, /Drive/);
  assert.match(html, /Gmail/);
  assert.match(html, /รหัสผ่าน/);
  assert.doesNotMatch(html, /ปฏิบัติตาม (PDPA|GDPR)|compliant|ไม่มี log|ไม่มีการบันทึก log/i);
});

test("download route remains unavailable", () => {
  const source = readFileSync(join(root, "app/api/download/[slug]/route.ts"), "utf8");
  assert.match(source, /503/);
});

// ------------------------------------------- library-backed (next-auth v4)

const routePath = join(root, "app/api/auth/[...nextauth]/route.ts");

test("auth route file exists and pins the Node runtime", () => {
  assert.ok(existsSync(routePath), "app/api/auth/[...nextauth]/route.ts must exist");
  const source = readFileSync(routePath, "utf8");
  assert.match(source, /export const runtime = "nodejs"/);
  assert.match(source, /export const dynamic = "force-dynamic"/);
});

test("package pins next-auth to exactly 4.24.15", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.dependencies?.["next-auth"], "4.24.15");
});

type Auth = typeof import("../lib/auth");
const auth = () => load<Auth>("../lib/auth");

function fixtureOptions() {
  const result = policy().readAuthConfig({ ...FIXTURE_ENV });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return auth().buildAuthOptions(result.config);
}

test("options (Google-only env): only Google, minimal scope, PKCE/state/nonce, JWT, secure cookies", () => {
  const options = fixtureOptions();
  assert.equal(options.providers.length, 1);
  const google = options.providers[0] as unknown as {
    id: string;
    options: { checks: string[]; authorization: { params: Record<string, string> } };
  };
  assert.equal(google.id, "google");
  assert.deepEqual([...google.options.checks].sort(), ["nonce", "pkce", "state"]);
  assert.deepEqual(google.options.authorization.params, { scope: "openid email profile" });
  assert.equal(options.session?.strategy, "jwt");
  assert.ok((options.session?.maxAge ?? Infinity) <= 7 * 24 * 60 * 60);
  assert.equal(options.useSecureCookies, true);
  assert.equal(options.debug, false);
  const cookie = options.cookies?.sessionToken;
  assert.equal(cookie?.name, "__Secure-next-auth.session-token");
  assert.equal(cookie?.options.httpOnly, true);
  assert.equal(cookie?.options.sameSite, "lax");
  assert.equal(cookie?.options.secure, true);
});

test("options callbacks discard provider credentials and pin redirects", async () => {
  const options = fixtureOptions();
  const cb = options.callbacks!;
  const account = {
    ...googleAccount,
    providerAccountId: "fixture-sub-0001",
    access_token: "FIXTURE-access-token",
    refresh_token: "FIXTURE-refresh-token",
    id_token: "FIXTURE-id-token",
  };
  const token = await cb.jwt!({
    token: { name: "Fixture Person", email: verifiedProfile.email, picture: verifiedProfile.picture, sub: "fixture-sub-0001" },
    account: account as never,
    profile: verifiedProfile as never,
    user: { id: "fixture-sub-0001" } as never,
    trigger: "signIn",
  });
  assert.deepEqual(token, { provider: "google", sub: "fixture-sub-0001", name: "Fixture Person", email: verifiedProfile.email });
  assert.equal(await cb.signIn!({ account: account as never, profile: { ...verifiedProfile, email_verified: false } as never, user: {} as never }), false);
  assert.equal(await cb.redirect!({ url: "https://evil.example", baseUrl: "https://evil.example" }), "https://kubcode.dev/account");
});

test("auth lifecycle emits only fixed verification markers without identity or tokens", async () => {
  const options = fixtureOptions();
  assert.equal(typeof options.events?.signIn, "function");
  assert.equal(typeof options.events?.signOut, "function");
  const seen: unknown[][] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => { seen.push(args); };
  try {
    await options.events!.signIn!({ user: { id: "fixture", email: "fixture@example.invalid" }, account: { provider: "google" }, profile: { access_token: "FIXTURE-NOT-A-REAL-TOKEN" } } as never);
    await options.events!.signOut!({ token: { email: "fixture@example.invalid", access_token: "FIXTURE-NOT-A-REAL-TOKEN" } } as never);
  } finally { console.info = original; }
  assert.deepEqual(seen, [["[auth-event] GOOGLE_SIGNIN_VERIFIED"], ["[auth-event] SIGNOUT_COMPLETED"]]);
});

test("options logger never forwards metadata", () => {
  const options = fixtureOptions();
  const seen: unknown[][] = [];
  const original = { error: console.error, warn: console.warn, debug: console.debug, log: console.log };
  console.error = console.warn = console.debug = console.log = (...a: unknown[]) => void seen.push(a);
  try {
    options.logger!.error!("OAUTH_CALLBACK_ERROR", { error: new Error("FIXTURE-SECRET-BODY"), providerId: "google" } as never);
    options.logger!.warn!("NEXTAUTH_URL" as never);
    options.logger!.debug!("PROFILE", { email: "f@example.test", access_token: "FIXTURE" });
  } finally {
    Object.assign(console, original);
  }
  assert.doesNotMatch(JSON.stringify(seen), /FIXTURE|example\.test|google/);
});

test("real library JWT rejects tampered, wrong-secret and expired tokens", async () => {
  const { encode, decode } = load<typeof import("next-auth/jwt")>("next-auth/jwt");
  const secret = FIXTURE_ENV.NEXTAUTH_SECRET;
  const payload = { sub: "fixture-sub-0001", name: "Fixture Person", email: verifiedProfile.email };
  const jwt = await encode({ token: payload, secret, maxAge: 60 });
  const decoded = await decode({ token: jwt, secret });
  assert.equal(decoded?.email, payload.email);
  const flipped = jwt.slice(0, -4) + (jwt.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
  await assert.rejects(decode({ token: flipped, secret }));
  await assert.rejects(decode({ token: jwt, secret: "FIXTURE-ONLY-other-secret-00000000000000000002" }));
  const expired = await encode({ token: payload, secret, maxAge: -120 });
  await assert.rejects(decode({ token: expired, secret }));
});

test("route fails 503 when unconfigured and redirects alias hosts", async () => {
  const saved = { ...process.env };
  const route = load<typeof import("../app/api/auth/[...nextauth]/route")>("../app/api/auth/[...nextauth]/route");
  const { NextRequest } = load<typeof import("next/server")>("next/server");
  const ctx = { params: Promise.resolve({ nextauth: ["session"] }) };
  const allKeys = [...Object.keys(FIXTURE_ENV), "LINE_CLIENT_ID", "LINE_CLIENT_SECRET"];
  try {
    for (const key of allKeys) delete process.env[key];
    for (const method of ["GET", "POST"] as const) {
      const res = await route[method](new NextRequest("https://kubcode.dev/api/auth/session", { method, headers: { host: "kubcode.dev" } }), ctx);
      assert.equal(res.status, 503);
      const text = await res.text();
      assert.match(text, /AUTH_NOT_CONFIGURED/);
    }
    Object.assign(process.env, FIXTURE_ENV);
    const res = await route.GET(
      new NextRequest("https://kubcode-preview.vercel.app/api/auth/signin/google", { headers: { host: "kubcode-preview.vercel.app" } }),
      { params: Promise.resolve({ nextauth: ["signin", "google"] }) },
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "https://kubcode.dev/account");
    assert.equal(res.headers.get("set-cookie"), null);
  } finally {
    for (const key of allKeys) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("account view is unconfigured without touching the session when env is invalid", async () => {
  const view = await auth().getAccountView({});
  assert.deepEqual(view, { state: "unconfigured" });
});
