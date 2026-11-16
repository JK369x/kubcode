// What the signed-in member may open, for the header menu and /account:
// publishing (channels, posts, comment rules) and billing. Booleans only.
import type { Pool } from "pg";
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig, type AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { getPool, logDbFailure, withTransaction } from "../accounts/db";
import { jsonNoStore, readCookie } from "../accounts/http";
import { lockMember } from "../accounts/member";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims, type SessionClaims } from "../accounts/session";
import { readBillingConfig } from "../billing/config";
import { canUsePublishing, publishingStanding } from "../channels/access";
import { readPublishingConfig } from "../channels/config";

export type Capabilities = { publishing: boolean; billing: boolean };
export const NONE: Capabilities = { publishing: false, billing: false };

export async function capabilitiesOf(pool: Pool, s: SessionClaims, env: AuthEnv, now = new Date()): Promise<Capabilities> {
  const publishingOn = readPublishingConfig(env).mode === "on";
  const billing = readBillingConfig(env).mode === "on";
  if (!publishingOn) return { publishing: false, billing };
  return withTransaction(pool, async (c) => {
    const m = await lockMember(c, s);
    if (!m) return NONE;
    return { publishing: canUsePublishing(await publishingStanding(c, m), now), billing };
  });
}

/** Reads the session cookie; any problem answers "nothing", never an error page. */
export async function capabilitiesFromCookies(
  env: AuthEnv,
  cookie: string | undefined,
  poolFor: (url: string) => Pool = getPool,
): Promise<Capabilities> {
  const accounts = readAccountsConfig(env);
  const auth = readAuthConfig(env);
  if (accounts.mode !== "on" || !auth.ok) return NONE;
  const token = await decodeAccountSession(cookie, auth.config.secret);
  if (!token || !providerReadiness(auth)[token.provider]) return NONE;
  try {
    return await capabilitiesOf(poolFor(accounts.databaseUrl), sessionClaims(token), env);
  } catch (error) {
    logDbFailure("CAPABILITIES", error);
    return NONE;
  }
}

export async function handleCapabilities(request: Request, env: AuthEnv = process.env): Promise<Response> {
  return jsonNoStore(await capabilitiesFromCookies(env, readCookie(request, SESSION_COOKIE_NAME) ?? undefined));
}
