// Server-side view model for /account/settings. Only public account data
// (provider, display name, Google email, link date) leaves this module.
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig, type AuthEnv, type AuthReadiness } from "../auth-policy";
import { readAccountsConfig } from "./config";
import { logDbFailure } from "./db";
import { LINK_COOKIE } from "./http";
import { decodeAccountSession, linkCookieState } from "./runtime";
import { sessionClaims } from "./session";
import { getAccountStore, type AccountStore, type SettingsIdentity, type SettingsIntent } from "./store";

export type CookieSource = { get(name: string): { value: string } | undefined };

export type SettingsView =
  | { state: "disabled" }
  | { state: "unavailable" }
  | { state: "signed-out" }
  | {
      state: "ready";
      providers: AuthReadiness;
      identities: SettingsIdentity[];
      intent: SettingsIntent | null;
      staleIntentCookie: boolean;
    };

export function accountsEnabled(env: AuthEnv = process.env): boolean {
  return readAccountsConfig(env).mode === "on" && readAuthConfig(env).ok;
}

export async function getSettingsView(
  env: AuthEnv,
  getCookies: () => Promise<CookieSource>,
  storeFor: (databaseUrl: string) => AccountStore = getAccountStore,
): Promise<SettingsView> {
  const accounts = readAccountsConfig(env);
  if (accounts.mode === "off") return { state: "disabled" };
  const auth = readAuthConfig(env);
  if (accounts.mode === "broken" || !auth.ok) return { state: "unavailable" };
  const providers = providerReadiness(auth);
  const cookies = await getCookies();
  const token = await decodeAccountSession(cookies.get(SESSION_COOKIE_NAME)?.value, auth.config.secret);
  if (!token || !providers[token.provider]) return { state: "signed-out" };
  const link = linkCookieState(cookies.get(LINK_COOKIE)?.value);
  try {
    const data = await storeFor(accounts.databaseUrl).getSettings(
      sessionClaims(token),
      link === "none" || link === "malformed" ? null : link,
    );
    if (!data) return { state: "signed-out" };
    return {
      state: "ready",
      providers,
      identities: data.identities,
      intent: data.intent,
      staleIntentCookie: data.staleIntentCookie || link === "malformed",
    };
  } catch (error) {
    logDbFailure("SETTINGS_READ", error);
    return { state: "unavailable" };
  }
}
