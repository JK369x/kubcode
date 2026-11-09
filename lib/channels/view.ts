// Server-side view model for /account/channels. Only our ids, labels and
// statuses leave this module; provider ids are not even readable here.
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig, type AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims } from "../accounts/session";
import type { CookieSource } from "../accounts/view";
import { readPublishingConfig } from "./config";
import { getChannelStore, type ChannelStore, type ChannelView } from "./store";

export type ChannelsView =
  | { state: "disabled" }
  | { state: "unavailable" }
  | { state: "signed-out" }
  | { state: "forbidden" }
  | { state: "ready"; channels: ChannelView[] };

export async function getChannelsView(
  env: AuthEnv,
  getCookies: () => Promise<CookieSource>,
  storeFor: (databaseUrl: string) => ChannelStore = getChannelStore,
): Promise<ChannelsView> {
  const config = readPublishingConfig(env);
  const accounts = readAccountsConfig(env);
  if (config.mode === "off" || accounts.mode === "off") return { state: "disabled" };
  const auth = readAuthConfig(env);
  if (config.mode === "broken" || accounts.mode === "broken" || !auth.ok) return { state: "unavailable" };
  const cookies = await getCookies();
  const token = await decodeAccountSession(cookies.get(SESSION_COOKIE_NAME)?.value, auth.config.secret);
  if (!token || !providerReadiness(auth)[token.provider]) return { state: "signed-out" };
  try {
    const r = await storeFor(accounts.databaseUrl).channels(sessionClaims(token));
    if (!r.ok) return { state: r.code === "FORBIDDEN" ? "forbidden" : "signed-out" };
    return { state: "ready", channels: r.channels };
  } catch (error) {
    logDbFailure("CHANNELS_READ", error);
    return { state: "unavailable" };
  }
}
