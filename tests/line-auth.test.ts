// LINE login (next-auth v4 LINE provider, JWT-only) + multi-provider contract tests.
// Every credential, profile, ID token, session and Channel ID below is fictional
// TEST DATA. Nothing here proves a real LINE sign-in or consent screen works.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = join(__dirname, "..");

// Node cannot load CSS modules; stub them as identity class maps. The
// next-auth client helpers are replaced with a recorder (no network).
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

function load<T>(path: string): T {
  try {
    return require(path) as T;
  } catch (error) {
    assert.fail(`${path} is not loadable: ${String((error as Error).message).split("\n")[0]}`);
  }
}

type Policy = typeof import("../lib/auth-policy");
const policy = () => load<Policy>("../lib/auth-policy");
type Auth = typeof import("../lib/auth");
const auth = () => load<Auth>("../lib/auth");

// Fictional, explicitly-labelled fixtures. Not real credentials or channels.
const SHARED = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
});
const GOOGLE = Object.freeze({
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
});
const LINE = Object.freeze({
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
});
const AUTH_KEYS = [...Object.keys(SHARED), ...Object.keys(GOOGLE), ...Object.keys(LINE)];

type Env = Record<string, string | undefined>;
const ready = (env: Env) => {
  const p = policy();
  return p.providerReadiness(p.readAuthConfig(env));
};

// ---------------------------------------------------------------- config

test("access-denied text is provider-neutral and fixed", () => {
  const text = policy().authErrorMessage("AccessDenied");
  assert.ok(text);
  assert.doesNotMatch(text, /Google|LINE|อีเมล|email/i);
});

test("LINE-only configuration is usable without any Google variables", () => {
  const { readAuthConfig, LINE_CALLBACK_URL } = policy();
  const result = readAuthConfig({ ...SHARED, ...LINE });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.config.origin, "https://kubcode.dev");
  assert.equal(result.config.google, null);
  assert.equal(result.config.line?.clientId, LINE.LINE_CLIENT_ID);
  assert.deepEqual(ready({ ...SHARED, ...LINE }), { google: false, line: true });
  assert.equal(LINE_CALLBACK_URL, "https://kubcode.dev/api/auth/callback/line");
});

test("both providers configured are both ready", () => {
  assert.deepEqual(ready({ ...SHARED, ...GOOGLE, ...LINE }), { google: true, line: true });
  assert.deepEqual(ready({ ...SHARED, ...GOOGLE }), { google: true, line: false });
});

const badLine: Env[] = [
  {},
  { LINE_CLIENT_ID: LINE.LINE_CLIENT_ID },
  { LINE_CLIENT_SECRET: LINE.LINE_CLIENT_SECRET },
  { ...LINE, LINE_CLIENT_ID: "" },
  { ...LINE, LINE_CLIENT_ID: "abc" },
  { ...LINE, LINE_CLIENT_ID: "12345" },
  { ...LINE, LINE_CLIENT_ID: "0000000000" },
  { ...LINE, LINE_CLIENT_ID: "-2000000001" },
  { ...LINE, LINE_CLIENT_ID: "2000000001.5" },
  { ...LINE, LINE_CLIENT_ID: "your-channel-id" },
  { ...LINE, LINE_CLIENT_ID: ` ${LINE.LINE_CLIENT_ID}` },
  { ...LINE, LINE_CLIENT_ID: `${LINE.LINE_CLIENT_ID}\n` },
  { ...LINE, LINE_CLIENT_SECRET: "" },
  { ...LINE, LINE_CLIENT_SECRET: "changeme" },
  { ...LINE, LINE_CLIENT_SECRET: "your_line_channel_secret" },
  { ...LINE, LINE_CLIENT_SECRET: "short" },
  { ...LINE, LINE_CLIENT_SECRET: "x".repeat(40) },
  { ...LINE, LINE_CLIENT_SECRET: `${LINE.LINE_CLIENT_SECRET}\n` },
  { ...LINE, LINE_CLIENT_SECRET: `\t${LINE.LINE_CLIENT_SECRET}` },
];

test("Google stays ready when LINE is absent, partial or malformed", () => {
  for (const line of badLine) {
    const result = policy().readAuthConfig({ ...SHARED, ...GOOGLE, ...line });
    assert.equal(result.ok, true, JSON.stringify(line));
    assert.deepEqual(ready({ ...SHARED, ...GOOGLE, ...line }), { google: true, line: false }, JSON.stringify(line));
  }
});

