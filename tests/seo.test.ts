import { test } from "node:test";
import assert from "node:assert/strict";
import type { Article, Content, Tool } from "../lib/content";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  contentRedirects,
  jsonLdText,
  pageMetadata,
  robotsConfig,
  sitemapEntries,
  tagIsIndexable,
  toolJsonLd,
} from "../lib/seo";

const article: Article = {
  kind: "article",
  slug: "free-ai-animation-opencode",
  title: "ทำแอนิเมชัน AI ฟรีแบบของเรา",
  description: "สรุปวิธีทำ",
  tags: ["animation"],
  refs: [{ kind: "tool", slug: "remotion" }],
  updated: "2026-11-03",
  sources: [{ title: "FreshStack", url: "https://www.freshstack.ai/resources/free-ai-animation" }],
  redirects: ["free-ai-animation"],
  go: ["anim"],
  body: "",
};
const tool: Tool = {
  kind: "tool",
  slug: "remotion",
  title: "Remotion — เขียนวิดีโอด้วย React",
  name: "Remotion",
  description: "เขียนวิดีโอด้วย React",
  tags: ["animation"],
  refs: [],
  updated: "2026-11-02",
  sources: [],
  redirects: [],
  go: ["rm"],
  body: "",
  category: "render",
  links: { repo: "https://github.com/remotion-dev/remotion", website: "https://www.remotion.dev" },
  license: "ฟรีสำหรับทีม ≤3 คน",
};
const content: Content = { tags: [], articles: [article], tools: [tool] };

test("renamed slugs and /go codes become permanent 301 redirects to the canonical path", () => {
  assert.deepEqual(contentRedirects(content), [
    { source: "/articles/free-ai-animation", destination: "/articles/free-ai-animation-opencode", statusCode: 301 },
    { source: "/go/anim", destination: "/articles/free-ai-animation-opencode", statusCode: 301 },
    { source: "/go/rm", destination: "/tools/remotion", statusCode: 301 },
  ]);
});

test("page metadata has an absolute canonical, Open Graph and a large Twitter card", () => {
  const meta = pageMetadata(article);
  assert.equal(meta.title, article.title);
  assert.equal(meta.description, article.description);
  assert.equal(meta.alternates?.canonical, "https://kubcode.dev/articles/free-ai-animation-opencode");
  const og = meta.openGraph as Record<string, unknown>;
  assert.equal(og.type, "article");
  assert.equal(og.url, "https://kubcode.dev/articles/free-ai-animation-opencode");
  assert.equal(og.locale, "th_TH");
  assert.equal(og.siteName, "kubcode");
  assert.equal(og.modifiedTime, "2026-11-03");
  assert.equal((meta.twitter as Record<string, unknown>).card, "summary_large_image");
});

test("article JSON-LD is an Article in Thai that credits its sources", () => {
  const ld = articleJsonLd(article);
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "Article");
  assert.equal(ld.headline, article.title);
  assert.equal(ld.inLanguage, "th");
  assert.equal(ld.dateModified, "2026-11-03");
  assert.equal(ld.mainEntityOfPage, "https://kubcode.dev/articles/free-ai-animation-opencode");
  assert.deepEqual(ld.isBasedOn, ["https://www.freshstack.ai/resources/free-ai-animation"]);
});

test("tool JSON-LD is a SoftwareApplication with url and code repository, never a rating", () => {
  const ld = toolJsonLd(tool);
  assert.equal(ld["@type"], "SoftwareApplication");
  assert.equal(ld.name, "Remotion");
  assert.equal(ld.url, "https://www.remotion.dev");
  assert.deepEqual(ld.isBasedOn, {
    "@type": "SoftwareSourceCode",
    codeRepository: "https://github.com/remotion-dev/remotion",
  });
  assert.equal(ld.applicationCategory, "MultimediaApplication");
  assert.equal(JSON.stringify(ld).includes("aggregateRating"), false);
});

test("breadcrumbs list absolute URLs in order", () => {
  const ld = breadcrumbJsonLd([
    { name: "kubcode", path: "/" },
    { name: "เครื่องมือ", path: "/tools" },
    { name: "Remotion", path: "/tools/remotion" },
  ]);
  assert.equal(ld["@type"], "BreadcrumbList");
  assert.deepEqual(
    (ld.itemListElement as Array<Record<string, unknown>>).map((i) => [i.position, i.name, i.item]),
    [
      [1, "kubcode", "https://kubcode.dev/"],
      [2, "เครื่องมือ", "https://kubcode.dev/tools"],
      [3, "Remotion", "https://kubcode.dev/tools/remotion"],
    ],
  );
});

test("JSON-LD script text cannot close the script tag", () => {
  assert.equal(jsonLdText({ name: "</script><script>x" }), '{"name":"\\u003c/script>\\u003cscript>x"}');
});

test("sitemap lists home, indexes, every article, tool and skill, and only tags with ≥3 pages", () => {
  const many: Content = {
    tags: [
      { slug: "animation", th: "แอนิเมชัน", en: "Animation", description: "d" },
      { slug: "rare", th: "น้อย", en: "Rare", description: "d" },
    ],
    articles: [article],
    tools: [tool, { ...tool, slug: "ffmpeg", tags: ["animation", "rare"] }],
  };
  assert.equal(tagIsIndexable(many, "animation"), true);
  assert.equal(tagIsIndexable(many, "rare"), false);
  const entries = sitemapEntries(many);
  const urls = entries.map((e) => e.url);
  for (const u of [
    "https://kubcode.dev/",
    "https://kubcode.dev/articles",
    "https://kubcode.dev/tools",
    "https://kubcode.dev/articles/free-ai-animation-opencode",
    "https://kubcode.dev/tools/remotion",
    "https://kubcode.dev/tools/ffmpeg",
    "https://kubcode.dev/skills/freshstack-what-if",
    "https://kubcode.dev/tags/animation",
  ]) {
    assert.ok(urls.includes(u), u);
  }
  assert.ok(!urls.includes("https://kubcode.dev/tags/rare"));
  assert.ok(!urls.some((u) => u.includes("/go/") || u.includes("/account") || u.includes("/api/")));
  assert.equal(entries.find((e) => e.url.endsWith("/tools/remotion"))?.lastModified, "2026-11-02");
});

test("robots allows the site, keeps API and account routes out, and points at the sitemap", () => {
  const robots = robotsConfig();
  assert.deepEqual(robots.rules, { userAgent: "*", allow: "/", disallow: ["/api/", "/account"] });
  assert.equal(robots.sitemap, "https://kubcode.dev/sitemap.xml");
});
