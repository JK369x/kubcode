// Who may connect channels, publish and set comment automations, in one place
// (ADR 0004 slice 1 opened by ADR 0008): the site owner, or a member whose
// workspace has paid slots right now (active pass, or inside the 3-day grace).
// The slot gate on connect and the billing pauses still apply on top.
import type { PoolClient } from "pg";
import type { Member } from "../accounts/member";
import { standingAt } from "../billing/store";

export type PublishingStanding = { owner: boolean; slots: number; paidUntil: Date | null };

/** Pure rule: owner, or paid slots > 0 while active or in grace. */
export function canUsePublishing(s: PublishingStanding, now: Date = new Date()): boolean {
  if (s.owner) return true;
  if (s.slots <= 0) return false;
  const { standing } = standingAt(s.paidUntil, s.slots, now);
  return standing === "active" || standing === "grace";
}

/**
 * Reads the member's standing inside the caller's transaction. Sets
 * kubcode.user_id (RLS) as a side effect, which every caller needs anyway.
 */
export async function publishingStanding(c: PoolClient, member: Member): Promise<PublishingStanding> {
  await c.query("SELECT set_config('kubcode.user_id', $1, true)", [member.id]);
  if (member.isOwner) return { owner: true, slots: 0, paidUntil: null };
  const { rows } = await c.query<{ slots: number; paid_until: Date | null }>(
    `SELECT e.slots, e.paid_until
       FROM kubcode_accounts.billing_entitlements e
       JOIN kubcode_accounts.workspace_members m ON m.workspace_id = e.workspace_id
      WHERE m.user_id = $1 AND m.role = 'owner'`,
    [member.id],
  );
  return { owner: false, slots: rows[0]?.slots ?? 0, paidUntil: rows[0]?.paid_until ?? null };
}
