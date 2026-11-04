// Pure auth policy (Google + LINE): per-provider env readiness, identity trust,
// token/session whitelists,
// redirect and host pinning, safe error/log text. No next-auth imports so it
// stays testable and safe to reason about in isolation.

export const CANONICAL_HOST = "kubcode.dev";
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
export const ACCOUNT_URL = `${CANONICAL_ORIGIN}/account`;
export const GOOGLE_CALLBACK_URL = `${CANONICAL_ORIGIN}/api/auth/callback/google`;
export const GOOGLE_SCOPE = "openid email profile";
export const LINE_CALLBACK_URL = `${CANONICAL_ORIGIN}/api/auth/callback/line`;
// LINE email needs a separate channel permission; it is never requested.
export const LINE_SCOPE = "openid profile";
export const SESSION_COOKIE_NAME = "__Secure-next-auth.session-token";
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;


export const AUTH_PROVIDERS = ["google", "line"] as const;
export type AuthProviderId = (typeof AUTH_PROVIDERS)[number];
export const PROVIDER_LABELS: Readonly<Record<AuthProviderId, string>> = Object.freeze({
  google: "Google",
  line: "LINE",
});
const isProviderId = (v: unknown): v is AuthProviderId => v === "google" || v === "line";

// ------------------------------------------------------------------ config

export type AuthEnv = Record<string, string | undefined>;

export type ProviderCredentials = { clientId: string; clientSecret: string };

// Each provider is null unless its own credentials are fully valid, so one
// provider's missing or broken variables never disable the other.
export type AuthConfig = {
  secret: string;
  origin: typeof CANONICAL_ORIGIN;
  google: ProviderCredentials | null;
  line: ProviderCredentials | null;
};

// Safe to hand to UI: booleans only, no keys or validation details.
export type AuthReadiness = { google: boolean; line: boolean };

export type AuthConfigProblem = {
  variable: string;
  reason:
    | "missing"
    | "malformed"
    | "placeholder"
    | "too_short"
    | "not_canonical"
    | "reused"
    | "public_exposure";
};

// `ok` means the shared settings are valid and at least one provider is ready.
// `problems` on success lists the providers that stay disabled (names only).
export type AuthConfigResult =
  | { ok: true; config: AuthConfig; problems: AuthConfigProblem[] }
  | { ok: false; problems: AuthConfigProblem[] };

