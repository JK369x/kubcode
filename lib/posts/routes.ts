// The web composer (owner and paid members; lib/channels/access.ts):
//   POST /api/posts/upload   {kind, sha256, contentType, bytes, width, height, seconds?, clipRef}
//        -> {ok, assetId, upload: {url, headers}}   (browser PUTs the file to S3 itself)
//   POST /api/posts          {clipRef, videoAsset, coverAsset, caption, title?, targets[], publishAt|null}
//        -> {ok, post, deliveries[]}
//   POST /api/posts/cancel   {deliveryId} -> {ok}
// Same guards as connect/billing: flag, Origin/CSRF/exact body, session,
// then the member gate. The Lambda chooses the S3 key and computes the
// confirm digest; the web host never sees a provider id.
import { readPublishingConfig } from "../channels/config";
import { callLambda, writeContext, type ChannelRouteDeps } from "../channels/routes";
import { jsonNoStore } from "../accounts/http";
import { CHANNEL_ERRORS, postError, type PostErrorCode } from "./errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLIP_REF = /^web-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
export const MIN_LEAD_MS = 5 * 60_000;
export const MAX_TARGETS = 10;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const COVER_TYPES = ["image/png", "image/jpeg"] as const;
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const COVER_MAX_BYTES = 2 * 1024 * 1024;
export const CAPTION_MAX = 2200;
export const TITLE_MAX = 100;

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const has = (b: Record<string, unknown>, keys: string[], optional: string[] = []) =>
  Object.keys(b).every((k) => keys.includes(k) || optional.includes(k)) && keys.every((k) => k in b);

/** Lambda refusal codes we show; anything else is a generic failure. */
const LAMBDA_CODES: Record<string, PostErrorCode> = {
  upload_type: "UPLOAD_TYPE",
  upload_too_large: "UPLOAD_TOO_LARGE",
  upload_quota: "UPLOAD_QUOTA",
  bad_asset: "BAD_REQUEST",
  bad_sha256: "BAD_REQUEST",
  uploads_unavailable: "UNAVAILABLE",
  asset_not_found: "ASSET_NOT_FOUND",
  delivery_not_found: "DELIVERY_NOT_FOUND",
  already_final: "ALREADY_FINAL",
  post_not_found: "DELIVERY_NOT_FOUND",
};

export async function handleUpload(request: Request, deps: ChannelRouteDeps = {}): Promise<Response> {
  const ctx = await writeContext(request, deps, 1024, (b) => {
    if (!has(b, ["kind", "sha256", "contentType", "bytes", "width", "height", "clipRef"], ["seconds"])) return false;
    if (typeof b.clipRef !== "string" || !CLIP_REF.test(b.clipRef) || typeof b.sha256 !== "string" || !SHA.test(b.sha256)) return false;
    if (!isInt(b.width, 1, 8192) || !isInt(b.height, 1, 8192)) return false;
    if (b.kind === "video")
      return (VIDEO_TYPES as readonly unknown[]).includes(b.contentType) && isInt(b.bytes, 1, VIDEO_MAX_BYTES) && typeof b.seconds === "number" && b.seconds > 0 && b.seconds <= 3600;
    if (b.kind === "cover") return (COVER_TYPES as readonly unknown[]).includes(b.contentType) && isInt(b.bytes, 1, COVER_MAX_BYTES) && b.seconds === undefined;
    return false;
  });
  if (ctx instanceof Response) return ctx;
  const b = ctx.body;
  const answer = await callLambda(
    ctx.config,
    "/api/media/presign",
    {
      user_id: ctx.userId,
      asset: { clip_ref: b.clipRef, kind: b.kind, sha256: b.sha256, content_type: b.contentType, bytes: b.bytes, width: b.width, height: b.height, seconds: b.kind === "video" ? b.seconds : null },
    },
    deps,
  );
  if (!answer) return postError("UNAVAILABLE");
  if (answer.ok !== true) return postError(LAMBDA_CODES[String(answer.code)] ?? "UNAVAILABLE");
  const upload = answer.upload as { url?: unknown; headers?: unknown } | undefined;
  const url = typeof upload?.url === "string" ? upload.url : "";
  // Only ever hand the browser an S3 URL for our media bucket (or, in a local
  // preview outside production, the loopback media stand-in).
  if (!uploadUrlOk(url, deps.env ?? process.env)) return postError("UNAVAILABLE");
  const headers = Array.isArray(upload?.headers) ? (upload!.headers as [string, string][]).filter((h) => Array.isArray(h) && h.length === 2) : [];
  return jsonNoStore({ ok: true, assetId: answer.asset_id, upload: { url, headers: Object.fromEntries(headers) } });
}

