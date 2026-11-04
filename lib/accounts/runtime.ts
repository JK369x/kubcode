// Per-request accounts context for next-auth callbacks. A fresh object is
// built for every request; nothing user-specific is kept at module scope.
import { decode } from "next-auth/jwt";
import type { AuthReadiness } from "../auth-policy";
import { SESSION_COOKIE_NAME } from "../auth-policy";
import { hashOpaqueToken, isOpaqueToken } from "./crypto";
import { LINK_COOKIE } from "./http";
import { parseAccountToken, sessionClaims, type AccountToken, type SessionClaims } from "./session";
import type { AccountStore, LoginProfile } from "./store";

export type RequestContext = {
  // "none" = no link cookie; "malformed" = cookie present but unusable;
  // otherwise the SHA-256 of the opaque token (the raw value is not kept).
  linkCookie: "none" | "malformed" | Buffer;
  // Claims of the current, signature-verified session JWT (not yet DB-checked).
  session: SessionClaims | null;
  // Set by the signIn callback for an ordinary login; read by the jwt callback.
  login: (LoginProfile & { userId: string; sessionVersion: number; picture?: string | null }) | null;
  clearLinkCookie: boolean;
};

export type AccountsRuntime = {
  store: AccountStore;
  ready: AuthReadiness;
  request: RequestContext;
};

export function emptyRequestContext(): RequestContext {
  return { linkCookie: "none", session: null, login: null, clearLinkCookie: false };
}

export function linkCookieState(raw: string | null | undefined): RequestContext["linkCookie"] {
  if (raw === null || raw === undefined) return "none";
  return isOpaqueToken(raw) ? hashOpaqueToken(raw) : "malformed";
}

// Verifies and decrypts the next-auth session cookie, then keeps it only if it
// is a central-account token. Pre-accounts stateless tokens yield null.
export async function decodeAccountSession(raw: string | null | undefined, secret: string): Promise<AccountToken | null> {
  if (!raw) return null;
  try {
    return parseAccountToken(await decode({ token: raw, secret }));
  } catch {
    return null;
  }
}

export async function requestContextFrom(
  cookies: { get(name: string): { value: string } | undefined },
  secret: string,
): Promise<RequestContext> {
  const token = await decodeAccountSession(cookies.get(SESSION_COOKIE_NAME)?.value, secret);
  return {
    ...emptyRequestContext(),
    linkCookie: linkCookieState(cookies.get(LINK_COOKIE)?.value),
    session: token ? sessionClaims(token) : null,
  };
}