test("LINE stays ready when Google is absent, partial or malformed", () => {
  const badGoogle: Env[] = [
    {},
    { GOOGLE_CLIENT_ID: GOOGLE.GOOGLE_CLIENT_ID },
    { GOOGLE_CLIENT_SECRET: GOOGLE.GOOGLE_CLIENT_SECRET },
    { ...GOOGLE, GOOGLE_CLIENT_ID: "123456789012-abcdefgh.example.com" },
    { ...GOOGLE, GOOGLE_CLIENT_SECRET: "changeme" },
    { ...GOOGLE, GOOGLE_CLIENT_SECRET: ` ${GOOGLE.GOOGLE_CLIENT_SECRET}` },
  ];
  for (const google of badGoogle)
    assert.deepEqual(ready({ ...SHARED, ...LINE, ...google }), { google: false, line: true }, JSON.stringify(google));
});

test("no usable provider fails closed even when shared config is valid", () => {
  const { readAuthConfig } = policy();
  assert.equal(readAuthConfig({ ...SHARED }).ok, false);
  assert.equal(readAuthConfig({ ...SHARED, LINE_CLIENT_ID: LINE.LINE_CLIENT_ID }).ok, false);
  assert.equal(
    readAuthConfig({ ...SHARED, ...GOOGLE, ...LINE, GOOGLE_CLIENT_SECRET: "changeme", LINE_CLIENT_ID: "abc" }).ok,
    false,
  );
  assert.deepEqual(ready({ ...SHARED }), { google: false, line: false });
});

