import type { NextConfig } from "next";
import { loadContent } from "./lib/content";
import { contentRedirects } from "./lib/seo";
import { IMAGE_MIN_CACHE_TTL, publicCacheRules } from "./lib/cache-headers";

const config: NextConfig = {
  devIndicators: false,
  // Self-hosted on Lightsail: CI ships .next/standalone (docs/adr/0001).
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    // Source images are versioned by name or ?v (lib/cache-headers.ts).
    minimumCacheTTL: IMAGE_MIN_CACHE_TTL,
    // Showcase posters carry ?v=<sha> (lib/showcase.ts) so a regenerated
    // poster is a new optimiser cache entry; everything else has no query.
    localPatterns: [{ pathname: "/**", search: "" }, { pathname: "/showcase/**" }],
  },
  // Interaction routes check page slugs against content/ at request time.
  outputFileTracingIncludes: { "/api/interactions/**": ["./content/**"] },
  // Third-party SVG logos are served from our origin: if one is opened
  // directly it must not run or load anything (the schema also refuses
  // active content; this is the second layer).
  async headers() {
    return [
      ...publicCacheRules(),
      {
        source: "/tools/:slug/logo.svg",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  // Renamed slugs and /go short links: real 301s, derived from content frontmatter.
  async redirects() {
    return contentRedirects(loadContent());
  },
};
export default config;
