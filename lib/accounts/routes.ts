// Handlers for /api/account/* link/unlink routes. Route files are thin
// wrappers; dependencies are injectable so guards are testable offline.
import type { AuthProviderId, AuthReadiness, AuthEnv } from "../auth-policy";
import { SESSION_COOKIE_NAME, canonicalHostRedirect, providerReadiness, readAuthConfig } from "../auth-policy";
import { readAccountsConfig } from "./config";
import { hashOpaqueToken, newOpaqueToken } from "./crypto";
import { logDbFailure } from "./db";
import { accountErrorResponse, type AccountErrorCode } from "./errors";
import {
  CSRF_COOKIE,
  LINK_COOKIE,
  clearLinkCookie,
  clearSessionCookie,
  csrfCookie,
  jsonNoStore,
  linkCookie,
  readCookie,
  readGuardedJson,
  readOpaqueCookie,
} from "./http";
import { decodeAccountSession } from "./runtime";
import { sessionClaims, type SessionClaims } from "./session";
import { getAccountStore, type AccountStore } from "./store";

export type RouteDeps = {
  env?: AuthEnv;
  storeFor?: (databaseUrl: string) => AccountStore;
};

type Ready = {
  ok: true;
  body: Record<string, unknown>;
  session: SessionClaims | null;
  store: AccountStore;
  ready: AuthReadiness;
};

const fail = (code: AccountErrorCode, cookies: string[] = []) => ({ ok: false as const, response: accountErrorResponse(code, cookies) });

function availability(env: AuthEnv) {
  const accounts = readAccountsConfig(env);
  if (accounts.mode === "off") return fail("ACCOUNTS_DISABLED");
  if (accounts.mode === "broken") return fail("ACCOUNTS_UNAVAILABLE");
  const auth = readAuthConfig(env);
  if (!auth.ok) return fail("ACCOUNTS_UNAVAILABLE");
  return { ok: true as const, accounts, auth };
}

// Feature checks, then origin/CSRF/body guards, then the signed session.
async function prepare(request: Request, deps: RouteDeps): Promise<Ready | ReturnType<typeof fail>> {
  const env = deps.env ?? process.env;
  const avail = availability(env);
  if (!avail.ok) return avail;
  const guarded = await readGuardedJson(request);
  if (!guarded.ok) return fail(guarded.code);
  const ready = providerReadiness(avail.auth);
  const token = await decodeAccountSession(readCookie(request, SESSION_COOKIE_NAME), avail.auth.config.secret);
  const session = token && ready[token.provider] ? sessionClaims(token) : null;
  const store = (deps.storeFor ?? getAccountStore)(avail.accounts.databaseUrl);
  return { ok: true, body: guarded.body, session, store, ready };
}

const onlyKeys = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((k) => keys.includes(k)) && keys.every((k) => Object.hasOwn(body, k));

function providerFrom(body: Record<string, unknown>): AuthProviderId | null {
  if (!onlyKeys(body, ["provider"])) return null;
  return body.provider === "google" || body.provider === "line" ? body.provider : null;
}

async function start(request: Request, deps: RouteDeps, kind: "link" | "unlink"): Promise<Response> {
  const p = await prepare(request, deps);
  if (!p.ok) return p.response;
  const provider = providerFrom(p.body);
  if (!provider) return accountErrorResponse("BAD_REQUEST");
  if (!p.session) return accountErrorResponse("NOT_SIGNED_IN");
  const token = newOpaqueToken();
  try {
    const result = await p.store.startIntent(p.session, kind, provider, p.ready, hashOpaqueToken(token));
    if (!result.ok) return accountErrorResponse(result.code);
    return jsonNoStore(
      { ok: true, kind, phase: "await_source", sourceProvider: result.sourceProvider, targetProvider: provider },
      [linkCookie(token)],
    );
  } catch (error) {
    logDbFailure(kind === "link" ? "LINK_START" : "UNLINK_START", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}

export const handleLinkStart = (request: Request, deps: RouteDeps = {}) => start(request, deps, "link");
export const handleUnlinkStart = (request: Request, deps: RouteDeps = {}) => start(request, deps, "unlink");

export async function handleConfirm(request: Request, deps: RouteDeps = {}): Promise<Response> {
  const p = await prepare(request, deps);
  if (!p.ok) return p.response;
  if (!onlyKeys(p.body, [])) return accountErrorResponse("BAD_REQUEST");
  const link = readOpaqueCookie(request, LINK_COOKIE);
  if (!link) return accountErrorResponse("LINK_INVALID", [clearLinkCookie()]);
  if (!p.session) return accountErrorResponse("NOT_SIGNED_IN", [clearLinkCookie()]);
  try {
    const result = await p.store.confirmIntent(hashOpaqueToken(link), p.session, p.ready);
    if (!result.ok) return accountErrorResponse(result.code, [clearLinkCookie()]);
    // Every session of this user was revoked (session_version bump); this
    // browser must sign in again with any linked method.
    return jsonNoStore({ ok: true, kind: result.kind, provider: result.provider, signedOut: true }, [
      clearLinkCookie(),
      clearSessionCookie(),
    ]);
  } catch (error) {
    logDbFailure("INTENT_CONFIRM", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}

// Cancel needs origin + CSRF; it closes the intent only for its own signed-in
// owner and always clears this browser's link cookie.
export async function handleCancel(request: Request, deps: RouteDeps = {}): Promise<Response> {
  const p = await prepare(request, deps);
  if (!p.ok) return p.response;
  if (!onlyKeys(p.body, [])) return accountErrorResponse("BAD_REQUEST");
  const link = readOpaqueCookie(request, LINK_COOKIE);
  if (link && p.session) {
    try {
      await p.store.cancelIntent(hashOpaqueToken(link), p.session);
    } catch (error) {
      logDbFailure("INTENT_CANCEL", error);
      return accountErrorResponse("ACCOUNTS_UNAVAILABLE", [clearLinkCookie()]);
    }
  }
  return jsonNoStore({ ok: true }, [clearLinkCookie()]);
}

// Read route: issues (or re-issues) the double-submit CSRF token.
export async function handleCsrf(request: Request, deps: RouteDeps = {}): Promise<Response> {
  const avail = availability(deps.env ?? process.env);
  if (!avail.ok) return avail.response;
  if (canonicalHostRedirect(request.headers)) return accountErrorResponse("BAD_ORIGIN");
  const token = readOpaqueCookie(request, CSRF_COOKIE) ?? newOpaqueToken();
  return jsonNoStore({ csrfToken: token }, [csrfCookie(token)]);
}
