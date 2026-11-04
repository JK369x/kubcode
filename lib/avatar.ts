// Provider profile pictures shown in the header. Only https URLs on the
// providers' own image hosts are accepted; anything else falls back to an
// initial, so a crafted claim can't point the page at another server.

const MAX_URL_LENGTH = 1024;
const LINE_HOSTS = new Set(["profile.line-scdn.net", "obs.line-scdn.net"]);

export function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const google = host.endsWith(".googleusercontent.com");
  if (!google && !LINE_HOSTS.has(host)) return null;
  return value;
}

/** First user-perceived character of the name, upper-cased; "ส" (สมาชิก) if none. */
export function avatarInitial(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "ส";
  const first = new Intl.Segmenter("th", { granularity: "grapheme" }).segment(trimmed)[Symbol.iterator]().next().value;
  return (first?.segment ?? trimmed[0]).toLocaleUpperCase("en");
}
