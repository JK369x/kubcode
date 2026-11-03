// Stars, comments, reports and owner hide, on the private kubcode_accounts
// schema. Every write runs in one transaction that first locks the member's
// user row after checking the session against the database (active status,
// current session version, identity still owned), so limits counted from the
// database cannot be raced past by parallel requests of the same member.
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { SessionClaims } from "../accounts/session";
import { getPool, withTransaction } from "../accounts/db";
import {
  INTERACTION_LIMITS,
  bodyDecision,
  commentDecision,
  normalizeComment,
  publicNameDecision,
  starDecision,
  type InteractionErrorCode,
} from "./rules";

export type PageKind = "tool" | "skill";
export type PageKey = { kind: PageKind; slug: string };

export type StoreErrorCode = InteractionErrorCode | "NOT_SIGNED_IN" | "NOT_FOUND" | "FORBIDDEN" | "REPLY_DEPTH";
export type Failure = { ok: false; code: StoreErrorCode };

export type PublicComment = {
  id: string;
  parentId: string | null;
  author: string;
  /** Empty for a deleted comment kept only because it has replies. */
  body: string;
  deleted: boolean;
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
  /** Owner-only fields. */
  hidden?: boolean;
  reports?: number;
};

export type PageState = {
  stars: number;
  starred: boolean;
  viewer: { signedIn: boolean; isOwner: boolean };
  /** One page of threads, newest first, each followed by its replies (oldest first). */
  comments: PublicComment[];
  /** Threads visible to this viewer on the whole page. */
  commentCount: number;
  /** Pass as `before` to load the next (older) page; null on the last page. */
  nextCursor: string | null;
};

export type PageOptions = { limit?: number; before?: string | null };

/** Threads per page; the route clamps caller limits to this maximum. */
export const COMMENT_PAGE_SIZE = 20;

export interface InteractionStore {
  pageState(page: PageKey, viewer: SessionClaims | null, options?: PageOptions): Promise<PageState>;
  toggleStar(viewer: SessionClaims, page: PageKey): Promise<{ ok: true; starred: boolean; stars: number } | Failure>;
  addComment(
    viewer: SessionClaims,
    page: PageKey,
    body: string,
    parentId: string | null,
  ): Promise<{ ok: true; comment: { id: string } } | Failure>;
  editComment(viewer: SessionClaims, id: string, body: string): Promise<{ ok: true } | Failure>;
  deleteComment(viewer: SessionClaims, id: string): Promise<{ ok: true } | Failure>;
  setHidden(viewer: SessionClaims, id: string, hidden: boolean): Promise<{ ok: true } | Failure>;
  report(viewer: SessionClaims, id: string): Promise<{ ok: true } | Failure>;
  /** The name currently shown with this member's comments ("" = fallback). */
  profile(viewer: SessionClaims): Promise<{ ok: true; publicName: string } | Failure>;
  setPublicName(viewer: SessionClaims, name: string): Promise<{ ok: true; publicName: string } | Failure>;
}

/** Shown when a member has no display name from their provider. */
export const FALLBACK_AUTHOR = "สมาชิก";

// Chosen public name, else the provider display name; NULL means fallback.
const AUTHOR_SQL = `CASE WHEN u.public_name IS NOT NULL THEN NULLIF(u.public_name, '')
  ELSE (SELECT i.display_name FROM kubcode_accounts.user_identities i
         WHERE i.user_id = u.id AND i.display_name IS NOT NULL
         ORDER BY i.provider LIMIT 1) END`;

type Member = { id: string; ageHours: number; isOwner: boolean };

const fail = (code: StoreErrorCode): Failure => ({ ok: false, code });
const bodyHash = (text: string) => createHash("sha256").update(text, "utf8").digest();

