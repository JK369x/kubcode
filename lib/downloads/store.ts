// The download log and the per-member download limit (ADR 0002). Each
// download runs in one transaction that first locks the member's row after
// checking the session against the database, so parallel requests of the same
// member are counted one after another and cannot race past the limit.
import type { Pool } from "pg";
import { getPool, withTransaction } from "../accounts/db";
import { lockMember } from "../accounts/member";
import type { SessionClaims } from "../accounts/session";
import { DOWNLOAD_LIMIT, DOWNLOAD_WINDOW_HOURS } from "./limits";

export { DOWNLOAD_LIMIT, DOWNLOAD_WINDOW_HOURS };

export type DownloadOutcome =
  | { ok: true }
  | { ok: false; code: "NOT_SIGNED_IN" }
  | { ok: false; code: "DOWNLOAD_LIMIT"; retryAt: string };

export interface DownloadStore {
  /** Counts and logs one download, or refuses it without logging. */
  recordDownload(viewer: SessionClaims, pkg: { slug: string; version: string }): Promise<DownloadOutcome>;
}

export function createPgDownloadStore(pool: Pool): DownloadStore {
  return {
    recordDownload: (viewer, pkg) =>
      withTransaction(pool, async (c) => {
        const member = await lockMember(c, viewer);
        if (!member) return { ok: false, code: "NOT_SIGNED_IN" };
        const { rows } = await c.query<{ n: string; retry_at: Date | null }>(
          `SELECT count(*) AS n, min(created_at) + make_interval(hours => $2) AS retry_at
             FROM kubcode_accounts.download_events
            WHERE user_id = $1 AND created_at > now() - make_interval(hours => $2)`,
          [member.id, DOWNLOAD_WINDOW_HOURS],
        );
        if (Number(rows[0].n) >= DOWNLOAD_LIMIT)
          return { ok: false, code: "DOWNLOAD_LIMIT", retryAt: new Date(rows[0].retry_at!).toISOString() };
        await c.query(
          `INSERT INTO kubcode_accounts.download_events (user_id, package_slug, package_version)
           VALUES ($1, $2, $3)`,
          [member.id, pkg.slug, pkg.version],
        );
        return { ok: true };
      }),
  };
}

export function getDownloadStore(databaseUrl: string): DownloadStore {
  return createPgDownloadStore(getPool(databaseUrl));
}
