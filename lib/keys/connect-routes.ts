// Handlers for the OAuth connect flow (docs/design/settings-keys.md §2):
//   POST /api/keys/oauth/start {provider}          -> {authorizeUrl}, sets __Host-kubcode-oauth
//   GET  /api/keys/oauth/callback/{provider}       -> 303 to /account/keys?notice=…
//   POST /api/keys/connections/{id}/disconnect {}  -> {ok, revoked}
// The web host never sees a client secret or a token: the code exchange and
// the Google revoke run in the kubcode-oauth-connect Lambda, called with an
// HMAC-signed request. Redirects only ever go to fixed kubcode.dev paths.
import { createHash, randomBytes } from "node:crypto";
import type { AuthEnv } from "../auth-policy";
import { CANONICAL_ORIGIN, SESSION_COOKIE_NAME, canonicalHostRedirect, providerReadiness, readAuthConfig } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { newOpaqueToken } from "../accounts/crypto";
import { logDbFailure } from "../accounts/db";
import { ACCOUNT_ERRORS, accountErrorResponse, type AccountErrorCode } from "../accounts/errors";
import { jsonNoStore, readCookie, readOpaqueCookie } from "../accounts/http";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims, type SessionClaims } from "../accounts/session";
import { guardWrite } from "../interactions/http";
import { keysEnabled } from "./access";
import { connectHeaders, readConnectConfig, type ConnectConfig } from "./connect-config";
import { INTENT_TTL_SECONDS, getConnectStore, isProvider, type ConnectErrorCode, type ConnectStore, type Provider } from "./connect-store";

export type ConnectRouteDeps = {
  env?: AuthEnv;
  storeFor?: (databaseUrl: string) => ConnectStore;
  fetch?: typeof fetch;
  /** Milliseconds since the epoch. */
  now?: () => number;
};

