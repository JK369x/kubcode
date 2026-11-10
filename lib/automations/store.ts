// Automation rules of an Instagram channel for the web host (role kubcode_app,
// RLS by workspace; docs/design/ig-comment-dm.md §4.6, migration 0010). The web
// role writes rules and reads outcomes and counts; commenter ids are not even
// readable here (no column grant).
import type { Pool, PoolClient } from "pg";
import type { SessionClaims } from "../accounts/session";
import { getPool, withTransaction } from "../accounts/db";
import { lockMember } from "../accounts/member";
import { canUsePublishing } from "../channels/access";
import type { MatchMode, ReplyPolicy, RuleInput, RulePatch } from "./rules";

export type AutomationFailure = {
  ok: false;
  code: "NOT_SIGNED_IN" | "FORBIDDEN" | "CHANNEL_NOT_FOUND" | "RULE_NOT_FOUND" | "RULE_LIMIT";
};
export type RuleView = RuleInput & { id: string; position: number; updatedAt: string };
export type AutomationChannel = { id: string; displayName: string; handle: string | null };
export type OutcomeView = { receivedAt: string; outcome: string | null; status: "pending" | "done"; platformPostId: string };

/** The worker reads every rule of a channel per comment; keep the list short. */
export const MAX_RULES_PER_CHANNEL = 50;
export const RECENT_LIMIT = 20;

export interface AutomationStore {
  /** The member allowed to use publishing (owner-only in phase 1). */
  member(session: SessionClaims): Promise<{ ok: true; userId: string } | AutomationFailure>;
  rules(session: SessionClaims, channelId: string): Promise<{ ok: true; channel: AutomationChannel; rules: RuleView[] } | AutomationFailure>;
  create(session: SessionClaims, channelId: string, input: RuleInput): Promise<{ ok: true; rule: RuleView } | AutomationFailure>;
  update(session: SessionClaims, channelId: string, ruleId: string, patch: RulePatch): Promise<{ ok: true; rule: RuleView } | AutomationFailure>;
  remove(session: SessionClaims, channelId: string, ruleId: string): Promise<{ ok: true } | AutomationFailure>;
  /** DMs that count against the monthly cap since the 1st in Asia/Bangkok. */
  usage(session: SessionClaims, channelId: string, now: Date): Promise<{ ok: true; count: number } | AutomationFailure>;
  /** The latest received comments' outcomes, newest first. */
  recent(session: SessionClaims, channelId: string, limit?: number): Promise<{ ok: true; items: OutcomeView[] } | AutomationFailure>;
}

type RuleRow = {
  id: string;
  keywords: string[];
  match_mode: MatchMode;
  platform_post_id: string | null;
  public_reply: string | null;
  dm_text: string;
  reply_policy: ReplyPolicy;
  active: boolean;
  position: number;
  updated_at: Date;
};
const RULE_COLUMNS = "id, keywords, match_mode, platform_post_id, public_reply, dm_text, reply_policy, active, position, updated_at";
const T = "kubcode_accounts.automation_rules";

const ruleView = (r: RuleRow): RuleView => ({
  id: r.id,
  keywords: r.keywords,
  matchMode: r.match_mode,
  platformPostId: r.platform_post_id,
  publicReply: r.public_reply,
  dmText: r.dm_text,
  replyPolicy: r.reply_policy,
  active: r.active,
  position: r.position,
  updatedAt: r.updated_at.toISOString(),
});

/** RulePatch field -> column; fixed names only ever reach the SQL text. */
const COLUMN: Record<keyof RulePatch, string> = {
  keywords: "keywords",
  matchMode: "match_mode",
  platformPostId: "platform_post_id",
  publicReply: "public_reply",
  dmText: "dm_text",
  replyPolicy: "reply_policy",
  active: "active",
};

/** Member gate, then the channel: an Instagram channel the member's workspace holds (RLS). */
async function enter(c: PoolClient, s: SessionClaims, channelId?: string): Promise<AutomationChannel | string | AutomationFailure> {
  const member = await lockMember(c, s);
  if (!member) return { ok: false, code: "NOT_SIGNED_IN" };
  if (!canUsePublishing(member)) return { ok: false, code: "FORBIDDEN" };
  await c.query("SELECT set_config('kubcode.user_id', $1, true)", [member.id]);
  if (channelId === undefined) return member.id;
  const { rows } = await c.query<{ id: string; display_name: string; handle: string | null }>(
    `SELECT id, display_name, handle FROM kubcode_accounts.channels WHERE id = $1 AND platform = 'instagram'`,
    [channelId],
  );
  const ch = rows[0];
  return ch ? { id: ch.id, displayName: ch.display_name, handle: ch.handle } : { ok: false, code: "CHANNEL_NOT_FOUND" };
}

