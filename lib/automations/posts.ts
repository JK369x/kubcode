// The post picker on /account/channels/<id>/automations:
//   GET /api/channels/{id}/posts -> {ok, posts: PickerPost[], complete}
// The publishing Lambda reads the channel's own recent posts through the
// provider (Instagram media ids and TikTok video ids, the same ids a rule and
// the comment webhook use) and adds the posts kubcode published there. Only
// the member's own Instagram or TikTok channel answers. Everything that comes
// back is re-checked here before it reaches the page.
import type { AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { ACCOUNT_ERRORS, accountErrorResponse } from "../accounts/errors";
import { canonicalHostRedirect } from "../auth-policy";
import { callLambda, type ChannelRouteDeps } from "../channels/routes";
import { readPublishingConfig } from "../channels/config";
import { getChannelStore } from "../channels/store";
import { sessionOf } from "../keys/connect-routes";
import { readAutomationsConfig } from "./config";

export type PickerPost = {
  platformPostId: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  caption: string;
  createdAt: string | null;
  /** Published through kubcode. */
  kubcode: boolean;
};

export const MAX_PICKER_POSTS = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POST_ID = /^[0-9]{1,64}$/;
/** Browsers may cache the list this long; the Lambda caches its own read too. */
const CACHE = "private, max-age=30";

type RouteError = "NOT_FOUND_FEATURE" | "UNAVAILABLE" | "FORBIDDEN" | "NOT_SIGNED_IN" | "CHANNEL_NOT_FOUND";
const ERRORS: Record<RouteError, { status: number; message: string }> = {
  NOT_FOUND_FEATURE: { status: 404, message: "ไม่พบหน้านี้" },
  UNAVAILABLE: { status: 503, message: "โหลดโพสต์ของช่องนี้ไม่ได้ตอนนี้ ลองใหม่ภายหลัง หรือใส่ ID เอง" },
  FORBIDDEN: { status: 403, message: "คุณไม่มีสิทธิ์ใช้ระบบโพสต์" },
  NOT_SIGNED_IN: ACCOUNT_ERRORS.NOT_SIGNED_IN,
  CHANNEL_NOT_FOUND: { status: 404, message: "ไม่พบช่อง Instagram หรือ TikTok นี้" },
};

const errorResponse = (code: RouteError) =>
  Response.json({ code, message: ERRORS[code].message }, { status: ERRORS[code].status, headers: { "Cache-Control": "no-store" } });

const https = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length <= max && /^https:\/\/[^\s"'<>\\]+$/.test(v) ? v : null;

/** One post from the Lambda, or null when anything about it is off. */
export function pickerPost(v: unknown): PickerPost | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.platformPostId !== "string" || !POST_ID.test(o.platformPostId)) return null;
  const created = typeof o.createdAt === "string" && !Number.isNaN(Date.parse(o.createdAt)) ? new Date(o.createdAt).toISOString() : null;
  return {
    platformPostId: o.platformPostId,
    permalink: https(o.permalink, 500),
    thumbnailUrl: https(o.thumbnailUrl, 2000),
    caption: typeof o.caption === "string" ? [...o.caption.replace(/[\u0000-\u001f\u007f]/g, " ")].slice(0, 120).join("") : "",
    createdAt: created,
    kubcode: o.kubcode === true,
  };
}

/** A read from the page itself: same origin when the browser says so. */
function sameSite(request: Request): boolean {
  if (canonicalHostRedirect(request.headers)) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

export async function handleChannelPosts(request: Request, channelId: string, deps: ChannelRouteDeps = {}): Promise<Response> {
  if (!UUID.test(channelId)) return accountErrorResponse("BAD_REQUEST");
  const env: AuthEnv = deps.env ?? process.env;
  const automations = readAutomationsConfig(env);
  if (automations.mode === "off") return errorResponse("NOT_FOUND_FEATURE");
  const publishing = readPublishingConfig(env);
  const accounts = readAccountsConfig(env);
  if (automations.mode !== "on" || publishing.mode !== "on" || accounts.mode !== "on") return errorResponse("UNAVAILABLE");
  if (!sameSite(request)) return accountErrorResponse("BAD_ORIGIN");
  const session = await sessionOf(request, env);
  if (!session) return errorResponse("NOT_SIGNED_IN");
  const store = deps.storeFor?.(accounts.databaseUrl) ?? getChannelStore(accounts.databaseUrl);
  let userId: string;
  try {
    const m = await store.member(session);
    if (!m.ok) return errorResponse(m.code);
    userId = m.userId;
  } catch (error) {
    logDbFailure("CHANNEL_POSTS", error);
    return errorResponse("UNAVAILABLE");
  }
  const answer = await callLambda(publishing, "/api/channels/posts", { user_id: userId, channel_id: channelId }, deps);
  if (answer?.code === "channel_not_found") return errorResponse("CHANNEL_NOT_FOUND");
  if (answer?.ok !== true || !Array.isArray(answer.posts)) return errorResponse("UNAVAILABLE");
  const posts = answer.posts.map(pickerPost).filter((p): p is PickerPost => p !== null).slice(0, MAX_PICKER_POSTS);
  return Response.json({ ok: true, posts, complete: answer.complete === true }, { headers: { "Cache-Control": CACHE } });
}