test("bad shared NEXTAUTH config disables every provider", () => {
  const { readAuthConfig } = policy();
  const shared: Env[] = [
    { NEXTAUTH_URL: undefined },
    { NEXTAUTH_URL: "http://kubcode.dev" },
    { NEXTAUTH_URL: "https://www.kubcode.dev" },
    { NEXTAUTH_SECRET: undefined },
    { NEXTAUTH_SECRET: "short-but-not-32-characters" },
    { NEXTAUTH_SECRET: `${SHARED.NEXTAUTH_SECRET} ` },
    { NEXTAUTH_SECRET: `${LINE.LINE_CLIENT_SECRET}-padding-0000` },
    { NEXTAUTH_SECRET: "FIXTURE-ONLY-line-channel-secret-01-but-longer" , LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01-but-longer" },
  ];
  for (const change of shared) {
    const env = { ...SHARED, ...GOOGLE, ...LINE, ...change };
    assert.equal(readAuthConfig(env).ok, false, JSON.stringify(change));
    assert.deepEqual(ready(env), { google: false, line: false }, JSON.stringify(change));
  }
});

test("a malformed short LINE secret cannot trip the session-secret reuse check", () => {
  // "FIXTURE" appears inside NEXTAUTH_SECRET, but it is not a usable secret.
  assert.deepEqual(ready({ ...SHARED, ...GOOGLE, LINE_CLIENT_ID: LINE.LINE_CLIENT_ID, LINE_CLIENT_SECRET: "FIXTURE" }), {
    google: true,
    line: false,
  });
});

test("LINE secrets exposed through NEXT_PUBLIC_ fail closed", () => {
  const { readAuthConfig } = policy();
  assert.equal(
    readAuthConfig({ ...SHARED, ...GOOGLE, ...LINE, NEXT_PUBLIC_LINE_CLIENT_SECRET: LINE.LINE_CLIENT_SECRET }).ok,
    false,
  );
});

test("LINE config problems report variable names and reasons only, never values", () => {
  const result = policy().readAuthConfig({
    ...SHARED,
    LINE_CLIENT_ID: "FIXTURE-LEAK-CANARY-ID",
    LINE_CLIENT_SECRET: "FIXTURE-LEAK-CANARY-SECRET ",
  });
  assert.equal(result.ok, false);
  assert.doesNotMatch(JSON.stringify(result), /LEAK-CANARY/);
  const variables = result.problems.map((p) => p.variable);
  assert.ok(variables.includes("LINE_CLIENT_ID"));
  assert.ok(variables.includes("LINE_CLIENT_SECRET"));
});

test("readiness exposes only provider booleans, never keys or validation details", () => {
  const readiness = ready({ ...SHARED, ...GOOGLE, ...LINE, LINE_CLIENT_ID: "abc" });
  assert.deepEqual(Object.keys(readiness).sort(), ["google", "line"]);
  for (const value of Object.values(readiness)) assert.equal(typeof value, "boolean");
  assert.doesNotMatch(JSON.stringify(readiness), /FIXTURE|abc|malformed|CLIENT/);
});

// ------------------------------------------------------- trusted identity

const lineAccount = { provider: "line", type: "oauth", providerAccountId: "Ufixture0000000000000000000000001" };
const lineProfile = {
  iss: "https://access.line.me",
  sub: "Ufixture0000000000000000000000001",
  aud: LINE.LINE_CLIENT_ID,
  exp: 2,
  iat: 1,
  amr: ["linesso"],
  name: "Fixture LINE Person",
  picture: "https://example.test/line-avatar.png",
};
const googleAccount = { provider: "google", type: "oauth", providerAccountId: "fixture-sub-0001" };
const googleProfile = {
  sub: "fixture-sub-0001",
  name: "Fixture Person",
  email: "fixture.person@example.test",
  email_verified: true,
};

test("LINE sign-in is trusted on provider, type and stable subject, without email", () => {
  const { isTrustedSignIn } = policy();
  assert.equal(isTrustedSignIn({ account: lineAccount, profile: lineProfile }), true);
  assert.equal(isTrustedSignIn({ account: lineAccount, profile: { ...lineProfile, name: undefined } }), true);
  for (const change of [{ sub: "" }, { sub: undefined }, { sub: 12345 }, { sub: null }])
    assert.equal(isTrustedSignIn({ account: lineAccount, profile: { ...lineProfile, ...change } }), false, JSON.stringify(change));
  for (const account of [
    { ...lineAccount, type: "oidc" },
    { ...lineAccount, type: "credentials" },
    { ...lineAccount, type: "email" },
    { ...lineAccount, provider: "github" },
    { ...lineAccount, provider: "LINE" },
    { ...lineAccount, provider: undefined },
    null,
    "line",
  ])
    assert.equal(isTrustedSignIn({ account, profile: lineProfile }), false, JSON.stringify(account));
  assert.equal(isTrustedSignIn({ account: lineAccount, profile: null }), false);
});

test("a LINE profile is not accepted under the Google rules and vice versa", () => {
  const { isTrustedSignIn } = policy();
  // Google still demands email_verified === true and an email.
  assert.equal(isTrustedSignIn({ account: googleAccount, profile: lineProfile }), false);
  assert.equal(isTrustedSignIn({ account: googleAccount, profile: googleProfile }), true);
  for (const change of [{ email_verified: false }, { email_verified: "true" }, { email: "" }, { sub: "" }])
    assert.equal(isTrustedSignIn({ account: googleAccount, profile: { ...googleProfile, ...change } }), false);
});

// ------------------------------------------------ token/session whitelist

test("LINE initial token keeps only provider, subject and name; email is discarded", () => {
  const { tokenFromSignIn } = policy();
  const withEmail = {
    ...lineProfile,
    email: "fixture.line@example.test",
    email_verified: true,
    access_token: "FIXTURE-access-token",
    id_token: "FIXTURE-id-token",
  };
  assert.deepEqual(tokenFromSignIn({ account: lineAccount, profile: withEmail }), {
    provider: "line",
    sub: lineProfile.sub,
    name: "Fixture LINE Person",
  });
  assert.deepEqual(tokenFromSignIn({ account: lineAccount, profile: { ...lineProfile, name: "" } }), {
    provider: "line",
    sub: lineProfile.sub,
    name: null,
  });
  assert.deepEqual(tokenFromSignIn({ account: googleAccount, profile: googleProfile }), {
    provider: "google",
    sub: googleProfile.sub,
    name: googleProfile.name,
    email: googleProfile.email,
  });
});

test("initial token is refused for unknown providers or missing subjects", () => {
  const { tokenFromSignIn } = policy();
  assert.equal(tokenFromSignIn({ account: { provider: "github", type: "oauth" }, profile: googleProfile }), null);
  assert.equal(tokenFromSignIn({ account: lineAccount, profile: { ...lineProfile, sub: "" } }), null);
  assert.equal(tokenFromSignIn({ account: null, profile: lineProfile }), null);
  assert.equal(tokenFromSignIn({ account: googleAccount, profile: { ...googleProfile, email: undefined } }), null);
});

test("stored tokens are re-whitelisted per provider and unknown providers are emptied", () => {
  const { minimalToken } = policy();
  const junk = { picture: "https://x", access_token: "FIXTURE", approved: true, iat: 1, exp: 2, jti: "x" };
  assert.deepEqual(
    minimalToken({ provider: "line", sub: "Ufixture-a", name: "N", email: "smuggled@example.test", ...junk }),
    { provider: "line", sub: "Ufixture-a", name: "N" },
  );
  assert.deepEqual(minimalToken({ provider: "line", sub: "Ufixture-a" }), { provider: "line", sub: "Ufixture-a" });
  assert.deepEqual(
    minimalToken({ provider: "google", sub: "g-1", name: "N", email: "g@example.test", ...junk }),
    { provider: "google", sub: "g-1", name: "N", email: "g@example.test" },
  );
  for (const bad of [
    { provider: "line" },
    { provider: "line", sub: "" },
    { provider: "google", sub: "g-1" },
    { provider: "github", sub: "g-1", email: "g@example.test" },
    { provider: "Google", sub: "g-1", email: "g@example.test" },
    { provider: 1, sub: "g-1", email: "g@example.test" },
    { provider: null, sub: "g-1", email: "g@example.test" },
    null,
    "x",
  ])
    assert.deepEqual(minimalToken(bad), {}, JSON.stringify(bad));
});

test("legacy provider-less sessions migrate only as Google with subject and email", () => {
  const { minimalToken } = policy();
  assert.deepEqual(minimalToken({ sub: "legacy-1", name: "Legacy", email: "legacy@example.test", iat: 1 }), {
    provider: "google",
    sub: "legacy-1",
    name: "Legacy",
    email: "legacy@example.test",
  });
  // A provider-less token without an email is never inferred to be LINE.
  assert.deepEqual(minimalToken({ sub: "Ufixture-legacy", name: "No Email" }), {});
  assert.deepEqual(minimalToken({ name: "x", email: "legacy@example.test" }), {});
});

test("same subject or email under different providers never merges identities", () => {
  const { minimalToken, toPublicSession } = policy();
  const g = minimalToken({ provider: "google", sub: "shared-sub", name: "A", email: "same@example.test" });
  const l = minimalToken({ provider: "line", sub: "shared-sub", name: "A", email: "same@example.test" });
  assert.notDeepEqual(g, l);
  assert.equal(g.provider, "google");
  assert.equal(l.provider, "line");
  assert.equal(l.email, undefined);
  const expires = "2026-11-04T00:00:00.000Z";
  assert.equal(toPublicSession(g, expires).user?.provider, "google");
  assert.equal(toPublicSession(l, expires).user?.provider, "line");
});

test("public LINE session exposes provider and name with null email, never subject", () => {
  const { toPublicSession } = policy();
  const expires = "2026-11-04T00:00:00.000Z";
  const session = toPublicSession(
    { provider: "line", sub: "Ufixture-secret-sub", name: "Fixture LINE Person", id_token: "FIXTURE", approved: true },
    expires,
  );
  assert.deepEqual(session, { user: { provider: "line", name: "Fixture LINE Person", email: null }, expires });
  assert.doesNotMatch(JSON.stringify(session), /Ufixture|token|approved|sub"|download|@/);
  assert.deepEqual(toPublicSession({ provider: "line", sub: "Ufixture-x" }, expires), {
    user: { provider: "line", name: null, email: null },
    expires,
  });
  assert.deepEqual(toPublicSession({ provider: "github", sub: "x", email: "x@example.test" }, expires), { expires });
});

test("server-side profile accepts LINE without email and fails closed on bad data", () => {
  const { publicUserFromSession } = policy();
  assert.deepEqual(publicUserFromSession({ user: { provider: "line", name: "Fixture", email: null } }), {
    provider: "line",
    name: "Fixture",
    email: null,
  });
  assert.deepEqual(publicUserFromSession({ user: { provider: "line" } }), { provider: "line", name: null, email: null });
  // Any email on a LINE session is discarded rather than displayed.
  assert.deepEqual(publicUserFromSession({ user: { provider: "line", name: "F", email: "x@example.test" } }), {
    provider: "line",
    name: "F",
    email: null,
  });
  for (const s of [
    null,
    { user: null },
    { user: { name: "No Provider", email: "x@example.test" } },
    { user: { provider: "github", name: "x", email: "x@example.test" } },
    { user: { provider: "google", name: "No Email" } },
    { user: { provider: 7 } },
  ])
    assert.equal(publicUserFromSession(s), null, JSON.stringify(s));
});

// ------------------------------------------------------ library options

function options(env: Env) {
  const result = policy().readAuthConfig(env);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return auth().buildAuthOptions(result.config);
}
type ProviderShape = {
  id: string;
  type: string;
  wellKnown?: string;
  idToken?: boolean;
  client?: Record<string, unknown>;
  options: {
    clientId: string;
    checks: string[];
    authorization: { params: Record<string, string> };
    allowDangerousEmailAccountLinking?: boolean;
    profile: (p: Record<string, unknown>) => Record<string, unknown>;
    client?: unknown;
    wellKnown?: unknown;
    idToken?: unknown;
  };
};
const providerIds = (env: Env) => options(env).providers.map((p) => p.id);

test("only ready providers are registered with the library", () => {
  assert.deepEqual(providerIds({ ...SHARED, ...GOOGLE }), ["google"]);
  assert.deepEqual(providerIds({ ...SHARED, ...GOOGLE, LINE_CLIENT_ID: "abc", LINE_CLIENT_SECRET: "x" }), ["google"]);
  assert.deepEqual(providerIds({ ...SHARED, ...LINE }), ["line"]);
  assert.deepEqual(providerIds({ ...SHARED, ...GOOGLE, ...LINE }), ["google", "line"]);
});

test("LINE provider keeps OIDC HS256 ID-token validation with PKCE/state/nonce and openid profile only", () => {
  const all = options({ ...SHARED, ...GOOGLE, ...LINE });
  const line = all.providers.find((p) => p.id === "line") as unknown as ProviderShape;
  assert.ok(line, "LINE provider registered");
  assert.equal(line.type, "oauth");
  assert.equal(line.wellKnown, "https://access.line.me/.well-known/openid-configuration");
  assert.equal(line.idToken, true);
  assert.equal(line.client?.id_token_signed_response_alg, "HS256");
  // User options must not override the library's OIDC client/discovery settings.
  assert.equal(line.options.client, undefined);
  assert.equal(line.options.wellKnown, undefined);
  assert.equal(line.options.idToken, undefined);
  assert.equal(line.options.clientId, LINE.LINE_CLIENT_ID);
  assert.deepEqual([...line.options.checks].sort(), ["nonce", "pkce", "state"]);
  assert.deepEqual(line.options.authorization.params, { scope: "openid profile" });
  assert.doesNotMatch(line.options.authorization.params.scope, /email|offline|message|friend/);
  for (const provider of all.providers as unknown as ProviderShape[])
    assert.notEqual(provider.options.allowDangerousEmailAccountLinking, true, provider.id);
  assert.equal(all.adapter, undefined);
  assert.equal(all.session?.strategy, "jwt");
  assert.equal(all.useSecureCookies, true);
});

test("LINE provider profile maps the subject and discards email and picture", () => {
  const line = options({ ...SHARED, ...LINE }).providers[0] as unknown as ProviderShape;
  assert.deepEqual(line.options.profile({ ...lineProfile, email: "fixture.line@example.test" }), {
    id: lineProfile.sub,
    name: "Fixture LINE Person",
    email: null,
    image: null,
  });
});

test("real openid-client validation of an HS256 LINE ID token with the provider's client settings", async () => {
  const { Issuer, TokenSet } = load<typeof import("openid-client")>("openid-client");
  const { SignJWT } = load<typeof import("jose")>("jose");
  const line = options({ ...SHARED, ...LINE }).providers[0] as unknown as ProviderShape;
  // Offline issuer metadata standing in for LINE discovery; no network request.
  const issuer = new Issuer({ issuer: "https://access.line.me", jwks_uri: "https://access.line.me/fixture-jwks" });
  // validateIdToken is the method client.callback() runs for idToken providers;
  // it is public at runtime but missing from openid-client's .d.ts.
  const client = new issuer.Client({
    client_id: LINE.LINE_CLIENT_ID,
    client_secret: LINE.LINE_CLIENT_SECRET,
    redirect_uris: [policy().LINE_CALLBACK_URL],
    ...line.client,
  }) as unknown as {
    validateIdToken: (t: InstanceType<typeof TokenSet>, nonce: string, by: string) => Promise<InstanceType<typeof TokenSet>>;
  };
  const now = Math.floor(Date.now() / 1000);
  const nonce = "fixture-nonce-0001";
  const sign = (claims: Record<string, unknown>, secret: string = LINE.LINE_CLIENT_SECRET, alg = "HS256") =>
    new SignJWT({ nonce, name: "Fixture LINE Person", ...claims })
      .setProtectedHeader({ alg })
      .setIssuer((claims.iss as string) ?? "https://access.line.me")
      .setAudience((claims.aud as string) ?? LINE.LINE_CLIENT_ID)
      .setSubject(lineProfile.sub)
      .setIssuedAt(now)
      .setExpirationTime((claims.exp as number) ?? now + 600)
      .sign(new TextEncoder().encode(secret));
  const validate = async (idToken: string, expectedNonce = nonce) =>
    client.validateIdToken(new TokenSet({ id_token: idToken }), expectedNonce, "token");

  const ok = await validate(await sign({}));
  assert.equal(ok.claims().sub, lineProfile.sub);
  await assert.rejects(validate(await sign({}, "FIXTURE-ONLY-wrong-channel-secret-02")), /signature/);
  await assert.rejects(validate(await sign({}, LINE.LINE_CLIENT_SECRET, "HS512")), /unexpected JWT alg/);
  await assert.rejects(validate(await sign({ aud: "2000000002" })), /aud mismatch/);
  await assert.rejects(validate(await sign({ iss: "https://evil.example" })), /unexpected iss/);
  await assert.rejects(validate(await sign({ exp: now - 600 })), /expired/);
  await assert.rejects(validate(await sign({}), "fixture-nonce-other"), /nonce mismatch/);
  await assert.rejects(validate(await sign({ nonce: undefined })), /nonce/);
});

test("jwt callback: LINE initial sign-in stores minimal fields; unknown accounts get an empty token", async () => {
  const cb = options({ ...SHARED, ...GOOGLE, ...LINE }).callbacks!;
  const rawProfile = { ...lineProfile, email: "fixture.line@example.test" };
  const account = { ...lineAccount, access_token: "FIXTURE-access", refresh_token: "FIXTURE-refresh", id_token: "FIXTURE-id" };
  const defaultToken = { name: "Fixture LINE Person", email: "fixture.line@example.test", picture: lineProfile.picture, sub: lineProfile.sub };
  const token = await cb.jwt!({ token: defaultToken, account: account as never, profile: rawProfile as never, user: { id: lineProfile.sub } as never, trigger: "signIn" });
  assert.deepEqual(token, { provider: "line", sub: lineProfile.sub, name: "Fixture LINE Person" });
  const unknown = await cb.jwt!({
    token: { name: "x", email: "x@example.test", sub: "x" },
    account: { provider: "github", type: "oauth", providerAccountId: "x" } as never,
    profile: { sub: "x", email: "x@example.test", email_verified: true } as never,
    user: { id: "x" } as never,
    trigger: "signIn",
  });
  assert.deepEqual(unknown, {});
  const later = await cb.jwt!({ token: { provider: "line", sub: lineProfile.sub, name: "N", iat: 1 } as never, trigger: "update" } as never);
  assert.deepEqual(later, { provider: "line", sub: lineProfile.sub, name: "N" });
  assert.equal(await cb.signIn!({ account: account as never, profile: lineProfile as never, user: {} as never }), true);
  assert.equal(await cb.signIn!({ account: { ...account, provider: "github" } as never, profile: lineProfile as never, user: {} as never }), false);
});

test("lifecycle markers are fixed per provider and unknown accounts emit nothing", async () => {
  const events = options({ ...SHARED, ...GOOGLE, ...LINE }).events!;
  const seen: unknown[][] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => void seen.push(args);
  try {
    const profile = { name: "Fixture", email: "fixture@example.invalid", access_token: "FIXTURE-NOT-A-REAL-TOKEN" };
    await events.signIn!({ user: { id: "Ufixture" }, account: { provider: "line", type: "oauth" }, profile } as never);
    await events.signIn!({ user: { id: "g" }, account: { provider: "google", type: "oauth" }, profile } as never);
    await events.signIn!({ user: { id: "x" }, account: { provider: "github", type: "oauth" }, profile } as never);
    await events.signIn!({ user: { id: "x" }, account: null, profile } as never);
    await events.signOut!({ token: { provider: "line", sub: "Ufixture" } } as never);
  } finally {
    console.info = original;
  }
  assert.deepEqual(seen, [
    ["[auth-event] LINE_SIGNIN_VERIFIED"],
    ["[auth-event] GOOGLE_SIGNIN_VERIFIED"],
    ["[auth-event] SIGNOUT_COMPLETED"],
  ]);
});

test("logger drops LINE metadata", () => {
  const logger = options({ ...SHARED, ...LINE }).logger!;
  const seen: unknown[][] = [];
  const original = { error: console.error, warn: console.warn, debug: console.debug, log: console.log };
  console.error = console.warn = console.debug = console.log = (...a: unknown[]) => void seen.push(a);
  try {
    logger.error!("OAUTH_CALLBACK_ERROR", { error: new Error("FIXTURE-LINE-BODY"), providerId: "line" } as never);
    logger.debug!("PROFILE_DATA", { OAuthProfile: lineProfile });
  } finally {
    Object.assign(console, original);
  }
  assert.doesNotMatch(JSON.stringify(seen), /FIXTURE|Ufixture|line/);
});

test("route: LINE-only env serves alias redirects and keeps _log disabled; partial LINE alone is 503", async () => {
  const saved = { ...process.env };
  const route = load<typeof import("../app/api/auth/[...nextauth]/route")>("../app/api/auth/[...nextauth]/route");
  const { NextRequest } = load<typeof import("next/server")>("next/server");
  const silence = console.warn;
  console.warn = () => {};
  try {
    for (const key of AUTH_KEYS) delete process.env[key];
    Object.assign(process.env, SHARED, { LINE_CLIENT_ID: LINE.LINE_CLIENT_ID });
    const unavailable = await route.GET(
      new NextRequest("https://kubcode.dev/api/auth/session", { headers: { host: "kubcode.dev" } }),
      { params: Promise.resolve({ nextauth: ["session"] }) },
    );
    assert.equal(unavailable.status, 503);
    Object.assign(process.env, LINE);
    const alias = await route.GET(
      new NextRequest("https://kubcode-preview.vercel.app/api/auth/signin/line", { headers: { host: "kubcode-preview.vercel.app" } }),
      { params: Promise.resolve({ nextauth: ["signin", "line"] }) },
    );
    assert.equal(alias.status, 303);
    assert.equal(alias.headers.get("location"), "https://kubcode.dev/account");
    assert.equal(alias.headers.get("set-cookie"), null);
    const log = await route.POST(
      new NextRequest("https://kubcode.dev/api/auth/_log", { method: "POST", headers: { host: "kubcode.dev" }, body: "message=LINE_SIGNIN_VERIFIED" }),
      { params: Promise.resolve({ nextauth: ["_log"] }) },
    );
    assert.equal(log.status, 404);
  } finally {
    console.warn = silence;
    for (const key of AUTH_KEYS) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("account view is unconfigured when only a partial LINE config exists", async () => {
  assert.deepEqual(await auth().getAccountView({ ...SHARED, LINE_CLIENT_ID: "abc" }), { state: "unconfigured" });
});

// -------------------------------------------------------------------- UI

type Form = typeof import("../components/AccountForm");
const form = () => load<Form>("../components/AccountForm");
const renderForm = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(form().AccountForm as never, props as never));
const buttons = (html: string) => html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
const isDisabled = (button: string) => /\sdisabled(=""|\s|>)/.test(button);
const lineButton = (html: string) => buttons(html).find((b) => /LINE/.test(b)) ?? "";
const googleButton = (html: string) => buttons(html).find((b) => /Google/.test(b)) ?? "";

test("signed-out UI enables Google and LINE independently", () => {
  const both = renderForm({ state: "signed-out", providers: { google: true, line: true } });
  assert.match(googleButton(both), /เข้าสู่ระบบด้วย Google/);
  assert.match(lineButton(both), /เข้าสู่ระบบด้วย LINE/);
  assert.equal(isDisabled(googleButton(both)), false);
  assert.equal(isDisabled(lineButton(both)), false);

  const googleOnly = renderForm({ state: "signed-out", providers: { google: true, line: false } });
  assert.equal(isDisabled(googleButton(googleOnly)), false);
  assert.equal(isDisabled(lineButton(googleOnly)), true);
  assert.match(lineButton(googleOnly), /ยังไม่เปิดใช้งาน/);
  assert.match(googleOnly, /LINE ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์นี้/);

  const lineOnly = renderForm({ state: "signed-out", providers: { google: false, line: true } });
  assert.equal(isDisabled(lineButton(lineOnly)), false);
  assert.equal(isDisabled(googleButton(lineOnly)), true);
  assert.match(lineOnly, /Google ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์นี้/);
});

test("unconfigured UI shows both providers disabled with no fake flow", () => {
  const html = renderForm({ state: "unconfigured" });
  assert.equal(buttons(html).length, 2);
  assert.equal(isDisabled(googleButton(html)), true);
  assert.equal(isDisabled(lineButton(html)), true);
  assert.doesNotMatch(html, /ออกจากระบบ|เข้าสู่ระบบแล้ว/);
});

test("LINE button uses its own scoped treatment, no fetched logo and no form fields", () => {
  for (const props of [
    { state: "unconfigured" },
    { state: "signed-out", providers: { google: true, line: true } },
    { state: "signed-out", providers: { google: true, line: false } },
  ]) {
    const html = renderForm(props);
    assert.match(lineButton(html), /class="[^"]*\bline\b/);
    assert.doesNotMatch(lineButton(html), /\bprimary\b/);
    assert.doesNotMatch(html, /<input\b|<textarea\b|<img\b|<svg\b|line\.svg|https?:\/\//, JSON.stringify(props));
    // The explanatory "no password requested" sentence is allowed; any OTP or
    // secret prompt is not (password fields are already excluded above).
    assert.doesNotMatch(html, /OTP|secret|type="password"/i);
  }
});

test("signed-in LINE user shows name and provider, no email, no Google wording", () => {
  const html = renderForm({ state: "signed-in", user: { provider: "line", name: "Fixture LINE Person", email: null } });
  assert.match(html, /Fixture LINE Person/);
  assert.match(html, /ยืนยันตัวตนด้วย LINE แล้ว/);
  assert.match(html, /ออกจากระบบ/);
  assert.match(html, /aria-hidden="true">F</);
  assert.doesNotMatch(html, /Google|@|null|undefined/);
  assert.doesNotMatch(html, /อนุมัติแล้ว|ดาวน์โหลดได้|รออนุมัติ/);
});

test("signed-in LINE user without a name falls back to a provider label, not a fake email", () => {
  const html = renderForm({ state: "signed-in", user: { provider: "line", name: null, email: null } });
  assert.match(html, /บัญชี LINE/);
  assert.match(html, /aria-hidden="true">L</);
  assert.doesNotMatch(html, /@|null|undefined|Google/);
});

test("signed-in Google user still shows the verified email and Google wording", () => {
  const html = renderForm({ state: "signed-in", user: { provider: "google", name: null, email: "fixture@example.test" } });
  assert.match(html, /fixture@example\.test/);
  assert.match(html, /ยืนยันตัวตนด้วย Google แล้ว/);
  assert.match(html, /aria-hidden="true">F</);
  assert.doesNotMatch(html, /LINE/);
});

test("startLineSignIn uses the library CSRF-protected flow with account landing", async () => {
  clientCalls.length = 0;
  await form().startLineSignIn();
  assert.deepEqual(clientCalls, [["signIn", "line", { callbackUrl: "/account" }]]);
});

test("busy and failure text is provider-specific and fixed", () => {
  const { signInButtonLabel, actionFailureMessage } = form();
  assert.equal(signInButtonLabel("line", { ready: true, busy: false }), "เข้าสู่ระบบด้วย LINE");
  assert.equal(signInButtonLabel("line", { ready: true, busy: true }), "กำลังไปที่ LINE…");
  assert.equal(signInButtonLabel("line", { ready: false, busy: false }), "เข้าสู่ระบบด้วย LINE — ยังไม่เปิดใช้งาน");
  assert.equal(signInButtonLabel("google", { ready: true, busy: true }), "กำลังไปที่ Google…");
  assert.equal(actionFailureMessage("line"), "เริ่มเข้าสู่ระบบด้วย LINE ไม่สำเร็จ ลองใหม่อีกครั้ง");
  assert.equal(actionFailureMessage("google"), "เริ่มเข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง");
  assert.equal(actionFailureMessage("signout"), "ออกจากระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
  assert.equal(actionFailureMessage(null), "");
});

test("account page describes Google or LINE login without email-ownership claims for everyone", async () => {
  const saved = { ...process.env };
  try {
    for (const key of AUTH_KEYS) delete process.env[key];
    const Account = load<{ default: (p: unknown) => Promise<unknown> }>("../app/account/page").default;
    const html = renderToStaticMarkup((await Account({ searchParams: Promise.resolve({}) })) as never);
    assert.match(html, /Google หรือ LINE/);
    assert.doesNotMatch(html, /เข้าสู่ระบบด้วย Google แล้ว<\/dt>/);
    assert.doesNotMatch(html, /อนุมัติแล้ว|ดาวน์โหลดได้/);
  } finally {
    for (const key of AUTH_KEYS) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("privacy page separates Google and LINE purpose, received and discarded data", () => {
  const Privacy = load<{ default: () => unknown }>("../app/privacy/page").default;
  const html = renderToStaticMarkup(createElement(Privacy as never));
  assert.match(html, /LINE/);
  assert.match(html, /openid profile/);
  assert.match(html, /ไม่ได้ขออีเมลจาก LINE/);
  assert.match(html, /วัตถุประสงค์/);
  assert.match(html, /ข้อมูลที่ได้รับ/);
  assert.match(html, /ข้อมูลที่ทิ้ง/);
  assert.match(html, /เพิ่มเพื่อน/);
  assert.match(html, /ไม่ได้ให้สิทธิ์ดาวน์โหลด/);
  assert.doesNotMatch(html, /ปฏิบัติตาม (PDPA|GDPR)|compliant|certified|ได้รับการรับรอง/i);
});

test("neither login grants membership, roles or MCP rights; downloads are decided per request", () => {
  // Downloads come from being a signed-in member (ADR 0002), checked against the
  // database on every request, never from claims carried in the session token.
  assert.match(readFileSync(join(root, "app/api/account/route.ts"), "utf8"), /503/);
  const { minimalToken, toPublicSession } = policy();
  const session = toPublicSession(
    minimalToken({ provider: "line", sub: "Ufixture", name: "N", approved: true, canDownload: true, mcp: true, role: "admin" }),
    "2026-11-04T00:00:00.000Z",
  );
  assert.doesNotMatch(JSON.stringify(session), /approved|download|mcp|role|admin/i);
});
