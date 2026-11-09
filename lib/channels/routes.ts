// Handlers for connecting channels through the publishing Lambda
// (docs/design/publishing-core.md §5.2):
//   POST /api/channels/connect {platform}      -> {ok, authorizeUrl}, sets the intent cookie
//   GET  /api/channels/callback?i=<state>&...  -> 303 to /account/channels?notice=…
//   POST /api/channels/{id}/disconnect {}      -> {ok}
// The Lambda holds the Zernio key, creates and consumes the intent and talks to
// Zernio; the web host binds the flow to the browser (cookie) and the session,
// and only ever redirects to fixed kubcode.dev paths.
import { createHash, randomBytes } from "node:crypto";
import type { AuthEnv } from "../auth-policy";
import { CANONICAL_ORIGIN, canonicalHostRedirect } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { hashOpaqueToken, newOpaqueToken } from "../accounts/crypto";
import { logDbFailure } from "../accounts/db";
import { ACCOUNT_ERRORS, accountErrorResponse, type AccountErrorCode } from "../accounts/errors";
import { jsonNoStore, readOpaqueCookie } from "../accounts/http";
import type { SessionClaims } from "../accounts/session";
import { guardWrite } from "../interactions/http";
import { connectHeaders } from "../keys/connect-config";
import { sessionOf } from "../keys/connect-routes";
import { isConnectable, readPublishingConfig, type PublishingConfig } from "./config";
import { getChannelStore, type ChannelStore } from "./store";

export type ChannelRouteDeps = {
  env?: AuthEnv;
  storeFor?: (databaseUrl: string) => ChannelStore;
  fetch?: typeof fetch;
  /** Milliseconds since the epoch. */
  now?: () => number;
};

export const CHANNEL_COOKIE = "__Host-kubcode-chconnect";
const INTENT_TTL_SECONDS = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATE = /^[0-9a-f]{64}$/;
const CALL_TIMEOUT_MS = 20_000;
/** Our own parameter on the callback; never forwarded. */
const OWN_PARAMS = new Set(["i"]);

type RouteError = "NOT_FOUND_FEATURE" | "UNAVAILABLE" | "FORBIDDEN" | "NOT_SIGNED_IN" | "CHANNEL_NOT_FOUND" | "PROVIDER_QUOTA";
const ERRORS: Record<RouteError, { status: number; message: string }> = {
  NOT_FOUND_FEATURE: { status: 404, message: "ไม่พบหน้านี้" },
  UNAVAILABLE: { status: 503, message: "ระบบเชื่อมช่องยังไม่พร้อม ลองใหม่ภายหลัง" },
  FORBIDDEN: { status: 403, message: "คุณไม่มีสิทธิ์ใช้ระบบโพสต์" },
  NOT_SIGNED_IN: ACCOUNT_ERRORS.NOT_SIGNED_IN,
  CHANNEL_NOT_FOUND: { status: 404, message: "ไม่พบช่องนี้" },
  // The provider refuses another account until its billing allows one.
  PROVIDER_QUOTA: { status: 409, message: "บัญชีผู้ให้บริการเชื่อมต่อใช้โควตาช่องเต็มแล้ว แจ้งผู้ดูแลระบบ" },
};

const errorResponse = (code: RouteError) =>
  Response.json({ code, message: ERRORS[code].message }, { status: ERRORS[code].status, headers: { "Cache-Control": "no-store" } });

