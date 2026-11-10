// Handlers for /api/interactions/*. Route files are thin wrappers; deps are
// injectable so every guard is testable without a database.
//
// Write order: feature availability → guardWrite (Origin, CSRF, media type,
// size, streamed body) → body shape → page exists → signed session → store.
import type { AuthEnv } from "../auth-policy";
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { accountErrorResponse, ACCOUNT_ERRORS, type AccountErrorCode } from "../accounts/errors";
import { jsonNoStore, readCookie } from "../accounts/http";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims, type SessionClaims } from "../accounts/session";
import { rawSkills } from "../catalog";
import { getContent, slugProblem } from "../content";
import { hrefOf } from "../content-links";
import { guardWrite } from "./http";
import {
  COMMENT_PAGE_SIZE,
  FEED_PAGE_SIZE,
  getInteractionStore,
  isPageKind,
  type InteractionStore,
  type PageKey,
  type StoreErrorCode,
} from "./store";

/**
 * Stars and comments stay off until this is exactly "true", independent of
 * central accounts: deploy first, apply migration 0002 + its grants, then
 * enable. Until then reads say unavailable and nothing queries the new tables.
 */
export const INTERACTIONS_FLAG = "KUBCODE_INTERACTIONS_ENABLED";
export const interactionsEnabled = (env: AuthEnv) => env[INTERACTIONS_FLAG] === "true";

export type InteractionDeps = {
  env?: AuthEnv;
  storeFor?: (databaseUrl: string) => InteractionStore;
  pageExists?: (page: PageKey) => boolean;
  /** Title shown for a page in the community feed; null when the page is gone. */
  pageTitle?: (page: PageKey) => string | null;
};

/** Comment text ≤2000 chars is ≤8000 UTF-8 bytes; JSON framing fits too. */
export const MAX_WRITE_BYTES = 9 * 1024;

const INTERACTION_ERRORS: Record<StoreErrorCode | "PAGE_NOT_FOUND" | "INTERACTIONS_DISABLED", { status: number; message: string }> = {
  INTERACTIONS_DISABLED: { status: 503, message: "ดาวและคอมเมนต์ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้" },
  NOT_SIGNED_IN: ACCOUNT_ERRORS.NOT_SIGNED_IN,
  PAGE_NOT_FOUND: { status: 404, message: "ไม่พบหน้านี้" },
  NOT_FOUND: { status: 404, message: "ไม่พบคอมเมนต์นี้ หรือถูกลบไปแล้ว" },
  FORBIDDEN: { status: 403, message: "คุณไม่มีสิทธิ์ทำรายการนี้" },
  REPLY_DEPTH: { status: 422, message: "ตอบกลับได้เพียงชั้นเดียว" },
  COMMENT_EMPTY: { status: 422, message: "พิมพ์ข้อความก่อนส่ง" },
  COMMENT_TOO_LONG: { status: 422, message: "คอมเมนต์ยาวได้ไม่เกิน 2,000 ตัวอักษร" },
  COMMENT_TOO_SOON: { status: 429, message: "รออย่างน้อย 20 วินาทีก่อนคอมเมนต์ถัดไป" },
  COMMENT_LINKS: { status: 422, message: "ใส่ลิงก์ได้ไม่เกิน 2 ลิงก์ และบัญชีใหม่ (ไม่ถึง 24 ชั่วโมง) ยังใส่ลิงก์ไม่ได้" },
  COMMENT_DUPLICATE: { status: 409, message: "คุณเพิ่งส่งข้อความนี้ไปแล้ว" },
  RATE_LIMITED: { status: 429, message: "ทำรายการถี่เกินไป ลองใหม่ภายหลัง" },
  NAME_INVALID: { status: 422, message: "ชื่อยาวได้ไม่เกิน 40 ตัวอักษร และห้ามมีลิงก์" },
};

