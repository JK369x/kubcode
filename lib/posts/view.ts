// Server view models for /account/posts and /account/posts/new.
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig, type AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims } from "../accounts/session";
import type { CookieSource } from "../accounts/view";
import { readPublishingConfig } from "../channels/config";
import { getChannelStore } from "../channels/store";
import type { ComposerChannel } from "@/components/PostComposer";
import { getPostStore, type PostView } from "./store";
import { getDashboardStore, type DashboardActivity } from "../dashboard/store";

type Gate = { state: "disabled" } | { state: "unavailable" } | { state: "signed-out" } | { state: "forbidden" };

async function session(env: AuthEnv, getCookies: () => Promise<CookieSource>) {
  const config = readPublishingConfig(env);
  const accounts = readAccountsConfig(env);
  if (config.mode === "off" || accounts.mode === "off") return { gate: { state: "disabled" } as Gate };
  const auth = readAuthConfig(env);
  if (config.mode === "broken" || accounts.mode === "broken" || !auth.ok) return { gate: { state: "unavailable" } as Gate };
  const token = await decodeAccountSession((await getCookies()).get(SESSION_COOKIE_NAME)?.value, auth.config.secret);
  if (!token || !providerReadiness(auth)[token.provider]) return { gate: { state: "signed-out" } as Gate };
  return { s: sessionClaims(token), url: accounts.databaseUrl };
}

export async function getComposerView(env: AuthEnv, getCookies: () => Promise<CookieSource>): Promise<Gate | { state: "ready"; channels: ComposerChannel[] }> {
  const g = await session(env, getCookies);
  if ("gate" in g) return g.gate as Gate;
  try {
    const store = getChannelStore(g.url);
    // Posting needs paid access; the channel list alone is also open to a lapsed member.
    const m = await store.member(g.s);
    if (!m.ok) return { state: m.code === "FORBIDDEN" ? "forbidden" : "signed-out" };
    const r = await store.channels(g.s);
    if (!r.ok) return { state: r.code === "FORBIDDEN" ? "forbidden" : "signed-out" };
    return {
      state: "ready",
      channels: r.channels
        .filter((c) => c.status !== "disconnected")
        .map((c) => ({
          id: c.id,
          platform: c.platform,
          displayName: c.displayName,
          handle: c.handle,
          usable: c.status === "active" && !c.paused,
          note: c.paused ? "พักไว้ (แพ็กเกจ)" : c.status === "needs_reconnect" ? "ต้องเชื่อมใหม่" : null,
        })),
    };
  } catch (error) {
    logDbFailure("COMPOSER_VIEW", error);
    return { state: "unavailable" };
  }
}

export async function getPostsView(env: AuthEnv, getCookies: () => Promise<CookieSource>): Promise<Gate | { state: "ready"; posts: PostView[] }> {
  const g = await session(env, getCookies);
  if ("gate" in g) return g.gate as Gate;
  try {
    const r = await getPostStore(g.url).posts(g.s);
    if (!r.ok) return { state: r.code === "FORBIDDEN" ? "forbidden" : "signed-out" };
    return { state: "ready", posts: r.posts };
  } catch (error) {
    logDbFailure("POSTS_VIEW", error);
    return { state: "unavailable" };
  }
}

export async function getDashboardView(
  env: AuthEnv,
  getCookies: () => Promise<CookieSource>,
): Promise<Gate | { state: "ready"; activity: DashboardActivity }> {
  const g = await session(env, getCookies);
  if ("gate" in g) return g.gate as Gate;
  try {
    const r = await getDashboardStore(g.url).activity(g.s);
    if (!r.ok) return { state: r.code === "FORBIDDEN" ? "forbidden" : "signed-out" };
    return { state: "ready", activity: r.activity };
  } catch (error) {
    logDbFailure("DASHBOARD_VIEW", error);
    return { state: "unavailable" };
  }
}
