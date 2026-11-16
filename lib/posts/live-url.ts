// The link behind "ดูโพสต์". The provider's URL wins when it is a plain https
// URL; otherwise one is built from what the platform itself uses:
//   TikTok   https://www.tiktok.com/@<handle>/video/<video id>   (needs the handle)
//   YouTube  https://youtu.be/<video id>
// Instagram media ids are not shortcodes, so only the provider's permalink works there.
const SAFE_URL = /^https:\/\/[^\s"'<>\\]{1,490}$/;
const TIKTOK_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const DIGITS = /^[0-9]{1,32}$/;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function liveUrl(d: { platform: string; url: string | null; platformPostId: string | null; handle: string | null }): string | null {
  if (d.url && SAFE_URL.test(d.url)) return d.url;
  const id = d.platformPostId;
  if (!id) return null;
  if (d.platform === "tiktok") {
    const h = d.handle?.replace(/^@/, "") ?? "";
    return TIKTOK_HANDLE.test(h) && DIGITS.test(id) ? `https://www.tiktok.com/@${h}/video/${id}` : null;
  }
  if (d.platform === "youtube") return YT_ID.test(id) ? `https://youtu.be/${id}` : null;
  return null;
}
