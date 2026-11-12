// "แจ้งฉันเมื่อเปิด" (migration 0012). One row per member per target; joining
// again leaves. Writes lock the member row first (same as stars), so the
// hourly toggle limit cannot be raced.
import type { Pool } from "pg";
import type { SessionClaims } from "../accounts/session";
import { getPool, withTransaction } from "../accounts/db";
import { lockMember } from "../accounts/member";
import type { WaitlistKind, WaitlistTarget } from "./targets";

/** Joins + leaves per member per hour. */
export const WAITLIST_TOGGLES_PER_HOUR = 30;

export type WaitlistFailure = { ok: false; code: "NOT_SIGNED_IN" | "RATE_LIMITED" | "FORBIDDEN" };
export type WaitlistCount = { kind: WaitlistKind; id: string; members: number };

export interface WaitlistStore {
  /** Targets this member has joined (empty when the session does not check out). */
  joined(session: SessionClaims): Promise<WaitlistTarget[]>;
  toggle(session: SessionClaims, target: WaitlistTarget): Promise<{ ok: true; joined: boolean } | WaitlistFailure>;
  /** Owner only: members per target. */
  counts(session: SessionClaims): Promise<{ ok: true; counts: WaitlistCount[] } | WaitlistFailure>;
}

const VIEWER_SQL = `SELECT u.id, u.is_owner FROM kubcode_accounts.users u
  WHERE u.id = $1 AND u.status = 'active' AND u.session_version = $2
    AND EXISTS (SELECT 1 FROM kubcode_accounts.user_identities i
                 WHERE i.user_id = u.id AND i.provider = $3 AND i.subject = $4)`;

export function createPgWaitlistStore(pool: Pool): WaitlistStore {
  const viewer = async (s: SessionClaims) =>
    (await pool.query<{ id: string; is_owner: boolean }>(VIEWER_SQL, [s.uid, s.sv, s.provider, s.sub])).rows[0] ?? null;

  return {
    async joined(session) {
      const v = await viewer(session);
      if (!v) return [];
      const { rows } = await pool.query<{ target_kind: WaitlistKind; target_id: string }>(
        "SELECT target_kind, target_id FROM kubcode_accounts.plan_waitlist WHERE user_id = $1 ORDER BY created_at",
        [v.id],
      );
      return rows.map((r) => ({ kind: r.target_kind, id: r.target_id }));
    },

    async toggle(session, target) {
      return withTransaction(pool, async (c) => {
        const m = await lockMember(c, session);
        if (!m) return { ok: false as const, code: "NOT_SIGNED_IN" as const };
        const { rows } = await c.query<{ n: string }>(
          "SELECT count(*) AS n FROM kubcode_accounts.waitlist_toggles WHERE user_id = $1 AND created_at > now() - interval '1 hour'",
          [m.id],
        );
        if (Number(rows[0].n) >= WAITLIST_TOGGLES_PER_HOUR) return { ok: false as const, code: "RATE_LIMITED" as const };
        const removed = await c.query(
          "DELETE FROM kubcode_accounts.plan_waitlist WHERE user_id = $1 AND target_kind = $2 AND target_id = $3",
          [m.id, target.kind, target.id],
        );
        if (removed.rowCount === 0) {
          await c.query(
            "INSERT INTO kubcode_accounts.plan_waitlist (user_id, target_kind, target_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            [m.id, target.kind, target.id],
          );
        }
        await c.query("INSERT INTO kubcode_accounts.waitlist_toggles (user_id) VALUES ($1)", [m.id]);
        return { ok: true as const, joined: removed.rowCount === 0 };
      });
    },

    async counts(session) {
      const v = await viewer(session);
      if (!v) return { ok: false as const, code: "NOT_SIGNED_IN" as const };
      if (!v.is_owner) return { ok: false as const, code: "FORBIDDEN" as const };
      const { rows } = await pool.query<{ target_kind: WaitlistKind; target_id: string; n: string }>(
        "SELECT target_kind, target_id, count(*) AS n FROM kubcode_accounts.plan_waitlist GROUP BY 1, 2",
      );
      return { ok: true as const, counts: rows.map((r) => ({ kind: r.target_kind, id: r.target_id, members: Number(r.n) })) };
    },
  };
}

export function getWaitlistStore(databaseUrl: string): WaitlistStore {
  return createPgWaitlistStore(getPool(databaseUrl));
}
