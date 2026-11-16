// Read side of /account/posts for the web host (kubcode_app, RLS by member):
// posts with their per-channel deliveries and receipts. No provider ids.
import type { Pool, PoolClient } from "pg";
import { getPool, withTransaction } from "../accounts/db";
import { lockMember } from "../accounts/member";
import type { SessionClaims } from "../accounts/session";
import { canUsePublishing, publishingStanding } from "../channels/access";

export type DeliveryView = {
  id: string;
  channelId: string;
  channelName: string;
  platform: string;
  status: "pending" | "rejected" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  publishAt: string;
  error: string | null;
  url: string | null;
};
export type PostView = { id: string; caption: string; createdAt: string; deliveries: DeliveryView[] };
export type PostsResult = { ok: true; posts: PostView[] } | { ok: false; code: "NOT_SIGNED_IN" | "FORBIDDEN" };

export interface PostStore {
  posts(session: SessionClaims, limit?: number): Promise<PostsResult>;
}

async function read(c: PoolClient, s: SessionClaims, limit: number): Promise<PostsResult> {
  const m = await lockMember(c, s);
  if (!m) return { ok: false, code: "NOT_SIGNED_IN" };
  if (!canUsePublishing(await publishingStanding(c, m))) return { ok: false, code: "FORBIDDEN" };
  const { rows } = await c.query<{
    post_id: string; description: string; created_at: Date;
    id: string; channel_id: string; display_name: string; platform: string; status: DeliveryView["status"];
    publish_at: Date; last_error_code: string | null; platform_url: string | null;
  }>(
    `WITH recent AS (
       SELECT p.id, p.description, p.created_at FROM kubcode_accounts.posts p
        WHERE p.status = 'confirmed' ORDER BY p.created_at DESC LIMIT $1)
     SELECT r.id AS post_id, r.description, r.created_at,
            d.id, d.channel_id, c.display_name, d.platform, d.status, d.publish_at, d.last_error_code, rc.platform_url
       FROM recent r
       JOIN kubcode_accounts.deliveries d ON d.post_id = r.id
       JOIN kubcode_accounts.channels c ON c.id = d.channel_id
       LEFT JOIN kubcode_accounts.receipts rc ON rc.delivery_id = d.id
      ORDER BY r.created_at DESC, d.publish_at, c.display_name`,
    [limit],
  );
  const byPost = new Map<string, PostView>();
  for (const r of rows) {
    const p = byPost.get(r.post_id) ?? { id: r.post_id, caption: r.description, createdAt: r.created_at.toISOString(), deliveries: [] };
    p.deliveries.push({
      id: r.id,
      channelId: r.channel_id,
      channelName: r.display_name,
      platform: r.platform,
      status: r.status,
      publishAt: r.publish_at.toISOString(),
      error: r.last_error_code,
      url: r.platform_url && /^https:\/\//.test(r.platform_url) ? r.platform_url : null,
    });
    byPost.set(r.post_id, p);
  }
  return { ok: true, posts: [...byPost.values()] };
}

export function createPgPostStore(pool: Pool): PostStore {
  return { posts: (s, limit = 30) => withTransaction(pool, (c) => read(c, s, Math.min(Math.max(limit, 1), 100))) };
}

export const getPostStore = (url: string) => createPgPostStore(getPool(url));
