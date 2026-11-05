// Server-side view model for /account/keys. Only metadata leaves this module
// (kinds, public ids, last-4 hints, connection labels, audit events).
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig, type AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims } from "../accounts/session";
import type { CookieSource } from "../accounts/view";
import { keysEnabled } from "./access";
import { getKeyStore, type KeyStore, type Overview } from "./store";

export type KeysView =
  | { state: "disabled" }
  | { state: "unavailable" }
  | { state: "signed-out" }
  /** Signed in but not allowed (phase 1: not the owner). */
  | { state: "forbidden" }
  | { state: "ready"; overview: Overview; canSave: boolean };

export async function getKeysView(
  env: AuthEnv,
  getCookies: () => Promise<CookieSource>,
  storeFor: (databaseUrl: string) => KeyStore = getKeyStore,
): Promise<KeysView> {
  const accounts = readAccountsConfig(env);
  if (accounts.mode === "off" || !keysEnabled(env)) return { state: "disabled" };
  const auth = readAuthConfig(env);
  if (accounts.mode === "broken" || !auth.ok) return { state: "unavailable" };
  const cookies = await getCookies();
  const token = await decodeAccountSession(cookies.get(SESSION_COOKIE_NAME)?.value, auth.config.secret);
  if (!token || !providerReadiness(auth)[token.provider]) return { state: "signed-out" };
  try {
    const store = storeFor(accounts.databaseUrl);
    const overview = await store.overview(sessionClaims(token));
    if (!overview.ok) return { state: overview.code === "FORBIDDEN" ? "forbidden" : "signed-out" };
    return { state: "ready", overview, canSave: store.sealing };
  } catch (error) {
    logDbFailure("KEYS_READ", error);
    return { state: "unavailable" };
  }
}