const failed = (v: unknown): v is AutomationFailure => typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;

export function createPgAutomationStore(pool: Pool): AutomationStore {
  const tx = <T>(work: (c: PoolClient) => Promise<T>) => withTransaction(pool, work);
  /** Runs `work` for a channel the member may manage. */
  const onChannel = <T>(s: SessionClaims, channelId: string, work: (c: PoolClient, ch: AutomationChannel) => Promise<T>) =>
    tx(async (c) => {
      const ch = await enter(c, s, channelId);
      if (failed(ch)) return ch;
      return work(c, ch as AutomationChannel);
    });

  return {
    member: (s) =>
      tx(async (c) => {
        const id = await enter(c, s);
        return failed(id) ? id : { ok: true as const, userId: id as string };
      }),

    rules: (s, channelId) =>
      onChannel(s, channelId, async (c, channel) => {
        const { rows } = await c.query<RuleRow>(
          `SELECT ${RULE_COLUMNS} FROM ${T} WHERE channel_id = $1 ORDER BY position, created_at, id`,
          [channelId],
        );
        return { ok: true as const, channel, rules: rows.map(ruleView) };
      }),

    create: (s, channelId, input) =>
      onChannel(s, channelId, async (c) => {
        const { rows: counted } = await c.query<{ n: number; next: number }>(
          `SELECT count(*)::int AS n, coalesce(max(position) + 1, 0)::int AS next FROM ${T} WHERE channel_id = $1`,
          [channelId],
        );
        if (counted[0].n >= MAX_RULES_PER_CHANNEL) return { ok: false as const, code: "RULE_LIMIT" as const };
        const { rows } = await c.query<RuleRow>(
          `INSERT INTO ${T} (channel_id, keywords, match_mode, platform_post_id, public_reply, dm_text, reply_policy, active, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${RULE_COLUMNS}`,
          [channelId, input.keywords, input.matchMode, input.platformPostId, input.publicReply, input.dmText, input.replyPolicy, input.active, counted[0].next],
        );
        return { ok: true as const, rule: ruleView(rows[0]) };
      }),

    update: (s, channelId, ruleId, patch) =>
      onChannel(s, channelId, async (c) => {
        const keys = (Object.keys(patch) as (keyof RulePatch)[]).filter((k) => patch[k] !== undefined && Object.hasOwn(COLUMN, k));
        const sets = keys.map((k, i) => `${COLUMN[k]} = $${i + 3}`);
        const { rows } = await c.query<RuleRow>(
          `UPDATE ${T} SET ${[...sets, "updated_at = now()"].join(", ")}
            WHERE id = $1 AND channel_id = $2 RETURNING ${RULE_COLUMNS}`,
          [ruleId, channelId, ...keys.map((k) => patch[k])],
        );
        return rows[0] ? { ok: true as const, rule: ruleView(rows[0]) } : { ok: false as const, code: "RULE_NOT_FOUND" as const };
      }),

    remove: (s, channelId, ruleId) =>
      onChannel(s, channelId, async (c) => {
        const r = await c.query(`DELETE FROM ${T} WHERE id = $1 AND channel_id = $2`, [ruleId, channelId]);
        return r.rowCount ? { ok: true as const } : { ok: false as const, code: "RULE_NOT_FOUND" as const };
      }),

    usage: (s, channelId, now) =>
      onChannel(s, channelId, async (c) => {
        // Same window and states as the worker's cap (dms_this_month).
        const { rows } = await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM kubcode_accounts.dm_ledger
            WHERE channel_id = $1
              AND created_at >= date_trunc('month', $2::timestamptz AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'
              AND dm_state IN ('dm_sending', 'dm_sent', 'dm_unknown')`,
          [channelId, now.toISOString()],
        );
        return { ok: true as const, count: rows[0].n };
      }),

    recent: (s, channelId, limit = RECENT_LIMIT) =>
      onChannel(s, channelId, async (c) => {
        const { rows } = await c.query<{ received_at: Date; outcome: string | null; status: "pending" | "done"; platform_post_id: string }>(
          `SELECT received_at, outcome, status, platform_post_id FROM kubcode_accounts.comment_items
            WHERE channel_id = $1 ORDER BY received_at DESC, id LIMIT $2`,
          [channelId, Math.min(Math.max(Math.trunc(limit), 1), 50)],
        );
        return {
          ok: true as const,
          items: rows.map((r) => ({ receivedAt: r.received_at.toISOString(), outcome: r.outcome, status: r.status, platformPostId: r.platform_post_id })),
        };
      }),
  };
}

export function getAutomationStore(databaseUrl: string): AutomationStore {
  return createPgAutomationStore(getPool(databaseUrl));
}
