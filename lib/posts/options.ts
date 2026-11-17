// Per-platform options from the composer (exact shapes, mirrored by the
// Rust core: services/crates/kubcode-publishing/src/options.rs; field names
// verified against Zernio OpenAPI 1.615.0).
export type TikTokOptions = { allowComment?: boolean; allowDuet?: boolean; allowStitch?: boolean; draft?: boolean };
export type InstagramOptions = { shareToFeed?: boolean; commentsEnabled?: boolean; aiGenerated?: boolean; firstComment?: string };
export type YouTubeOptions = { madeForKids?: boolean; syntheticMedia?: boolean; categoryId?: string; notifySubscribers?: boolean; firstComment?: string };
export type TargetOptions = { tiktok?: TikTokOptions; instagram?: InstagramOptions; youtube?: YouTubeOptions };

export const YOUTUBE_CATEGORIES: { id: string; label: string }[] = [
  { id: "22", label: "ผู้คนและบล็อก" },
  { id: "27", label: "การศึกษา" },
  { id: "28", label: "วิทยาศาสตร์และเทคโนโลยี" },
  { id: "26", label: "ฮาวทูและสไตล์" },
  { id: "24", label: "บันเทิง" },
  { id: "23", label: "ตลก" },
  { id: "10", label: "เพลง" },
  { id: "20", label: "เกม" },
  { id: "17", label: "กีฬา" },
  { id: "1", label: "ภาพยนตร์และแอนิเมชัน" },
  { id: "2", label: "ยานยนต์" },
  { id: "15", label: "สัตว์เลี้ยง" },
  { id: "25", label: "ข่าวและการเมือง" },
];
export const PLATFORM_CAPTION_MAX: Record<string, number> = { tiktok: 2200, instagram: 2200, youtube: 5000, facebook: 5000 };

const bool = (v: unknown) => v === undefined || typeof v === "boolean";
const keysOk = (o: Record<string, unknown>, allowed: string[]) => Object.keys(o).every((k) => allowed.includes(k));
const comment = (v: unknown, max: number) => v === undefined || (typeof v === "string" && v.trim().length > 0 && [...v].length <= max);

/** Exact-shape check for one target's options, for its own platform only. */
export function optionsOk(platformKey: string, raw: unknown): boolean {
  if (raw === undefined) return true;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).length !== 1 || !(platformKey in o)) return false;
  const v = o[platformKey];
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  switch (platformKey) {
    case "tiktok":
      return keysOk(p, ["allowComment", "allowDuet", "allowStitch", "draft"]) && ["allowComment", "allowDuet", "allowStitch", "draft"].every((k) => bool(p[k]));
    case "instagram":
      return keysOk(p, ["shareToFeed", "commentsEnabled", "aiGenerated", "firstComment"]) && ["shareToFeed", "commentsEnabled", "aiGenerated"].every((k) => bool(p[k])) && comment(p.firstComment, 2200);
    case "youtube":
      return (
        keysOk(p, ["madeForKids", "syntheticMedia", "categoryId", "notifySubscribers", "firstComment"]) &&
        ["madeForKids", "syntheticMedia", "notifySubscribers"].every((k) => bool(p[k])) &&
        (p.categoryId === undefined || YOUTUBE_CATEGORIES.some((c) => c.id === p.categoryId)) &&
        comment(p.firstComment, 10_000)
      );
    default:
      return false;
  }
}

/** camelCase web shape → the core's snake_case JSON (only set fields). */
export function toCore(o: TargetOptions | undefined): Record<string, unknown> | undefined {
  if (!o) return undefined;
  const pick = (src: Record<string, unknown>, map: Record<string, string>) =>
    Object.fromEntries(Object.entries(map).filter(([k]) => src[k] !== undefined).map(([k, to]) => [to, src[k]]));
  if (o.tiktok) return { tiktok: pick(o.tiktok, { allowComment: "allow_comment", allowDuet: "allow_duet", allowStitch: "allow_stitch", draft: "draft" }) };
  if (o.instagram) return { instagram: pick(o.instagram, { shareToFeed: "share_to_feed", commentsEnabled: "comments_enabled", aiGenerated: "ai_generated", firstComment: "first_comment" }) };
  if (o.youtube) return { youtube: pick(o.youtube, { madeForKids: "made_for_kids", syntheticMedia: "synthetic_media", categoryId: "category_id", notifySubscribers: "notify_subscribers", firstComment: "first_comment" }) };
  return undefined;
}
