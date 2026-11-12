// /api/waitlist: GET = which targets the signed-in member has joined;
// POST {kind, id} = join or leave one. Deps are injectable for tests.
//
// Write order: accounts on → guardWrite (Origin, CSRF, JSON, size) → body
// shape → target is a coming-soon plan or an unopened roadmap item → session
// → store.
import type { AuthEnv } from "../auth-policy";
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { accountErrorResponse } from "../accounts/errors";
import { jsonNoStore, readCookie } from "../accounts/http";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims, type SessionClaims } from "../accounts/session";
import { guardWrite } from "../interactions/http";
import { getWaitlistStore, type WaitlistStore } from "./store";
import { isWaitlistKind, waitlistTargetOpen } from "./targets";

export type WaitlistDeps = { env?: AuthEnv; storeFor?: (databaseUrl: string) => WaitlistStore };

const MAX_BYTES = 512;

const rateLimited = () =>
  Response.json(
    { code: "RATE_LIMITED", message: "ทำรายการถี่เกินไป ลองใหม่ภายหลัง" },
    { status: 429, headers: { "Cache-Control": "no-store" } },
  );

async function sessionOf(request: Request, env: AuthEnv): Promise<SessionClaims | null> {
  const auth = readAuthConfig(env);
  if (!auth.ok) return null;
  const token = await decodeAccountSession(readCookie(request, SESSION_COOKIE_NAME), auth.config.secret);
  return token && providerReadiness(auth)[token.provider] ? sessionClaims(token) : null;
}

export async function handleWaitlistState(request: Request, deps: WaitlistDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const accounts = readAccountsConfig(env);
  if (accounts.mode !== "on") return jsonNoStore({ available: false });
  const session = await sessionOf(request, env);
  if (!session) return jsonNoStore({ available: true, signedIn: false, joined: [] });
  try {
    const joined = await (deps.storeFor ?? getWaitlistStore)(accounts.databaseUrl).joined(session);
    return jsonNoStore({ available: true, signedIn: true, joined });
  } catch (error) {
    logDbFailure("WAITLIST_STATE", error);
    return jsonNoStore({ available: false });
  }
}

export async function handleWaitlistToggle(request: Request, deps: WaitlistDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const accounts = readAccountsConfig(env);
  if (accounts.mode !== "on") return accountErrorResponse(accounts.mode === "off" ? "ACCOUNTS_DISABLED" : "ACCOUNTS_UNAVAILABLE");
  const guarded = await guardWrite(request, MAX_BYTES);
  if (!guarded.ok) return accountErrorResponse(guarded.code);
  const { kind, id, ...rest } = guarded.body;
  if (Object.keys(rest).length || !isWaitlistKind(kind) || typeof id !== "string" || !waitlistTargetOpen({ kind, id }))
    return accountErrorResponse("BAD_REQUEST");
  const session = await sessionOf(request, env);
  if (!session) return accountErrorResponse("NOT_SIGNED_IN");
  try {
    const r = await (deps.storeFor ?? getWaitlistStore)(accounts.databaseUrl).toggle(session, { kind, id });
    if (!r.ok) return r.code === "RATE_LIMITED" ? rateLimited() : accountErrorResponse("NOT_SIGNED_IN");
    return jsonNoStore({ joined: r.joined });
  } catch (error) {
    logDbFailure("WAITLIST_TOGGLE", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}
