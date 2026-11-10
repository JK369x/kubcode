// Server-side view model for /account/channels/<id>/automations
// (docs/design/ig-comment-dm.md §4.6). Rules, this month's DM count and the
// last outcomes as short labels; commenter ids are not readable here at all.
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig, type AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims } from "../accounts/session";
import type { CookieSource } from "../accounts/view";
import { readAutomationsConfig } from "./config";
import { getAutomationStore, type AutomationChannel, type AutomationStore, type OutcomeView, type RuleView } from "./store";

/** Fair-use DMs per channel per month (§4.4); the worker enforces its own copy. */
export const DM_CAP_PER_MONTH = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type RecentOutcome = { receivedAt: string; label: string; platformPostId: string };
export type AutomationsView =
  | { state: "disabled" }
  | { state: "unavailable" }
  | { state: "signed-out" }
  | { state: "forbidden" }
  | { state: "not-found" }
  | {
      state: "ready";
      channel: AutomationChannel;
      rules: RuleView[];
      usage: { count: number; cap: number };
      recent: RecentOutcome[];
    };

/** Outcome codes the worker writes on an Inbox item (services/…/service.rs). */
const OUTCOME_LABELS: Record<string, string> = {
  dm_sent: "ส่ง DM แล้ว",
  dm_failed: "ส่ง DM ไม่สำเร็จ",
  dm_unknown: "ไม่แน่ใจว่า DM ถึงหรือไม่",
  dm_consumed: "คอมเมนต์นี้ถูกตอบ DM ไปแล้ว",
  duplicate: "คนนี้ได้ DM ของโพสต์นี้แล้ว",
  cap_reached: "DM ครบโควตาเดือนนี้",
  too_old: "คอมเมนต์เก่าเกิน 7 วัน",
  rule_gone: "กฎถูกพักหรือลบก่อนส่ง",
  no_connection: "ช่องไม่ได้เชื่อมอยู่",
  no_inbox: "ระบบส่งข้อความยังไม่พร้อม",
};

export function outcomeLabel(outcome: string | null, status: OutcomeView["status"]): string {
  if (status === "pending" || outcome === null) return "รอส่ง";
  if (OUTCOME_LABELS[outcome]) return OUTCOME_LABELS[outcome];
  if (outcome.startsWith("dm_failed_")) return OUTCOME_LABELS.dm_failed;
  return "อื่น ๆ";
}

export async function getAutomationsView(
  env: AuthEnv,
  getCookies: () => Promise<CookieSource>,
  channelId: string,
  now: Date,
  storeFor: (databaseUrl: string) => AutomationStore = getAutomationStore,
): Promise<AutomationsView> {
  const config = readAutomationsConfig(env);
  const accounts = readAccountsConfig(env);
  if (config.mode === "off" || accounts.mode === "off") return { state: "disabled" };
  const auth = readAuthConfig(env);
  if (config.mode === "broken" || accounts.mode === "broken" || !auth.ok) return { state: "unavailable" };
  const cookies = await getCookies();
  const token = await decodeAccountSession(cookies.get(SESSION_COOKIE_NAME)?.value, auth.config.secret);
  if (!token || !providerReadiness(auth)[token.provider]) return { state: "signed-out" };
  if (!UUID.test(channelId)) return { state: "not-found" };
  const session = sessionClaims(token);
  const store = storeFor(accounts.databaseUrl);
  try {
    const rules = await store.rules(session, channelId);
    if (!rules.ok) {
      if (rules.code === "FORBIDDEN") return { state: "forbidden" };
      return { state: rules.code === "NOT_SIGNED_IN" ? "signed-out" : "not-found" };
    }
    const usage = await store.usage(session, channelId, now);
    const recent = await store.recent(session, channelId);
    if (!usage.ok || !recent.ok) return { state: "unavailable" };
    return {
      state: "ready",
      channel: rules.channel,
      rules: rules.rules,
      usage: { count: usage.count, cap: DM_CAP_PER_MONTH },
      recent: recent.items.map((i) => ({ receivedAt: i.receivedAt, label: outcomeLabel(i.outcome, i.status), platformPostId: i.platformPostId })),
    };
  } catch (error) {
    logDbFailure("AUTOMATIONS_READ", error);
    return { state: "unavailable" };
  }
}
