// Read side of the Social dashboard on /account (kubcode_app, RLS by member):
// what kubcode did for the member's channels, counted from our own records.
// Exact counts, not samples. No provider ids, no comment text or authors.
import type { Pool, PoolClient } from "pg";
import { getPool, withTransaction } from "../accounts/db";
import { lockMember } from "../accounts/member";
import type { SessionClaims } from "../accounts/session";
import { canSeeOwnPublishing, publishingStanding } from "../channels/access";

/** Default monthly cap of DMs (or TikTok public replies) per channel (kubcode-publishing config). */
export const DM_CAP_PER_MONTH = 5000;
/** The activity window for posts and comments. */
export const ACTIVITY_DAYS = 30;

export type ChannelActivity = {
  channelId: string;
  platform: string;
  name: string;
  /** Answers this calendar month (Asia/Bangkok) that count against the cap: DMs, or public replies on TikTok. */
  answersThisMonth: number;
  /** Matched comments in the window and how many got an answer. */
  matched: number;
  answered: number;
};

export type DashboardActivity = {
  posts: { scheduled: number; published: number; failed: number };
  answersThisMonth: number;
  matched: number;
  answered: number;
  channels: ChannelActivity[];
};

export type ActivityResult = { ok: true; activity: DashboardActivity } | { ok: false; code: "NOT_SIGNED_IN" | "FORBIDDEN" };

export interface DashboardStore {
  activity(session: SessionClaims): Promise<ActivityResult>;
}

// Same answer rules as the worker's cap (kubcode-publishing-store dms_this_month
// and public_replies_this_month): sent, sending or maybe sent; on TikTok, a
// claimed public reply that went or may have gone out.
const COUNTED = `(l.dm_state IN ('dm_sending', 'dm_sent', 'dm_unknown')
                  OR (l.dm_state = 'claimed' AND l.reply_state IN ('none', 'sent')))`;
const MONTH_START = `date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'`;
// A matched comment was answered when its DM (or public reply) went out.
const ANSWERED = `ci.outcome IN ('dm_sent', 'dm_unknown', 'reply_sent')`;

async function read(c: PoolClient, s: SessionClaims): Promise<ActivityResult> {
  const m = await lockMember(c, s);
  if (!m) return { ok: false, code: "NOT_SIGNED_IN" };
  if (!canSeeOwnPublishing(await publishingStanding(c, m))) return { ok: false, code: "FORBIDDEN" };
  const posts = await c.query<{ scheduled: string; published: string; failed: string }>(
    `SELECT count(*) FILTER (WHERE d.status = 'scheduled') AS scheduled,
            count(*) FILTER (WHERE d.status = 'published' AND d.publish_at >= now() - make_interval(days => $1)) AS published,
            count(*) FILTER (WHERE d.status = 'failed' AND d.publish_at >= now() - make_interval(days => $1)) AS failed
       FROM kubcode_accounts.deliveries d
       JOIN kubcode_accounts.posts p ON p.id = d.post_id
      WHERE p.status = 'confirmed'`,
    [ACTIVITY_DAYS],
  );
  const rows = await c.query<{ id: string; platform: string; name: string; answers: string; matched: string; answered: string }>(
    `SELECT ch.id, ch.platform, coalesce(nullif(ch.handle, ''), ch.display_name) AS name,
            (SELECT count(*) FROM kubcode_accounts.dm_ledger l
              WHERE l.channel_id = ch.id AND l.created_at >= ${MONTH_START} AND ${COUNTED}) AS answers,
            (SELECT count(*) FROM kubcode_accounts.comment_items ci
              WHERE ci.channel_id = ch.id AND ci.received_at >= now() - make_interval(days => $1)) AS matched,
            (SELECT count(*) FROM kubcode_accounts.comment_items ci
              WHERE ci.channel_id = ch.id AND ci.received_at >= now() - make_interval(days => $1) AND ${ANSWERED}) AS answered
       FROM kubcode_accounts.channels ch
      -- Connected now (same rule as the channels list: a non-revoked connection).
      WHERE EXISTS (SELECT 1 FROM kubcode_accounts.channel_connections cc
                     WHERE cc.channel_id = ch.id AND cc.status IN ('active', 'needs_reconnect'))
      ORDER BY ch.created_at`,
    [ACTIVITY_DAYS],
  );
  const channels = rows.rows.map((r) => ({
    channelId: r.id,
    platform: r.platform,
    name: r.name,
    answersThisMonth: Number(r.answers),
    matched: Number(r.matched),
    answered: Number(r.answered),
  }));
  const sum = (k: "answersThisMonth" | "matched" | "answered") => channels.reduce((n, ch) => n + ch[k], 0);
  const p = posts.rows[0];
  return {
    ok: true,
    activity: {
      posts: { scheduled: Number(p.scheduled), published: Number(p.published), failed: Number(p.failed) },
      answersThisMonth: sum("answersThisMonth"),
      matched: sum("matched"),
      answered: sum("answered"),
      channels,
    },
  };
}

export function createPgDashboardStore(pool: Pool): DashboardStore {
  return { activity: (s) => withTransaction(pool, (c) => read(c, s)) };
}

export const getDashboardStore = (url: string) => createPgDashboardStore(getPool(url));