const S3_UPLOAD = /^https:\/\/kubcode-media-[0-9]{12}\.s3\.ap-southeast-1\.amazonaws\.com\/clips\//;
const LOCAL_UPLOAD = /^http:\/\/127\.0\.0\.1:\d{2,5}\/clips\//;
export function uploadUrlOk(url: string, env: Record<string, string | undefined>): boolean {
  if (S3_UPLOAD.test(url)) return true;
  return env.NODE_ENV !== "production" || env.KUBCODE_LOCAL_MEDIA === "true" ? LOCAL_UPLOAD.test(url) : false;
}

type Target = { channelId: string; visibility: "public" | "private" | "unlisted" };

export async function handleSchedule(request: Request, deps: ChannelRouteDeps = {}): Promise<Response> {
  const now = (deps.now ?? Date.now)();
  const ctx = await writeContext(request, deps, 8 * 1024, (b) => {
    // clipRef is the draft's idempotency key: one draft → one post (Lambda checks).
    if (!has(b, ["clipRef", "videoAsset", "coverAsset", "caption", "targets", "publishAt"], ["title"])) return false;
    if (typeof b.clipRef !== "string" || !CLIP_REF.test(b.clipRef)) return false;
    if (typeof b.videoAsset !== "string" || !UUID.test(b.videoAsset) || typeof b.coverAsset !== "string" || !UUID.test(b.coverAsset)) return false;
    if (typeof b.caption !== "string" || b.caption.length > CAPTION_MAX) return false;
    if (b.title !== undefined && (typeof b.title !== "string" || [...b.title].length > TITLE_MAX)) return false;
    if (b.publishAt !== null && (typeof b.publishAt !== "string" || !Number.isFinite(Date.parse(b.publishAt)))) return false;
    if (!Array.isArray(b.targets) || b.targets.length < 1 || b.targets.length > MAX_TARGETS) return false;
    const ids = new Set<string>();
    for (const t of b.targets as unknown[]) {
      if (typeof t !== "object" || t === null) return false;
      const o = t as Record<string, unknown>;
      if (!has(o, ["channelId", "visibility"]) || typeof o.channelId !== "string" || !UUID.test(o.channelId)) return false;
      if (!["public", "private", "unlisted"].includes(String(o.visibility))) return false;
      if (ids.has(o.channelId)) return false;
      ids.add(o.channelId);
    }
    return true;
  });
  if (ctx instanceof Response) return ctx;
  const b = ctx.body as { clipRef: string; videoAsset: string; coverAsset: string; caption: string; title?: string; targets: Target[]; publishAt: string | null };
  // "Post now" is now + 5 minutes (the providers need a short lead); a chosen time must be at least that far.
  const at = b.publishAt === null ? now + MIN_LEAD_MS : Date.parse(b.publishAt);
  if (at < now + MIN_LEAD_MS - 30_000) return postError("TOO_SOON");
  if (at > now + 30 * 86_400_000) return postError("TOO_FAR");
  const publishAt = new Date(Math.ceil(at / 60_000) * 60_000).toISOString();
  const caption = b.caption.trim();
  const title = (b.title ?? "").trim() || [...caption.split("\n")[0]].slice(0, TITLE_MAX).join("");
  const answer = await callLambda(
    ctx.config,
    "/api/posts/schedule",
    {
      user_id: ctx.userId,
      request: {
        clip_ref: b.clipRef,
        video_asset: b.videoAsset,
        cover_asset: b.coverAsset,
        title,
        description: caption,
        tags: [],
        targets: b.targets.map((t) => ({ channel: t.channelId, publish_at: publishAt, visibility: t.visibility })),
      },
    },
    deps,
  );
  if (!answer) return postError("UNAVAILABLE");
  if (answer.ok !== true) return postError(LAMBDA_CODES[String(answer.code)] ?? "SCHEDULE_FAILED");
  if (answer.already === true) return jsonNoStore({ ok: true, post: (answer.result as { post?: string }).post, already: true, deliveries: [] });
  const result = answer.result as { post?: string; deliveries?: { channel: string; delivery: string | null; status: string; codes: string[] }[] };
  return jsonNoStore({
    ok: true,
    post: result.post,
    publishAt,
    deliveries: (result.deliveries ?? []).map((d) => ({ channelId: d.channel, deliveryId: d.delivery, status: d.status, codes: d.codes.slice(0, 5) })),
  });
}

export async function handleCancel(request: Request, deps: ChannelRouteDeps = {}): Promise<Response> {
  const ctx = await writeContext(request, deps, 256, (b) => has(b, ["deliveryId"]) && typeof b.deliveryId === "string" && UUID.test(b.deliveryId));
  if (ctx instanceof Response) return ctx;
  const answer = await callLambda(ctx.config, "/api/posts/cancel", { user_id: ctx.userId, delivery_id: ctx.body.deliveryId }, deps);
  if (!answer) return postError("UNAVAILABLE");
  if (answer.ok !== true) return postError(LAMBDA_CODES[String(answer.code)] ?? "UNAVAILABLE");
  return jsonNoStore({ ok: true });
}

export const postsEnabled = (env = process.env) => readPublishingConfig(env).mode === "on";
export { CHANNEL_ERRORS };
