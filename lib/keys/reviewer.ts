import { createHash, timingSafeEqual } from "node:crypto";

export const REVIEW_COOKIE = "__Host-kubcode-youtube-review";
const inviteDigest = "71ec5ec702930564a6021904ba343d184b34de39dbd24f42eaa944f6c71a281f";
export const expiresAt = Date.UTC(2027, 1, 7);
export function validReviewCode(code?: string | null, digest = inviteDigest, now = Date.now()) {
  if (!code || !/^[A-Za-z0-9_-]{32}$/.test(code) || now >= expiresAt) return false;
  return timingSafeEqual(createHash("sha256").update(code).digest(), Buffer.from(digest, "hex"));
}