export const OAUTH_COOKIE = "__Host-kubcode-oauth";
const CALLBACK = (p: Provider) => `${CANONICAL_ORIGIN}/api/keys/oauth/callback/${p}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXCHANGE_TIMEOUT_MS = 15_000;
const REVOKE_TIMEOUT_MS = 8_000;

const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
// Insights, comments and messages are not requested in phase 1 (design §2).
const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

type RouteErrorCode = ConnectErrorCode | "KEYS_DISABLED" | "CONNECT_UNAVAILABLE";
const ERRORS: Record<RouteErrorCode, { status: number; message: string }> = {
  KEYS_DISABLED: { status: 503, message: "หน้าตั้งค่าคีย์ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้" },
  CONNECT_UNAVAILABLE: { status: 503, message: "ระบบเชื่อมบัญชียังไม่พร้อมบนเซิร์ฟเวอร์นี้" },
  NOT_SIGNED_IN: ACCOUNT_ERRORS.NOT_SIGNED_IN,
  FORBIDDEN: { status: 403, message: "คุณไม่มีสิทธิ์ใช้หน้าตั้งค่าคีย์" },
  APP_NOT_CONFIGURED: { status: 409, message: "ยังไม่มีแอปสำหรับเชื่อมบัญชีนี้ ตั้งค่า App ID และ secret ก่อน" },
  NOT_READY: { status: 503, message: "ยังเชื่อมบัญชีไม่ได้ ระบบเข้ารหัสยังไม่พร้อม" },
  INTENT_INVALID: { status: 409, message: "คำขอเชื่อมบัญชีนี้ใช้ต่อไม่ได้ เริ่มใหม่จากหน้าตั้งค่า" },
  INTENT_EXPIRED: { status: 410, message: "คำขอเชื่อมบัญชีหมดเวลา เริ่มใหม่จากหน้าตั้งค่า" },
  NOT_FOUND: { status: 404, message: "ไม่พบบัญชีที่เชื่อมนี้" },
};

function errorResponse(code: RouteErrorCode): Response {
  const e = ERRORS[code] ?? ACCOUNT_ERRORS.ACCOUNTS_UNAVAILABLE;
  return Response.json({ code, message: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
}

const oauthCookie = (value: string, maxAge: number) => `${OAUTH_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

async function sessionOf(request: Request, env: AuthEnv): Promise<SessionClaims | null> {
  const auth = readAuthConfig(env);
  if (!auth.ok) return null;
  const token = await decodeAccountSession(readCookie(request, SESSION_COOKIE_NAME), auth.config.secret);
  return token && providerReadiness(auth)[token.provider] ? sessionClaims(token) : null;
}

/** Calls the Lambda; null on any failure (network, timeout, non-200, bad JSON). */
async function callLambda(
  config: Extract<ConnectConfig, { mode: "on" }>,
  path: "/oauth/exchange" | "/oauth/revoke",
  payload: Record<string, string>,
  deps: ConnectRouteDeps,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor((deps.now ?? Date.now)() / 1000);
  const nonce = randomBytes(16).toString("hex");
  try {
    const res = await (deps.fetch ?? fetch)(new URL(path.slice(1), config.url).href, {
      method: "POST",
      headers: connectHeaders(config.key, path, body, timestamp, nonce),
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status !== 200) return null;
    const json = (await res.json()) as unknown;
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function authorizeUrl(provider: Provider, clientId: string, state: string, verifier: string | null): string {
  if (provider === "youtube") {
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: CALLBACK("youtube"),
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: createHash("sha256").update(verifier!, "utf8").digest("base64url"),
      code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: CALLBACK("instagram"),
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

/** Shared gate for both writes: accounts, the keys flag, Origin/CSRF/body, session. */
async function writeContext(
  request: Request,
  deps: ConnectRouteDeps,
  maxBytes: number,
): Promise<Response | { env: AuthEnv; store: ConnectStore; session: SessionClaims | null; body: Record<string, unknown> }> {
  const env = deps.env ?? process.env;
  const accounts = readAccountsConfig(env);
  if (accounts.mode !== "on") return accountErrorResponse(accounts.mode === "off" ? "ACCOUNTS_DISABLED" : "ACCOUNTS_UNAVAILABLE");
  if (!keysEnabled(env)) return errorResponse("KEYS_DISABLED");
  const guarded = await guardWrite(request, maxBytes);
  if (!guarded.ok) return accountErrorResponse(guarded.code as AccountErrorCode);
  return {
    env,
    store: (deps.storeFor ?? getConnectStore)(accounts.databaseUrl),
    session: await sessionOf(request, env),
    body: guarded.body,
  };
}

export async function handleConnectStart(request: Request, deps: ConnectRouteDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  if (keysEnabled(env) && readConnectConfig(env).mode !== "on") return errorResponse("CONNECT_UNAVAILABLE");
  const ctx = await writeContext(request, deps, 256);
  if (ctx instanceof Response) return ctx;
  const config = readConnectConfig(ctx.env);
  if (config.mode !== "on") return errorResponse("CONNECT_UNAVAILABLE");
  const keys = Object.keys(ctx.body);
  if (keys.length !== 1 || !isProvider(ctx.body.provider)) return accountErrorResponse("BAD_REQUEST");
  const provider = ctx.body.provider;
  if (!ctx.session) return errorResponse("NOT_SIGNED_IN");
  const state = newOpaqueToken();
  const cookieToken = newOpaqueToken();
  const verifier = provider === "youtube" ? newOpaqueToken() : null;
  try {
    const r = await ctx.store.startConnect(ctx.session, { provider, kubcodeClientId: config.youtubeClientId, state, cookieToken, verifier });
    if (!r.ok) return errorResponse(r.code);
    return jsonNoStore({ ok: true, authorizeUrl: authorizeUrl(provider, r.clientId, state, verifier) }, [oauthCookie(cookieToken, INTENT_TTL_SECONDS)]);
  } catch (error) {
    logDbFailure("CONNECT_START", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}

type Notice = "connected" | "connect_failed" | "connect_denied" | "connect_expired" | "connect_unavailable";

function backToKeys(notice: Notice): Response {
  const headers = new Headers({
    Location: `${CANONICAL_ORIGIN}/account/keys?notice=${notice}`,
    "Cache-Control": "no-store",
    // The callback URL carries the authorization code: never leak it onward.
    "Referrer-Policy": "no-referrer",
  });
  headers.append("Set-Cookie", oauthCookie("", 0));
  return new Response(null, { status: 303, headers });
}

export async function handleConnectCallback(request: Request, providerParam: string, deps: ConnectRouteDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  if (canonicalHostRedirect(request.headers)) return backToKeys("connect_failed");
  const accounts = readAccountsConfig(env);
  const config = readConnectConfig(env);
  if (accounts.mode !== "on" || !keysEnabled(env) || config.mode !== "on") return backToKeys("connect_unavailable");
  if (!isProvider(providerParam)) return backToKeys("connect_failed");
  const provider = providerParam;
  const params = new URL(request.url).searchParams;
  const state = params.get("state") ?? "";
  if (!state || state.length > 128) return backToKeys("connect_failed");
  const session = await sessionOf(request, env);
  if (!session) {
    const headers = new Headers({ Location: `${CANONICAL_ORIGIN}/account`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    return new Response(null, { status: 303, headers });
  }
  const cookieToken = readOpaqueCookie(request, OAUTH_COOKIE);
  if (!cookieToken) return backToKeys("connect_failed");
  const store = (deps.storeFor ?? getConnectStore)(accounts.databaseUrl);
  try {
    const begun = await store.beginExchange(session, { provider, state, cookieToken });
    if (!begun.ok) return backToKeys(begun.code === "INTENT_EXPIRED" ? "connect_expired" : "connect_failed");
    const failWith = async (notice: Notice) => {
      await store.failIntent(session, begun.intentId);
      return backToKeys(notice);
    };
    const providerError = params.get("error");
    if (providerError !== null) return failWith(providerError === "access_denied" ? "connect_denied" : "connect_failed");
    const code = params.get("code") ?? "";
    if (!code || code.length > 2048) return failWith("connect_failed");
    const answer = await callLambda(config, "/oauth/exchange", { state, code }, deps, EXCHANGE_TIMEOUT_MS);
    // The Lambda closes the intent itself; closing again is a no-op.
    if (answer?.ok !== true) return failWith("connect_failed");
    return backToKeys("connected");
  } catch (error) {
    logDbFailure("CONNECT_CALLBACK", error);
    return backToKeys("connect_failed");
  }
}

export async function handleDisconnect(request: Request, connectionId: string, deps: ConnectRouteDeps = {}): Promise<Response> {
  const ctx = await writeContext(request, deps, 64);
  if (ctx instanceof Response) return ctx;
  if (!UUID.test(connectionId) || Object.keys(ctx.body).length !== 0) return accountErrorResponse("BAD_REQUEST");
  if (!ctx.session) return errorResponse("NOT_SIGNED_IN");
  const session = ctx.session;
  try {
    const marked = await ctx.store.markRevoking(session, connectionId);
    if (!marked.ok) return errorResponse(marked.code);
    // Instagram's Business Login has no reliable revoke API: removing the
    // stored token is the whole disconnect (the member can also remove the
    // app under Instagram › Apps and websites).
    if (marked.provider === "instagram") {
      await ctx.store.removeConnection(session, connectionId, { revokeFailed: false });
      return jsonNoStore({ ok: true, revoked: false });
    }
    const config = readConnectConfig(ctx.env);
    if (config.mode === "on") {
      const answer = await callLambda(config, "/oauth/revoke", { connectionId, userId: session.uid }, deps, REVOKE_TIMEOUT_MS);
      if (answer?.ok === true) return jsonNoStore({ ok: true, revoked: answer.revoked === true });
    }
    // The Lambda could not finish: the ciphertext is still wiped (design §2).
    await ctx.store.removeConnection(session, connectionId, { revokeFailed: true });
    return jsonNoStore({ ok: true, revoked: false });
  } catch (error) {
    logDbFailure("CONNECT_DISCONNECT", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}
