/**
 * Browser cache policy for files under public/ (next.config.ts headers()).
 * Caddy (infra/web/host/Caddyfile) passes these through unchanged.
 *
 * Long "immutable" caching is only safe where a URL never changes content:
 * - /covers/<slug>/*.jpg: a replaced cover gets a new file name (docs/covers.md).
 * - /showcase/<id>/* with ?v=<sha>: `npm run showcase` rewrites poster.jpg and
 *   preview.mp4 in place, so the site links them with the file's sha256 from
 *   lib/showcase.json (lib/showcase.ts). A request without ?v gets the short policy.
 * Everything else that may be overwritten in place (tool logos, icons) is
 * cached for a day and revalidated in the background for a week.
 * Fonts and JS/CSS live under /_next/static, which Next already serves immutable.
 */
export const IMMUTABLE = "public, max-age=31536000, immutable";
export const SHORT = "public, max-age=86400, stale-while-revalidate=604800";

/** /_next/image keeps an optimised image this long (seconds): 31 days. */
export const IMAGE_MIN_CACHE_TTL = 60 * 60 * 24 * 31;

type Header = { key: string; value: string };
type Rule = {
  source: string;
  has?: { type: "query"; key: string }[];
  missing?: { type: "query"; key: string }[];
  headers: Header[];
};

const cache = (value: string): Header[] => [{ key: "Cache-Control", value }];

export function publicCacheRules(): Rule[] {
  return [
    // Images only: cover.json is metadata and is edited in place.
    { source: "/covers/:slug/:file([^/]+\\.(?:jpg|jpeg|png|webp|avif))", headers: cache(IMMUTABLE) },
    { source: "/showcase/:path*", has: [{ type: "query", key: "v" }], headers: cache(IMMUTABLE) },
    { source: "/showcase/:path*", missing: [{ type: "query", key: "v" }], headers: cache(SHORT) },
    { source: "/tools/:slug/:file", headers: cache(SHORT) },
    { source: "/tool-icons/:file", headers: cache(SHORT) },
    { source: "/kubcode-icon.png", headers: cache(SHORT) },
  ];
}

/** URL of a showcase file pinned to its content, so it can be cached forever. */
export function versioned(src: string, sha256: string): string {
  return `${src}?v=${sha256.slice(0, 12)}`;
}