const intentCookie = (value: string, maxAge: number) =>
  `${CHANNEL_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

/** Binds an intent to the signed-in session that started it. */
export const sessionBinding = (s: SessionClaims) =>
  createHash("sha256").update(`kubcode-channel-binding|${s.uid}|${s.sid}`, "utf8").digest();

/** Calls the Lambda; null on any failure (network, timeout, non-200, bad JSON). */
async function callLambda(
  config: Extract<PublishingConfig, { mode: "on" }>,
  path: "/api/connect/start" | "/api/connect/complete" | "/api/channels/disconnect",
  payload: unknown,
  deps: ChannelRouteDeps,
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
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (res.status !== 200) return null;
    const json = (await res.json()) as unknown;
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Flag, accounts, Origin/CSRF/body, session, then the member gate. */
async function writeContext(
  request: Request,
  deps: ChannelRouteDeps,
  maxBytes: number,
  bodyOk: (body: Record<string, unknown>) => boolean,
): Promise<
  | Response
  | { config: Extract<PublishingConfig, { mode: "on" }>; userId: string; session: SessionClaims; body: Record<string, unknown> }
> {
  const env = deps.env ?? process.env;
  const config = readPublishingConfig(env);
  if (config.mode === "off") return errorResponse("NOT_FOUND_FEATURE");
  const accounts = readAccountsConfig(env);
  if (config.mode !== "on" || accounts.mode !== "on") return errorResponse("UNAVAILABLE");
  const guarded = await guardWrite(request, maxBytes);
  if (!guarded.ok) return accountErrorResponse(guarded.code as AccountErrorCode);
  if (!bodyOk(guarded.body)) return accountErrorResponse("BAD_REQUEST");
  const session = await sessionOf(request, env);
  if (!session) return errorResponse("NOT_SIGNED_IN");
  const store = deps.storeFor?.(accounts.databaseUrl) ?? getChannelStore(accounts.databaseUrl);
  try {
    const m = await store.member(session);
    if (!m.ok) return errorResponse(m.code);
    return { config, userId: m.userId, session, body: guarded.body };
  } catch (error) {
    logDbFailure("CHANNEL_MEMBER", error);
    return errorResponse("UNAVAILABLE");
  }
}

export async function handleChannelConnect(request: Request, deps: ChannelRouteDeps = {}): Promise<Response> {
  const ctx = await writeContext(
    request,
    deps,
    128,
    (b) => Object.keys(b).length === 1 && isConnectable(b.platform),
  );
  if (ctx instanceof Response) return ctx;
  const session = ctx.session;
  const state = randomBytes(32).toString("hex");
  const cookieToken = newOpaqueToken();
  const answer = await callLambda(
    ctx.config,
    "/api/connect/start",
    {
      user_id: ctx.userId,
      platform: ctx.body.platform,
      state,
      cookie_hash: hashOpaqueToken(cookieToken).toString("hex"),
      session_binding_hash: sessionBinding(session).toString("hex"),
    },
    deps,
  );
  if (answer?.code === "payment_required") return errorResponse("PROVIDER_QUOTA");
  const url = answer?.ok === true && typeof answer.auth_url === "string" ? answer.auth_url : "";
  if (!url.startsWith("https://")) return errorResponse("UNAVAILABLE");
  return jsonNoStore({ ok: true, authorizeUrl: url }, [intentCookie(cookieToken, INTENT_TTL_SECONDS)]);
}

type Notice = "connected" | "connect_failed" | "connect_denied" | "connect_expired" | "connect_unavailable";

function backToChannels(notice: Notice): Response {
  const headers = new Headers({
    Location: `${CANONICAL_ORIGIN}/account/channels?notice=${notice}`,
    "Cache-Control": "no-store",
    // The callback URL carries provider tokens: never leak it onward.
    "Referrer-Policy": "no-referrer",
  });
  headers.append("Set-Cookie", intentCookie("", 0));
  return new Response(null, { status: 303, headers });
}

const sameHash = (a: Buffer, b: Buffer) => a.length === b.length && a.equals(b);

export async function handleChannelCallback(request: Request, deps: ChannelRouteDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  if (canonicalHostRedirect(request.headers)) return backToChannels("connect_failed");
  const config = readPublishingConfig(env);
  const accounts = readAccountsConfig(env);
  if (config.mode !== "on" || accounts.mode !== "on") return backToChannels("connect_unavailable");
  const params = new URL(request.url).searchParams;
  const state = params.get("i") ?? "";
  if (!STATE.test(state)) return backToChannels("connect_failed");
  const session = await sessionOf(request, env);
  if (!session) {
    const headers = new Headers({ Location: `${CANONICAL_ORIGIN}/account`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    return new Response(null, { status: 303, headers });
  }
  const cookieToken = readOpaqueCookie(request, CHANNEL_COOKIE);
  if (!cookieToken) return backToChannels("connect_failed");
  const store = deps.storeFor?.(accounts.databaseUrl) ?? getChannelStore(accounts.databaseUrl);
  try {
    const stateHash = createHash("sha256").update(Buffer.from(state, "hex")).digest();
    const intent = await store.intent(session, stateHash);
    if (!intent || !sameHash(intent.cookieHash, hashOpaqueToken(cookieToken)) || !sameHash(intent.bindingHash, sessionBinding(session))) {
      return backToChannels("connect_failed");
    }
    if (!intent.open) return backToChannels("connect_failed");
    if (!intent.live) return backToChannels("connect_expired");
    const forwarded = [...params.entries()].filter(([k, v]) => !OWN_PARAMS.has(k) && k.length <= 64 && v.length <= 2048).slice(0, 32);
    const answer = await callLambda(config, "/api/connect/complete", { state, params: forwarded }, deps);
    if (answer?.ok === true) return backToChannels("connected");
    return backToChannels(answer?.code === "connect_denied" ? "connect_denied" : "connect_failed");
  } catch (error) {
    logDbFailure("CHANNEL_CALLBACK", error);
    return backToChannels("connect_failed");
  }
}

export async function handleChannelDisconnect(request: Request, channelId: string, deps: ChannelRouteDeps = {}): Promise<Response> {
  if (!UUID.test(channelId)) return accountErrorResponse("BAD_REQUEST");
  const ctx = await writeContext(request, deps, 16, (b) => Object.keys(b).length === 0);
  if (ctx instanceof Response) return ctx;
  const answer = await callLambda(ctx.config, "/api/channels/disconnect", { user_id: ctx.userId, channel_id: channelId }, deps);
  if (answer?.ok === true) return jsonNoStore({ ok: true });
  if (answer?.code === "channel_not_found") return errorResponse("CHANNEL_NOT_FOUND");
  return errorResponse("UNAVAILABLE");
}
