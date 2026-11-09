// Read side of channels for the web host (role kubcode_app, RLS by member).
// The Lambda writes; the web host never sees a provider id (no grant).
import type { Pool, PoolClient } from "pg";
import type { SessionClaims } from "../accounts/session";
import { getPool, withTransaction } from "../accounts/db";
import { lockMember } from "../accounts/member";
import { canUsePublishing } from "./access";

export type Failure = { ok: false; code: "NOT_SIGNED_IN" | "FORBIDDEN" };
export type ChannelStatus = "active" | "needs_reconnect" | "disconnected";
export type ChannelView = {
  id: string;
  platform: string;
  displayName: string;
  handle: string | null;
  status: ChannelStatus;
  connectedAt: string | null;
};
export type IntentView = { cookieHash: Buffer; bindingHash: Buffer; open: boolean; live: boolean };

export interface ChannelStore {
  /** The member allowed to use publishing (owner-only in phase 1). */
  member(session: SessionClaims): Promise<{ ok: true; userId: string } | Failure>;
  channels(session: SessionClaims): Promise<{ ok: true; channels: ChannelView[] } | Failure>;
  /** The member's own connect intent by state hash, or null. */
  intent(session: SessionClaims, stateHash: Buffer): Promise<IntentView | null>;
}

async function enter(c: PoolClient, s: SessionClaims): Promise<string | Failure> {
  const member = await lockMember(c, s);
  if (!member) return { ok: false, code: "NOT_SIGNED_IN" };
  if (!canUsePublishing(member)) return { ok: false, code: "FORBIDDEN" };
  await c.query("SELECT set_config('kubcode.user_id', $1, true)", [member.id]);
  return member.id;
}

export function createPgChannelStore(pool: Pool): ChannelStore {
  const tx = <T>(work: (c: PoolClient) => Promise<T>) => withTransaction(pool, work);
  return {
    member: (s) =>
      tx(async (c) => {
        const id = await enter(c, s);
        return typeof id === "string" ? { ok: true as const, userId: id } : id;
      }),
    channels: (s) =>
      tx(async (c) => {
        const id = await enter(c, s);
        if (typeof id !== "string") return id;
        const { rows } = await c.query<{
          id: string;
          platform: string;
          display_name: string;
          handle: string | null;
          statuses: string[] | null;
          connected_at: Date | null;
        }>(
          `SELECT ch.id, ch.platform, ch.display_name, ch.handle,
                  array_agg(cc.status) FILTER (WHERE cc.id IS NOT NULL) AS statuses,
                  max(cc.connected_at) FILTER (WHERE cc.status <> 'revoked') AS connected_at
             FROM kubcode_accounts.channels ch
             LEFT JOIN kubcode_accounts.channel_connections cc ON cc.channel_id = ch.id
            GROUP BY ch.id ORDER BY ch.created_at`,
        );
        const status = (s: string[] | null): ChannelStatus =>
          s?.includes("active") ? "active" : s?.includes("needs_reconnect") ? "needs_reconnect" : "disconnected";
        return {
          ok: true as const,
          channels: rows.map((r) => ({
            id: r.id,
            platform: r.platform,
            displayName: r.display_name,
            handle: r.handle,
            status: status(r.statuses),
            connectedAt: r.connected_at ? r.connected_at.toISOString() : null,
          })),
        };
      }),
    intent: (s, stateHash) =>
      tx(async (c) => {
        const id = await enter(c, s);
        if (typeof id !== "string") return null;
        const { rows } = await c.query<{ cookie_hash: Buffer; session_binding_hash: Buffer; status: string; live: boolean }>(
          `SELECT cookie_hash, session_binding_hash, status, expires_at > now() AS live
             FROM kubcode_accounts.channel_connect_intents WHERE state_hash = $1`,
          [stateHash],
        );
        const r = rows[0];
        return r ? { cookieHash: r.cookie_hash, bindingHash: r.session_binding_hash, open: r.status === "open", live: r.live } : null;
      }),
  };
}

export function getChannelStore(databaseUrl: string): ChannelStore {
  return createPgChannelStore(getPool(databaseUrl));
}
