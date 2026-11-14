// Read-only billing view for the web host (migration 0013 grants kubcode_app
// SELECT on its own workspace's rows, never Stripe ids). The entitlement row
// is written by the billing Lambda in the same transaction as each payment.
import type { Pool, PoolClient } from "pg";
import { getPool, withTransaction } from "../accounts/db";
import { lockMember } from "../accounts/member";
import type { SessionClaims } from "../accounts/session";
import { GRACE_DAYS } from "./config";

export type Standing = "none" | "active" | "grace" | "lapsed" | "exempt";
export type Reminder = "t7" | "t3" | "t0" | "grace" | "paused" | null;

export type BillingView = {
  userId: string;
  exempt: boolean;
  workspaceId: string | null;
  slots: number;
  paidUntil: string | null;
  standing: Standing;
  reminder: Reminder;
  /** Channels connected now (not disconnected), for the slot check. */
  activeChannels: number;
  pausedChannels: number;
  purchases: {
    kind: string;
    slots: number;
    amountSatang: number;
    status: string;
    paidAt: string | null;
    periodEnd: string;
    method: string | null;
    /// Refunds and disputes (migration 0014): shown as Thai labels in the history.
    refundedSatang: number;
    dispute: "open" | "won" | "lost" | null;
    revoked: "refunded" | "dispute_lost" | null;
  }[];
};

const DAY = 86_400_000;

/** Standing and banner from paid_until (mirrors kubcode-billing::sweep::reminder). */
export function standingAt(paidUntil: Date | null, slots: number, now: Date): { standing: Standing; reminder: Reminder; usable: number } {
  if (!paidUntil) return { standing: "none", reminder: null, usable: 0 };
  const left = paidUntil.getTime() - now.getTime();
  if (left > 0) {
    const reminder: Reminder = left < DAY ? "t0" : left <= 3 * DAY ? "t3" : left <= 7 * DAY ? "t7" : null;
    return { standing: "active", reminder, usable: slots };
  }
  if (-left < GRACE_DAYS * DAY) return { standing: "grace", reminder: "grace", usable: slots };
  return { standing: "lapsed", reminder: "paused", usable: 0 };
}

export interface BillingStore {
  view(session: SessionClaims, now: Date): Promise<BillingView | null>;
}

async function read(c: PoolClient, s: SessionClaims, now: Date): Promise<BillingView | null> {
  const m = await lockMember(c, s);
  if (!m) return null;
  await c.query("SELECT set_config('kubcode.user_id', $1, true)", [m.id]);
  const ws = await c.query<{ workspace_id: string }>(
    "SELECT workspace_id FROM kubcode_accounts.workspace_members WHERE user_id = $1 AND role = 'owner'",
    [m.id],
  );
  const workspaceId = ws.rows[0]?.workspace_id ?? null;
  const base = { userId: m.id, exempt: m.isOwner, workspaceId };
  if (!workspaceId) {
    return { ...base, slots: 0, paidUntil: null, standing: m.isOwner ? "exempt" : "none", reminder: null, activeChannels: 0, pausedChannels: 0, purchases: [] };
  }
  const ent = await c.query<{ slots: number; paid_until: Date | null }>(
    "SELECT slots, paid_until FROM kubcode_accounts.billing_entitlements WHERE workspace_id = $1",
    [workspaceId],
  );
  const counts = await c.query<{ active: string; paused: string }>(
    `SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM kubcode_accounts.channel_connections cc
                                            WHERE cc.channel_id = ch.id AND cc.status <> 'revoked')) AS active,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM kubcode_accounts.billing_channel_pauses p
                                            WHERE p.channel_id = ch.id AND p.resumed_at IS NULL)) AS paused
       FROM kubcode_accounts.channels ch WHERE ch.workspace_id = $1`,
    [workspaceId],
  );
  const purchases = await c.query<{
    kind: string; slots: number; amount_satang: string; status: string; paid_at: Date | null; period_end: Date; payment_method: string | null;
    refunded_satang: string; dispute: string | null; revoked_reason: string | null;
  }>(
    `SELECT kind, slots, amount_satang, status, paid_at, period_end, payment_method,
            refunded_satang, dispute, revoked_reason
       FROM kubcode_accounts.billing_purchases WHERE workspace_id = $1 AND status = 'paid'
      ORDER BY paid_at DESC LIMIT 12`,
    [workspaceId],
  );
  const slots = ent.rows[0]?.slots ?? 0;
  const paidUntil = ent.rows[0]?.paid_until ?? null;
  const st = m.isOwner ? { standing: "exempt" as const, reminder: null } : standingAt(paidUntil, slots, now);
  return {
    ...base,
    slots,
    paidUntil: paidUntil ? paidUntil.toISOString() : null,
    standing: st.standing,
    reminder: st.reminder,
    activeChannels: Number(counts.rows[0]?.active ?? 0),
    pausedChannels: Number(counts.rows[0]?.paused ?? 0),
    purchases: purchases.rows.map((r) => ({
      kind: r.kind,
      slots: r.slots,
      amountSatang: Number(r.amount_satang),
      status: r.status,
      paidAt: r.paid_at ? r.paid_at.toISOString() : null,
      periodEnd: r.period_end.toISOString(),
      method: r.payment_method,
      refundedSatang: Number(r.refunded_satang),
      dispute: r.dispute === "open" || r.dispute === "won" || r.dispute === "lost" ? r.dispute : null,
      revoked: r.revoked_reason === "refunded" || r.revoked_reason === "dispute_lost" ? r.revoked_reason : null,
    })),
  };
}

export function createPgBillingStore(pool: Pool): BillingStore {
  return { view: (s, now) => withTransaction(pool, (c) => read(c, s, now)) };
}

export function getBillingStore(databaseUrl: string): BillingStore {
  return createPgBillingStore(getPool(databaseUrl));
}

/** Connect gate (ADR 0008): a non-exempt member may hold at most `usable` connected channels. */
export function canConnectAnother(v: Pick<BillingView, "exempt" | "slots" | "paidUntil" | "activeChannels">, now: Date): boolean {
  if (v.exempt) return true;
  const { usable } = standingAt(v.paidUntil ? new Date(v.paidUntil) : null, v.slots, now);
  return v.activeChannels < usable;
}
