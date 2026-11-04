import type { NextConfig } from "next";
import { loadContent } from "./lib/content";
import { contentRedirects } from "./lib/seo";

const config: NextConfig = {
  devIndicators: false,
  images: { formats: ["image/avif", "image/webp"] },
  // Interaction routes check page slugs against content/ at request time.
  outputFileTracingIncludes: { "/api/interactions/**": ["./content/**"] },
  // Renamed slugs and /go short links: real 301s, derived from content frontmatter.
  async redirects() {
    return contentRedirects(loadContent());
  },
};
export default config;