// Session check + row lock on the member, inside the caller's transaction.
async function lockMember(c: PoolClient, s: SessionClaims): Promise<Member | null> {
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

// Read-only variant for page views: a bad session simply reads as signed out.
async function viewerOf(pool: Pool, s: SessionClaims | null): Promise<Member | null> {
  if (!s) return null;
  const { rows } = await pool.query<{ id: string; is_owner: boolean }>(
    `SELECT u.id, u.is_owner FROM kubcode_accounts.users u
      WHERE u.id = $1 AND u.status = 'active' AND u.session_version = $2
        AND EXISTS (SELECT 1 FROM kubcode_accounts.user_identities i
                     WHERE i.user_id = u.id AND i.provider = $3 AND i.subject = $4)`,
    [s.uid, s.sv, s.provider, s.sub],
  );
  return rows[0] ? { id: rows[0].id, ageHours: 0, isOwner: rows[0].is_owner } : null;
}

const starCount = async (c: Pick<PoolClient, "query">, page: PageKey) =>
  Number(
    (
      await c.query<{ n: string }>(
        "SELECT count(*) AS n FROM kubcode_accounts.page_stars WHERE page_kind = $1 AND page_slug = $2",
        [page.kind, page.slug],
      )
    ).rows[0].n,
  );

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const COMMENT_SELECT = `
  SELECT c.id, c.parent_id, c.user_id, c.body, c.status, c.created_at, c.edited_at,
         ${AUTHOR_SQL} AS author,
         (SELECT count(*) FROM kubcode_accounts.comment_reports r WHERE r.comment_id = c.id) AS reports
    FROM kubcode_accounts.page_comments c
    JOIN kubcode_accounts.users u ON u.id = c.user_id`;

type CommentRow = {
  id: string;
  parent_id: string | null;
  user_id: string;
  body: string | null;
  status: "visible" | "hidden" | "deleted";
  created_at: Date;
  edited_at: Date | null;
  author: string | null;
  reports: string;
};

export function createPgInteractionStore(pool: Pool): InteractionStore {
  const tx = <T>(work: (c: PoolClient) => Promise<T>) => withTransaction(pool, work);

  // Locks the comment row; null when it does not exist.
  async function lockComment(c: PoolClient, id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const { rows } = await c.query<{ id: string; user_id: string; status: CommentRow["status"] }>(
      "SELECT id, user_id, status FROM kubcode_accounts.page_comments WHERE id = $1 FOR UPDATE",
      [id],
    );
    return rows[0] ?? null;
  }

  return {
    async pageState(page, session, options = {}) {
      const viewer = await viewerOf(pool, session);
      const owner = viewer?.isOwner ?? false;
      const limit = Math.min(Math.max(1, options.limit ?? COMMENT_PAGE_SIZE), COMMENT_PAGE_SIZE);
      const before = options.before && UUID.test(options.before) ? options.before : null;
      // A thread is shown if visible, hidden (owner only), or deleted but still
      // anchoring live replies and never moderated.
      const threadVisible = `c.parent_id IS NULL AND (
          c.status = 'visible' OR (c.status = 'hidden' AND $3::boolean)
          OR (c.status = 'deleted' AND c.moderated_at IS NULL AND EXISTS (
                SELECT 1 FROM kubcode_accounts.page_comments r WHERE r.parent_id = c.id AND r.status = 'visible')))`;
      const [stars, starred, count, threads] = await Promise.all([
        starCount(pool, page),
        viewer
          ? pool
              .query(
                "SELECT 1 FROM kubcode_accounts.page_stars WHERE user_id = $1 AND page_kind = $2 AND page_slug = $3",
                [viewer.id, page.kind, page.slug],
              )
              .then((r) => r.rowCount === 1)
          : false,
        pool.query<{ n: string }>(
          `SELECT count(*) AS n FROM kubcode_accounts.page_comments c
            WHERE c.page_kind = $1 AND c.page_slug = $2 AND ${threadVisible}`,
          [page.kind, page.slug, owner],
        ),
        pool.query<CommentRow>(
          `${COMMENT_SELECT}
            WHERE c.page_kind = $1 AND c.page_slug = $2 AND ${threadVisible}
              AND ($4::uuid IS NULL OR (c.created_at, c.id) <
                   (SELECT x.created_at, x.id FROM kubcode_accounts.page_comments x WHERE x.id = $4::uuid))
            ORDER BY c.created_at DESC, c.id DESC
            LIMIT $5`,
          [page.kind, page.slug, owner, before, limit + 1],
        ),
      ]);
      const pageThreads = threads.rows.slice(0, limit);
      const replies = pageThreads.length
        ? (
            await pool.query<CommentRow>(
              `${COMMENT_SELECT}
                WHERE c.parent_id = ANY($1::uuid[])
                  AND (c.status = 'visible' OR (c.status = 'hidden' AND $2::boolean))
                ORDER BY c.created_at, c.id`,
              [pageThreads.map((t) => t.id), owner],
            )
          ).rows
        : [];
      const toPublic = (r: CommentRow): PublicComment => ({
        id: r.id,
        parentId: r.parent_id,
        author: r.status === "deleted" ? FALLBACK_AUTHOR : (r.author ?? FALLBACK_AUTHOR),
        body: r.body ?? "",
        deleted: r.status === "deleted",
        createdAt: r.created_at.toISOString(),
        editedAt: r.edited_at?.toISOString() ?? null,
        mine: viewer !== null && r.user_id === viewer.id && r.status !== "deleted",
        ...(owner ? { hidden: r.status === "hidden", reports: Number(r.reports) } : {}),
      });
      return {
        stars,
        starred,
        viewer: { signedIn: viewer !== null, isOwner: owner },
        comments: pageThreads.flatMap((t) => [toPublic(t), ...replies.filter((r) => r.parent_id === t.id).map(toPublic)]),
        commentCount: Number(count.rows[0].n),
        nextCursor: threads.rows.length > limit ? pageThreads[pageThreads.length - 1].id : null,
      };
    },

    async toggleStar(session, page) {
      return tx(async (c) => {
        const m = await lockMember(c, session);
        if (!m) return fail("NOT_SIGNED_IN");
        const { rows } = await c.query<{ n: string }>(
          "SELECT count(*) AS n FROM kubcode_accounts.star_toggles WHERE user_id = $1 AND created_at > now() - interval '1 hour'",
          [m.id],
        );
        const decision = starDecision({ togglesLastHour: Number(rows[0].n) });
        if (!decision.ok) return decision;
        const removed = await c.query(
          "DELETE FROM kubcode_accounts.page_stars WHERE user_id = $1 AND page_kind = $2 AND page_slug = $3",
          [m.id, page.kind, page.slug],
        );
        if (removed.rowCount === 0) {
          await c.query(
            "INSERT INTO kubcode_accounts.page_stars (user_id, page_kind, page_slug) VALUES ($1, $2, $3)",
            [m.id, page.kind, page.slug],
          );
        }
        await c.query("INSERT INTO kubcode_accounts.star_toggles (user_id) VALUES ($1)", [m.id]);
        return { ok: true as const, starred: removed.rowCount === 0, stars: await starCount(c, page) };
      });
    },

    async addComment(session, page, body, parentId) {
      return tx(async (c) => {
        const m = await lockMember(c, session);
        if (!m) return fail("NOT_SIGNED_IN");
        if (parentId !== null) {
          const { rows } = await c.query<{ parent_id: string | null; status: string }>(
            `SELECT parent_id, status FROM kubcode_accounts.page_comments
              WHERE id = $1 AND page_kind = $2 AND page_slug = $3 FOR SHARE`,
            [/^[0-9a-f-]{36}$/.test(parentId) ? parentId : "00000000-0000-0000-0000-000000000000", page.kind, page.slug],
          );
          if (!rows[0] || rows[0].status !== "visible") return fail("NOT_FOUND");
          if (rows[0].parent_id !== null) return fail("REPLY_DEPTH");
        }
        const text = normalizeComment(body);
        const hash = bodyHash(text);
        const { rows } = await c.query<{ last_secs: number | null; hour: string; day: string; dup: boolean }>(
          `SELECT extract(epoch FROM now() - max(created_at)) AS last_secs,
                  count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS hour,
                  count(*) FILTER (WHERE created_at > now() - interval '1 day') AS day,
                  bool_or(body_hash = $2 AND created_at > now() - make_interval(hours => $3)) AS dup
             FROM kubcode_accounts.page_comments WHERE user_id = $1`,
          [m.id, hash, INTERACTION_LIMITS.duplicateWindowHours],
        );
        const stats = rows[0];
        const decision = commentDecision({
          accountAgeHours: m.ageHours,
          secondsSinceLastComment: stats.last_secs === null ? null : Number(stats.last_secs),
          commentsLastHour: Number(stats.hour),
          commentsLastDay: Number(stats.day),
          duplicateRecent: stats.dup === true,
          body: text,
        });
        if (!decision.ok) return decision;
        const inserted = await c.query<{ id: string }>(
          `INSERT INTO kubcode_accounts.page_comments (user_id, page_kind, page_slug, parent_id, body, body_hash)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [m.id, page.kind, page.slug, parentId, text, hash],
        );
        return { ok: true as const, comment: { id: inserted.rows[0].id } };
      });
    },

    async editComment(session, id, body) {
      return tx(async (c) => {
        const m = await lockMember(c, session);
        if (!m) return fail("NOT_SIGNED_IN");
        const row = await lockComment(c, id);
        if (!row || row.status === "deleted") return fail("NOT_FOUND");
        if (row.user_id !== m.id || row.status === "hidden") return fail("FORBIDDEN");
        const decision = bodyDecision(body, m.ageHours);
        if (!decision.ok) return decision;
        const text = normalizeComment(body);
        await c.query(
          "UPDATE kubcode_accounts.page_comments SET body = $2, body_hash = $3, edited_at = now() WHERE id = $1",
          [id, text, bodyHash(text)],
        );
        return { ok: true as const };
      });
    },

    async deleteComment(session, id) {
      return tx(async (c) => {
        const m = await lockMember(c, session);
        if (!m) return fail("NOT_SIGNED_IN");
        const row = await lockComment(c, id);
        if (!row || row.status === "deleted") return fail("NOT_FOUND");
        if (row.user_id !== m.id) return fail("FORBIDDEN");
        await c.query(
          "UPDATE kubcode_accounts.page_comments SET status = 'deleted', body = NULL, body_hash = NULL WHERE id = $1",
          [id],
        );
        return { ok: true as const };
      });
    },

    async setHidden(session, id, hidden) {
      return tx(async (c) => {
        const m = await lockMember(c, session);
        if (!m) return fail("NOT_SIGNED_IN");
        if (!m.isOwner) return fail("FORBIDDEN");
        const row = await lockComment(c, id);
        if (!row || row.status === "deleted") return fail("NOT_FOUND");
        await c.query(
          `UPDATE kubcode_accounts.page_comments
              SET status = $2, moderated_at = CASE WHEN $2 = 'hidden' THEN now() END WHERE id = $1`,
          [id, hidden ? "hidden" : "visible"],
        );
        return { ok: true as const };
      });
    },

    async report(session, id) {
      return tx(async (c) => {
        const m = await lockMember(c, session);
        if (!m) return fail("NOT_SIGNED_IN");
        const row = await lockComment(c, id);
        if (!row || row.status === "deleted") return fail("NOT_FOUND");
        if (row.user_id === m.id) return fail("FORBIDDEN");
        await c.query(
          "INSERT INTO kubcode_accounts.comment_reports (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [id, m.id],
        );
        return { ok: true as const };
      });
    },

    async profile(session) {
      return tx(async (c) => {
        const m = await lockMember(c, session);
        if (!m) return fail("NOT_SIGNED_IN");
        const { rows } = await c.query<{ author: string | null }>(
          `SELECT ${AUTHOR_SQL} AS author FROM kubcode_accounts.users u WHERE u.id = $1`,
          [m.id],
        );
        return { ok: true as const, publicName: rows[0].author ?? "" };
      });
    },

    async setPublicName(session, raw) {
      return tx(async (c) => {
        const m = await lockMember(c, session);
        if (!m) return fail("NOT_SIGNED_IN");
        const decision = publicNameDecision(raw);
        if (!decision.ok) return decision;
        await c.query("UPDATE kubcode_accounts.users SET public_name = $2, updated_at = now() WHERE id = $1", [
          m.id,
          decision.name,
        ]);
        return { ok: true as const, publicName: decision.name };
      });
    },
  };
}

export function getInteractionStore(databaseUrl: string): InteractionStore {
  return createPgInteractionStore(getPool(databaseUrl));
}
