import type { NextConfig } from "next";
import { loadContent } from "./lib/content";
import { contentRedirects } from "./lib/seo";

const config: NextConfig = {
  devIndicators: false,
  // Self-hosted on Lightsail: CI ships .next/standalone (docs/adr/0001).
  output: "standalone",
  images: { formats: ["image/avif", "image/webp"] },
  // Interaction routes check page slugs against content/ at request time.
  outputFileTracingIncludes: { "/api/interactions/**": ["./content/**"] },
  // Third-party SVG logos are served from our origin: if one is opened
  // directly it must not run or load anything (the schema also refuses
  // active content; this is the second layer).
  async headers() {
    return [
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
