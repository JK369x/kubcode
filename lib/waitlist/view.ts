// Server-side view model for /account/waitlist (owner only): members per
// coming-soon plan and unopened roadmap item. Counts only, no member data.
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig, type AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims } from "../accounts/session";
import type { CookieSource } from "../accounts/view";
import { getWaitlistStore, type WaitlistStore } from "./store";
import { waitlistTargets, type WaitlistKind } from "./targets";

export type WaitlistRow = { kind: WaitlistKind; id: string; label: string; members: number };
export type WaitlistView =
  | { state: "disabled" }
  | { state: "unavailable" }
  | { state: "signed-out" }
  | { state: "forbidden" }
  | { state: "ready"; rows: WaitlistRow[] };

export async function getWaitlistView(
  env: AuthEnv,
  getCookies: () => Promise<CookieSource>,
  storeFor: (databaseUrl: string) => WaitlistStore = getWaitlistStore,
): Promise<WaitlistView> {
  const accounts = readAccountsConfig(env);
  if (accounts.mode === "off") return { state: "disabled" };
  const auth = readAuthConfig(env);
  if (accounts.mode === "broken" || !auth.ok) return { state: "unavailable" };
  const token = await decodeAccountSession((await getCookies()).get(SESSION_COOKIE_NAME)?.value, auth.config.secret);
  if (!token || !providerReadiness(auth)[token.provider]) return { state: "signed-out" };
  try {
    const r = await storeFor(accounts.databaseUrl).counts(sessionClaims(token));
    if (!r.ok) return { state: r.code === "FORBIDDEN" ? "forbidden" : "signed-out" };
    const n = new Map(r.counts.map((c) => [`${c.kind}:${c.id}`, c.members]));
    return { state: "ready", rows: waitlistTargets().map((t) => ({ ...t, members: n.get(`${t.kind}:${t.id}`) ?? 0 })) };
  } catch (error) {
    logDbFailure("WAITLIST_COUNTS", error);
    return { state: "unavailable" };
  }
}
