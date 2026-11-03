import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content";
import { sitemapEntries } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(getContent());
}
