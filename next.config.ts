import type { NextConfig } from "next";
import { loadContent } from "./lib/content";
import { contentRedirects } from "./lib/seo";

const config: NextConfig = {
  devIndicators: false,
  // Renamed slugs and /go short links: real 301s, derived from content frontmatter.
  async redirects() {
    return contentRedirects(loadContent());
  },
};
export default config;