const PRINTABLE_NO_SPACE = /^[\x21-\x7e]+$/;
const GOOGLE_CLIENT_ID = /^[0-9]{6,}-[a-z0-9]{8,}\.apps\.googleusercontent\.com$/;
// LINE Channel IDs are numeric; allow a range of lengths rather than pinning today's.
const LINE_CHANNEL_ID = /^[1-9][0-9]{7,14}$/;
const GOOGLE_SECRET_MIN = 20;
const LINE_SECRET_MIN = 16;
const PLACEHOLDER_START =
  /^(your|<|\$\{|\{\{|replace|change[-_ ]?me|example|placeholder|todo|dummy|xxx|null$|undefined$|none$|true$|false$)/i;
const PLACEHOLDER_ANYWHERE = /(placeholder|change[-_]?me|your[-_]|example)/i;

function isPlaceholder(value: string): boolean {
  return (
    PLACEHOLDER_START.test(value) ||
    PLACEHOLDER_ANYWHERE.test(value) ||
    /^(.)\1*$/.test(value)
  );
}

// Checks a literal value without trimming or otherwise repairing it.
function checkSecretLike(
  variable: string,
  value: string | undefined,
  minLength: number,
): AuthConfigProblem | null {
  if (value === undefined || value === "") return { variable, reason: "missing" };
  if (!PRINTABLE_NO_SPACE.test(value)) return { variable, reason: "malformed" };
  if (isPlaceholder(value)) return { variable, reason: "placeholder" };
  if (value.length < minLength) return { variable, reason: "too_short" };
  return null;
}

type ProviderCheck = {
  credentials: ProviderCredentials | null;
  problems: AuthConfigProblem[];
  // A client secret that passed format checks, used for the reuse check.
  usableSecret: string | null;
};

function checkProvider(
  idVar: string,
  secretVar: string,
  id: string | undefined,
  clientSecret: string | undefined,
  idPattern: RegExp,
  secretMin: number,
): ProviderCheck {
  const problems: AuthConfigProblem[] = [];
  const idProblem = checkSecretLike(idVar, id, 1);
  if (idProblem) problems.push(idProblem);
  else if (!idPattern.test(id!)) problems.push({ variable: idVar, reason: "malformed" });
  const secretProblem = checkSecretLike(secretVar, clientSecret, secretMin);
  if (secretProblem) problems.push(secretProblem);
  return {
    credentials: problems.length === 0 ? { clientId: id!, clientSecret: clientSecret! } : null,
    problems,
    usableSecret: secretProblem ? null : clientSecret!,
  };
}

export function readAuthConfig(env: AuthEnv): AuthConfigResult {
  const shared: AuthConfigProblem[] = [];
  const secret = env.NEXTAUTH_SECRET;
  const url = env.NEXTAUTH_URL;

  const google = checkProvider(
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_SECRET_MIN,
  );
  const line = checkProvider(
    "LINE_CLIENT_ID",
    "LINE_CLIENT_SECRET",
    env.LINE_CLIENT_ID,
    env.LINE_CLIENT_SECRET,
    LINE_CHANNEL_ID,
    LINE_SECRET_MIN,
  );

  // The session key must not be (or embed) a secret the provider also knows,
  // otherwise that party could mint sessions for every provider.
  const secretProblem = checkSecretLike("NEXTAUTH_SECRET", secret, 32);
  if (secretProblem) shared.push(secretProblem);
  else if (
    [google.usableSecret, line.usableSecret].some(
      (providerSecret) => providerSecret !== null && secret!.includes(providerSecret),
    )
  )
    shared.push({ variable: "NEXTAUTH_SECRET", reason: "reused" });

  if (url === undefined || url === "")
    shared.push({ variable: "NEXTAUTH_URL", reason: "missing" });
  else if (url !== CANONICAL_ORIGIN)
    shared.push({ variable: "NEXTAUTH_URL", reason: "not_canonical" });

  // Anything secret-ish under NEXT_PUBLIC_ would be inlined into client JS.
  for (const key of Object.keys(env))
    if (key.startsWith("NEXT_PUBLIC_") && /SECRET|NEXTAUTH/.test(key) && env[key])
      shared.push({ variable: key, reason: "public_exposure" });

  const providerProblems = [...google.problems, ...line.problems];
  if (shared.length > 0 || (!google.credentials && !line.credentials))
    return { ok: false, problems: [...shared, ...providerProblems] };
  return {
    ok: true,
    config: {
      secret: secret!,
      origin: CANONICAL_ORIGIN,
      google: google.credentials,
      line: line.credentials,
    },
    problems: providerProblems,
  };
}

export function providerReadiness(result: AuthConfigResult): AuthReadiness {
  if (!result.ok) return { google: false, line: false };
  return { google: result.config.google !== null, line: result.config.line !== null };
}

// ----------------------------------------------------------------- identity

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function isTrustedGoogleSignIn(input: {
  account?: unknown;
  profile?: unknown;
}): boolean {
  const { account, profile } = input;
  if (!isObj(account) || account.provider !== "google" || account.type !== "oauth")
    return false;
  if (!isObj(profile)) return false;
  return profile.email_verified === true && nonEmpty(profile.email) && nonEmpty(profile.sub);
}

// LINE identity rests on the provider tag plus the stable `sub` of an ID token
// that the library already verified (HS256 signature, iss, aud, exp, nonce).
// Email is neither requested nor required.
export function isTrustedLineSignIn(input: { account?: unknown; profile?: unknown }): boolean {
  const { account, profile } = input;
  if (!isObj(account) || account.provider !== "line" || account.type !== "oauth") return false;
  return isObj(profile) && nonEmpty(profile.sub);
}

export function isTrustedSignIn(input: { account?: unknown; profile?: unknown }): boolean {
  if (!isObj(input.account)) return false;
  if (input.account.provider === "google") return isTrustedGoogleSignIn(input);
  if (input.account.provider === "line") return isTrustedLineSignIn(input);
  return false;
}

// ---------------------------------------------------------- token / session

// Encrypted JWT payload. `provider` + `sub` is the identity; email exists only
// for Google. Identities are never merged or matched by email.
export type MinimalToken = {
  provider?: AuthProviderId;
  sub?: string;
  name?: string | null;
  email?: string;
};
/** image: allowlisted provider picture (central-account sessions only). */
export type PublicUser = { provider: AuthProviderId; name: string | null; email: string | null; image?: string | null };
export type PublicSession = { user?: PublicUser; expires: string };

const nameOrNull = (v: unknown): string | null => (nonEmpty(v) ? v : null);

// Builds the token for a fresh sign-in from the provider's claims, keeping only
// whitelisted fields (no picture, provider tokens or id_token).
export function tokenFromSignIn(input: { account?: unknown; profile?: unknown }): MinimalToken | null {
  const { account, profile } = input;
  if (!isObj(account) || !isObj(profile) || !nonEmpty(profile.sub)) return null;
  if (account.provider === "google") {
    if (!nonEmpty(profile.email)) return null;
    return { provider: "google", sub: profile.sub, name: nameOrNull(profile.name), email: profile.email };
  }
  if (account.provider === "line")
    return { provider: "line", sub: profile.sub, name: nameOrNull(profile.name) };
  return null;
}

// Re-whitelists a stored token on every read. Unknown or incomplete tokens
// become empty (signed out). Provider-less tokens predate LINE support and were
// only ever issued for Google, so they migrate as Google when sub+email exist.
export function minimalToken(token: unknown): MinimalToken {
  if (!isObj(token) || !nonEmpty(token.sub)) return {};
  const hasProvider = Object.hasOwn(token, "provider") && token.provider !== undefined;
  const provider = hasProvider ? token.provider : "google";
  if (!isProviderId(provider)) return {};
  const out: MinimalToken = { provider, sub: token.sub };
  if (nonEmpty(token.name) || token.name === null) out.name = token.name as string | null;
  if (provider === "google") {
    if (!nonEmpty(token.email)) return {};
    out.email = token.email;
  }
  return out;
}

export function toPublicSession(token: unknown, expires: string): PublicSession {
  const t = minimalToken(token);
  if (!t.provider) return { expires };
  return {
    user: { provider: t.provider, name: t.name ?? null, email: t.provider === "google" ? t.email! : null },
    expires,
  };
}

export function publicUserFromSession(session: unknown): PublicUser | null {
  if (!isObj(session) || !isObj(session.user)) return null;
  const { provider, name, email } = session.user;
  if (provider === "google")
    return nonEmpty(email) ? { provider, name: nameOrNull(name), email } : null;
  if (provider === "line") return { provider, name: nameOrNull(name), email: null };
  return null;
}

export function signInEventMarker(account: unknown): string | null {
  if (!isObj(account)) return null;
  if (account.provider === "google") return "[auth-event] GOOGLE_SIGNIN_VERIFIED";
  if (account.provider === "line") return "[auth-event] LINE_SIGNIN_VERIFIED";
  return null;
}

// --------------------------------------------------------------- redirects

// The only post-auth landing is the canonical account page. The requested
// URL is intentionally ignored, so no input can produce an open redirect.
export function accountRedirect(_requested: string, origin: typeof CANONICAL_ORIGIN): string {
  return `${origin}/account`;
}

// Returns the canonical account URL when the request did not arrive on the
// canonical HTTPS host (preview/alias domains, spoofed forwarding headers),
// so login cookies are never issued for another host. Returns null if OK.
export function canonicalHostRedirect(headers: Headers): string | null {
  const host = headers.get("host");
  const forwardedHost = headers.get("x-forwarded-host");
  const proto = headers.get("x-forwarded-proto");
  if (host === null || host.toLowerCase() !== CANONICAL_HOST) return ACCOUNT_URL;
  if (forwardedHost !== null && forwardedHost.toLowerCase() !== CANONICAL_HOST)
    return ACCOUNT_URL;
  if (proto !== null && proto !== "https") return ACCOUNT_URL;
  return null;
}

// ----------------------------------------------------------- errors / logs

const GENERIC_ERROR = "เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง";
// The `?error=` code does not say which provider failed, so text stays neutral.
const PROVIDER_ERROR = "เชื่อมต่อกับ Google หรือ LINE ไม่สำเร็จ ลองใหม่อีกครั้ง";
const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), {
    AccessDenied:
      "บัญชีนี้ใช้เข้าสู่ระบบไม่ได้ ผู้ให้บริการไม่อนุญาตหรือข้อมูลยืนยันตัวตนไม่ครบ",
    Configuration: "ระบบเข้าสู่ระบบยังตั้งค่าไม่ครบ จึงยังใช้งานไม่ได้",
    SessionRequired: "กรุณาเข้าสู่ระบบก่อน",
    // Central accounts are enabled but the account database could not be used.
    AccountUnavailable: "ระบบบัญชีใช้งานไม่ได้ชั่วคราว จึงยังเข้าสู่ระบบไม่ได้ ลองใหม่ภายหลัง",
    OAuthSignin: PROVIDER_ERROR,
    OAuthCallback: PROVIDER_ERROR,
    OAuthCreateAccount: PROVIDER_ERROR,
    Callback: PROVIDER_ERROR,
    Default: GENERIC_ERROR,
  }),
);

// Maps a raw `?error=` value to fixed text. Raw provider/query text is never shown.
export function authErrorMessage(code: unknown): string | null {
  if (code === undefined || code === null || code === "") return null;
  if (typeof code === "string" && Object.hasOwn(AUTH_ERROR_MESSAGES, code))
    return AUTH_ERROR_MESSAGES[code];
  return GENERIC_ERROR;
}

export function safeLogCode(code: unknown): string {
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "UNKNOWN";
}

export function authUnavailableResponse(): Response {
  return Response.json(
    {
      code: "AUTH_NOT_CONFIGURED",
      message: "ระบบเข้าสู่ระบบด้วย Google หรือ LINE ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์นี้",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export function describeProblems(problems: AuthConfigProblem[]): string {
  return problems.map((p) => `${p.variable}:${p.reason}`).join(",");
}
