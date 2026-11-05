// The signed-in member, checked against the database (active status, current
// session version, identity still owned) and row-locked inside the caller's
// transaction, so limits counted from the database cannot be raced past by
// parallel requests of the same member.
import type { PoolClient } from "pg";
import type { SessionClaims } from "./session";

export type Member = { id: string; ageHours: number; isOwner: boolean };

export async function lockMember(c: PoolClient, s: SessionClaims): Promise<Member | null> {
  const { rows } = await c.query<{ id: string; age_hours: number; is_owner: boolean }>(
    `SELECT u.id, extract(epoch FROM now() - u.created_at) / 3600 AS age_hours, u.is_owner
       FROM kubcode_accounts.users u
      WHERE u.id = $1 AND u.status = 'active' AND u.session_version = $2
        AND EXISTS (SELECT 1 FROM kubcode_accounts.user_identities i
                     WHERE i.user_id = u.id AND i.provider = $3 AND i.subject = $4)
      FOR UPDATE OF u`,
    [s.uid, s.sv, s.provider, s.sub],
  );
  const r = rows[0];
  return r ? { id: r.id, ageHours: Number(r.age_hours), isOwner: r.is_owner } : null;
}