function errorResponse(code: StoreErrorCode | "PAGE_NOT_FOUND" | "INTERACTIONS_DISABLED"): Response {
  const e = INTERACTION_ERRORS[code] ?? ACCOUNT_ERRORS.ACCOUNTS_UNAVAILABLE;
  return Response.json({ code, message: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function defaultPageTitle(page: PageKey): string | null {
  if (page.kind === "skill") return rawSkills.find((s) => s.slug === page.slug)?.name ?? null;
  if (page.kind === "article") return getContent().articles.find((a) => a.slug === page.slug)?.title ?? null;
  return getContent().tools.find((t) => t.slug === page.slug)?.name ?? null;
}

export const defaultPageExists = (page: PageKey): boolean => defaultPageTitle(page) !== null;


function pageFrom(kind: unknown, slug: unknown): PageKey | null {
  if (!isPageKind(kind) || typeof slug !== "string" || slugProblem(slug)) return null;
  return { kind, slug };
}

const onlyKeys = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((k) => keys.includes(k)) && keys.every((k) => Object.hasOwn(body, k));

type Ctx = { store: InteractionStore; session: SessionClaims | null; pageExists: (p: PageKey) => boolean };

async function context(request: Request, deps: InteractionDeps): Promise<Ctx | Response> {
  const env = deps.env ?? process.env;
  const accounts = readAccountsConfig(env);
  if (accounts.mode === "off") return accountErrorResponse("ACCOUNTS_DISABLED");
  if (accounts.mode === "broken") return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  if (!interactionsEnabled(env)) return errorResponse("INTERACTIONS_DISABLED");
  const auth = readAuthConfig(env);
  if (!auth.ok) return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  const ready = providerReadiness(auth);
  const token = await decodeAccountSession(readCookie(request, SESSION_COOKIE_NAME), auth.config.secret);
  return {
    store: (deps.storeFor ?? getInteractionStore)(accounts.databaseUrl),
    session: token && ready[token.provider] ? sessionClaims(token) : null,
    pageExists: deps.pageExists ?? defaultPageExists,
  };
}

type Outcome = { ok: true } | { ok: false; code: StoreErrorCode };

/** Shared write pipeline; `act` returns the JSON for a successful result. */
async function write(
  request: Request,
  deps: InteractionDeps,
  op: string,
  act: (ctx: Ctx & { session: SessionClaims }, body: Record<string, unknown>) => Promise<Response | Outcome | (Outcome & Record<string, unknown>)>,
  options: { body?: boolean } = {},
): Promise<Response> {
  // Availability first, without reading the session: nothing else is touched.
  const env = deps.env ?? process.env;
  const accounts = readAccountsConfig(env);
  if (accounts.mode !== "on") return accountErrorResponse(accounts.mode === "off" ? "ACCOUNTS_DISABLED" : "ACCOUNTS_UNAVAILABLE");
  if (!interactionsEnabled(env)) return errorResponse("INTERACTIONS_DISABLED");
  const guarded = await guardWrite(request, MAX_WRITE_BYTES, options);
  if (!guarded.ok) return accountErrorResponse(guarded.code as AccountErrorCode);
  const ctx = await context(request, deps);
  if (ctx instanceof Response) return ctx;
  try {
    const result = await act(ctx as Ctx & { session: SessionClaims }, guarded.body);
    if (result instanceof Response) return result;
    if (!result.ok) return errorResponse(result.code);
    return jsonNoStore(result);
  } catch (error) {
    logDbFailure(op, error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}

const badRequest = () => accountErrorResponse("BAD_REQUEST");
const notSignedIn = () => errorResponse("NOT_SIGNED_IN");

export async function handlePageState(request: Request, deps: InteractionDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  if (readAccountsConfig(env).mode === "off" || !interactionsEnabled(env)) return jsonNoStore({ available: false });
  const ctx = await context(request, deps);
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const page = pageFrom(url.searchParams.get("kind"), url.searchParams.get("slug"));
  if (!page) return badRequest();
  const before = url.searchParams.get("before");
  if (before !== null && !UUID.test(before)) return badRequest();
  const askedLimit = Number(url.searchParams.get("limit") ?? COMMENT_PAGE_SIZE);
  const limit = Number.isInteger(askedLimit) ? Math.min(Math.max(askedLimit, 1), COMMENT_PAGE_SIZE) : COMMENT_PAGE_SIZE;
  if (!ctx.pageExists(page)) return errorResponse("PAGE_NOT_FOUND");
  try {
    return jsonNoStore(await ctx.store.pageState(page, ctx.session, { before, limit }));
  } catch (error) {
    logDbFailure("PAGE_STATE", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}

/**
 * GET /api/interactions/star-counts?kind=tool — counts for the index cards. Public
 * aggregate only: no session is read and no per-user data is returned.
 */
export async function handleStarCounts(request: Request, deps: InteractionDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const accounts = readAccountsConfig(env);
  if (accounts.mode === "off" || !interactionsEnabled(env)) return jsonNoStore({ available: false });
  if (accounts.mode === "broken") return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  const kind = new URL(request.url).searchParams.get("kind");
  if (!isPageKind(kind)) return badRequest();
  const exists = deps.pageExists ?? defaultPageExists;
  try {
    const counts = await (deps.storeFor ?? getInteractionStore)(accounts.databaseUrl).starCounts(kind);
    const stars = Object.fromEntries(Object.entries(counts).filter(([slug]) => exists({ kind, slug })));
    return jsonNoStore({ available: true, stars });
  } catch (error) {
    logDbFailure("STAR_COUNTS", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}

/**
 * GET /api/interactions/latest?limit=5&before=<id> — the public community feed:
 * newest visible comments across all pages with the page title and link.
 * No session is read; entries carry the public name only (no ids, no emails).
 */
export async function handleLatestComments(request: Request, deps: InteractionDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const accounts = readAccountsConfig(env);
  if (accounts.mode === "off" || !interactionsEnabled(env)) return jsonNoStore({ available: false });
  if (accounts.mode === "broken") return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  if (before !== null && !UUID.test(before)) return badRequest();
  const asked = Number(url.searchParams.get("limit") ?? FEED_PAGE_SIZE);
  if (!Number.isInteger(asked)) return badRequest();
  const limit = Math.min(Math.max(asked, 1), FEED_PAGE_SIZE);
  const title = deps.pageTitle ?? defaultPageTitle;
  try {
    const feed = await (deps.storeFor ?? getInteractionStore)(accounts.databaseUrl).latestComments({ limit, before });
    const comments = feed.comments.flatMap(({ id, kind, slug, author, body, isReply, createdAt }) => {
      const page = { kind, slug };
      const t = title(page);
      // A page removed from the site drops out of the feed (its comments stay).
      return t === null ? [] : [{ id, kind, slug, title: t, href: hrefOf(page), author, body, isReply, createdAt }];
    });
    return jsonNoStore({ available: true, comments, nextCursor: feed.nextCursor });
  } catch (error) {
    logDbFailure("LATEST_COMMENTS", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}

export const handleStar = (request: Request, deps: InteractionDeps = {}) =>
  write(request, deps, "STAR_TOGGLE", async (ctx, body) => {
    if (!onlyKeys(body, ["kind", "slug"])) return badRequest();
    const page = pageFrom(body.kind, body.slug);
    if (!page) return badRequest();
    if (!ctx.pageExists(page)) return errorResponse("PAGE_NOT_FOUND");
    if (!ctx.session) return notSignedIn();
    return ctx.store.toggleStar(ctx.session, page);
  });

export const handleComment = (request: Request, deps: InteractionDeps = {}) =>
  write(request, deps, "COMMENT_ADD", async (ctx, body) => {
    if (!onlyKeys(body, ["kind", "slug", "body", "parentId"])) return badRequest();
    const page = pageFrom(body.kind, body.slug);
    const parentId = body.parentId;
    if (!page || typeof body.body !== "string") return badRequest();
    if (parentId !== null && !(typeof parentId === "string" && UUID.test(parentId))) return badRequest();
    if (!ctx.pageExists(page)) return errorResponse("PAGE_NOT_FOUND");
    if (!ctx.session) return notSignedIn();
    return ctx.store.addComment(ctx.session, page, body.body, parentId);
  });

function byId(op: string, keys: string[], run: (ctx: Ctx & { session: SessionClaims }, id: string, body: Record<string, unknown>) => Promise<Response | Outcome>, options: { body?: boolean } = {}) {
  return (request: Request, id: string, deps: InteractionDeps = {}) =>
    write(
      request,
      deps,
      op,
      async (ctx, body) => {
        if (!UUID.test(id) || !onlyKeys(body, keys)) return badRequest();
        if (!ctx.session) return notSignedIn();
        return run(ctx, id, body);
      },
      options,
    );
}

export const handleCommentEdit = byId("COMMENT_EDIT", ["body"], (ctx, id, body) =>
  typeof body.body === "string" ? ctx.store.editComment(ctx.session, id, body.body) : Promise.resolve(badRequest()),
);
export const handleCommentDelete = byId("COMMENT_DELETE", [], (ctx, id) => ctx.store.deleteComment(ctx.session, id), {
  body: false,
});
export const handleCommentHide = byId("COMMENT_HIDE", ["hidden"], (ctx, id, body) =>
  typeof body.hidden === "boolean" ? ctx.store.setHidden(ctx.session, id, body.hidden) : Promise.resolve(badRequest()),
);
export const handleCommentReport = byId("COMMENT_REPORT", [], (ctx, id) => ctx.store.report(ctx.session, id));

export const handlePublicName = (request: Request, deps: InteractionDeps = {}) =>
  write(request, deps, "PUBLIC_NAME", async (ctx, body) => {
    if (!onlyKeys(body, ["publicName"]) || typeof body.publicName !== "string") return badRequest();
    if (!ctx.session) return notSignedIn();
    return ctx.store.setPublicName(ctx.session, body.publicName);
  });

/** Signed-in read of the member's current public name (settings prefill). */
export async function handlePublicNameRead(request: Request, deps: InteractionDeps = {}): Promise<Response> {
  const ctx = await context(request, deps);
  if (ctx instanceof Response) return ctx;
  if (!ctx.session) return notSignedIn();
  try {
    const result = await ctx.store.profile(ctx.session);
    return result.ok ? jsonNoStore(result) : errorResponse(result.code);
  } catch (error) {
    logDbFailure("PUBLIC_NAME_READ", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}
