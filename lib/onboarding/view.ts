// First-run checklist (UX audit P0-3 / §3): pay → connect a channel → set a
// comment reply → first post, computed from what already exists (no new
// tables): entitlement, channels, automation rules, confirmed posts. Runs as
// the web role under RLS, so it only ever counts the member's own rows.
import type { Pool } from "pg";
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig, type AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { getPool, logDbFailure, withTransaction } from "../accounts/db";
import { lockMember } from "../accounts/member";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims, type SessionClaims } from "../accounts/session";
import type { CookieSource } from "../accounts/view";
import { standingAt } from "../billing/store";
import { readPublishingConfig } from "../channels/config";

export type StepId = "pay" | "connect" | "rule" | "post";
export type Step = { id: StepId; done: boolean };
export type Onboarding = {
  owner: boolean;
  /** Active or grace pass end date (ISO), for "ใช้ได้ถึง …". */
  paidUntil: string | null;
  steps: Step[];
  /** First channel that can take a comment rule (Instagram or TikTok), for the rule step's link. */
  ruleChannelId: string | null;
  complete: boolean;
};

/** Pure: steps from counts (owner skips paying). */
export function stepsOf(f: { owner: boolean; paid: boolean; channels: number; rules: number; posts: number }): Step[] {
  const steps: Step[] = [];
  if (!f.owner) steps.push({ id: "pay", done: f.paid });
  steps.push({ id: "connect", done: f.channels > 0 }, { id: "rule", done: f.rules > 0 }, { id: "post", done: f.posts > 0 });
  return steps;
}

export async function onboardingOf(pool: Pool, s: SessionClaims, now = new Date()): Promise<Onboarding | null> {
  return withTransaction(pool, async (c) => {
    const m = await lockMember(c, s);
    if (!m) return null;
    await c.query("SELECT set_config('kubcode.user_id', $1, true)", [m.id]);
    const { rows } = await c.query<{ slots: number | null; paid_until: Date | null; channels: string; rules: string; posts: string; rule_channel: string | null }>(
      `SELECT
         (SELECT e.slots FROM kubcode_accounts.billing_entitlements e
            JOIN kubcode_accounts.workspace_members wm ON wm.workspace_id = e.workspace_id
           WHERE wm.user_id = $1 AND wm.role = 'owner' LIMIT 1) AS slots,
         (SELECT e.paid_until FROM kubcode_accounts.billing_entitlements e
            JOIN kubcode_accounts.workspace_members wm ON wm.workspace_id = e.workspace_id
           WHERE wm.user_id = $1 AND wm.role = 'owner' LIMIT 1) AS paid_until,
         (SELECT count(*) FROM kubcode_accounts.channels) AS channels,
         (SELECT count(*) FROM kubcode_accounts.automation_rules) AS rules,
         (SELECT count(*) FROM kubcode_accounts.posts WHERE status = 'confirmed') AS posts,
         (SELECT id FROM kubcode_accounts.channels WHERE platform IN ('instagram', 'tiktok') ORDER BY created_at LIMIT 1) AS rule_channel`,
      [m.id],
    );
    const r = rows[0];
    const slots = r.slots ?? 0;
    const st = standingAt(r.paid_until, slots, now).standing;
    const paid = slots > 0 && (st === "active" || st === "grace");
    const steps = stepsOf({ owner: m.isOwner, paid, channels: Number(r.channels), rules: Number(r.rules), posts: Number(r.posts) });
    return {
      owner: m.isOwner,
      paidUntil: paid && r.paid_until ? r.paid_until.toISOString() : null,
      steps,
      ruleChannelId: r.rule_channel,
      complete: steps.every((x) => x.done),
    };
  });
}

/** For server pages: null when publishing/accounts are off, signed out or on any error. */
export async function getOnboarding(env: AuthEnv, getCookies: () => Promise<CookieSource>, poolFor: (url: string) => Pool = getPool): Promise<Onboarding | null> {
  if (readPublishingConfig(env).mode !== "on") return null;
  const accounts = readAccountsConfig(env);
  const auth = readAuthConfig(env);
  if (accounts.mode !== "on" || !auth.ok) return null;
  const token = await decodeAccountSession((await getCookies()).get(SESSION_COOKIE_NAME)?.value, auth.config.secret);
  if (!token || !providerReadiness(auth)[token.provider]) return null;
  try {
    return await onboardingOf(poolFor(accounts.databaseUrl), sessionClaims(token));
  } catch (error) {
    logDbFailure("ONBOARDING", error);
    return null;
  }
}
