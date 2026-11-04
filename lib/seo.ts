import type { Metadata } from "next";
import { CANONICAL_ORIGIN } from "./auth-policy";
import { TOOL_CATEGORIES, type Article, type Content, type Page, type Tool, type ToolCategory } from "./content";
import { rawSkills } from "./catalog";
import { hrefOf } from "./content-links";

export type ContentRedirect = { source: string; destination: string; statusCode: 301 };

function pages(content: Content): Page[] {
  return [...content.articles, ...content.tools];
}

/** Old slugs and /go short codes → canonical page, as next.config redirects. */
export function contentRedirects(content: Content): ContentRedirect[] {
  const out: ContentRedirect[] = [];
  for (const page of pages(content)) {
    const destination = hrefOf(page);
    for (const old of page.redirects) {
      out.push({ source: hrefOf({ kind: page.kind, slug: old }), destination, statusCode: 301 });
    }
  }
  for (const page of pages(content)) {
    for (const code of page.go) {
      out.push({ source: `/go/${code}`, destination: hrefOf(page), statusCode: 301 });
    }
  }
  return out;
}

export const SITE_NAME = "kubcode";

/** Absolute URL on the canonical production origin (previews point here too). */
export function absoluteUrl(path: string): string {
  return new URL(path, CANONICAL_ORIGIN).toString();
}

type MetaInput = {
  title: string;
  description: string;
  path: string;
  type?: "article" | "website";
  updated?: string;
  noindex?: boolean;
};

/** Canonical + Open Graph + Twitter card for one page. */
export function metadataFor(input: MetaInput): Metadata {
  const url = absoluteUrl(input.path);
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      type: input.type ?? "website",
      url,
      title: input.title,
      description: input.description,
      siteName: SITE_NAME,
      locale: "th_TH",
      ...(input.type === "article" && input.updated ? { modifiedTime: input.updated } : {}),
    },
    twitter: { card: "summary_large_image", title: input.title, description: input.description },
    ...(input.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

export function pageMetadata(page: Page): Metadata {
  return metadataFor({
    title: page.title,
    description: page.description,
    path: hrefOf(page),
    type: "article",
    updated: page.updated,
  });
}

type JsonLd = Record<string, unknown>;

const publisher = { "@type": "Organization", name: SITE_NAME, url: CANONICAL_ORIGIN };

export function articleJsonLd(article: Article): JsonLd {
  const url = absoluteUrl(hrefOf(article));
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    inLanguage: "th",
    dateModified: article.updated,
    mainEntityOfPage: url,
    url,
    author: publisher,
    publisher,
    isBasedOn: article.sources.flatMap((s) => (s.url ? [s.url] : [])),
  };
}

export function toolJsonLd(tool: Tool): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    description: tool.description,
    url: tool.links.website ?? tool.links.repo ?? absoluteUrl(hrefOf(tool)),
    applicationCategory: tool.category === "script" ? "DeveloperApplication" : "MultimediaApplication",
    // SoftwareApplication has no codeRepository; it belongs on the source code.
    ...(tool.links.repo
      ? { isBasedOn: { "@type": "SoftwareSourceCode", codeRepository: tool.links.repo } }
      : {}),
    subjectOf: { "@type": "WebPage", url: absoluteUrl(hrefOf(tool)), inLanguage: "th" },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** JSON for a ld+json script; "<" is escaped so content can't end the tag. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** PRD: a tag page is indexed only once it has at least this many pages. */
export const TAG_INDEX_MIN = 3;

export function tagIsIndexable(content: Content, tag: string): boolean {
  return pages(content).filter((p) => p.tags.includes(tag)).length >= TAG_INDEX_MIN;
}

/** Category pages are indexed only once they hold at least this many articles. */
export function categoryIsIndexable(content: Content, key: string): boolean {
  return content.articles.filter((a) => a.category === key).length >= TAG_INDEX_MIN;
}

/** Stage pages (/tools/c/<stage>) follow the same three-page rule. */
export function stageIsIndexable(content: Content, stage: ToolCategory): boolean {
  return content.tools.filter((t) => t.category === stage).length >= TAG_INDEX_MIN;
}

export type SitemapEntry = { url: string; lastModified?: string };

export function sitemapEntries(content: Content): SitemapEntry[] {
  const latest = pages(content)
    .map((p) => p.updated)
    .sort()
    .at(-1);
  return [
    { url: absoluteUrl("/"), lastModified: latest },
    { url: absoluteUrl("/articles"), lastModified: latest },
    { url: absoluteUrl("/tools"), lastModified: latest },
    ...pages(content).map((p) => ({ url: absoluteUrl(hrefOf(p)), lastModified: p.updated })),
    ...rawSkills.map((s) => ({ url: absoluteUrl(hrefOf({ kind: "skill", slug: s.slug })) })),
    ...content.categories
      .filter((c) => categoryIsIndexable(content, c.key))
      .map((c) => ({ url: absoluteUrl(`/articles/c/${c.key}`) })),
    ...TOOL_CATEGORIES.filter((c) => stageIsIndexable(content, c)).map((c) => ({ url: absoluteUrl(`/tools/c/${c}`) })),
    ...content.tags
      .filter((t) => tagIsIndexable(content, t.slug))
      .map((t) => ({ url: absoluteUrl(tagHref(t.slug)) })),
  ];
}

export function tagHref(tag: string): string {
  return `/tags/${tag}`;
}

export function robotsConfig() {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/account"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
