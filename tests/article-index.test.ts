import { test } from "node:test";
import assert from "node:assert/strict";
import type { Article, Content } from "../lib/content";
import { articleIndex, categoryHref } from "../lib/article-index";
import { categoryIsIndexable, sitemapEntries } from "../lib/seo";

const cover = { src: "/covers/x/cover.jpg", og: "/covers/x/og.jpg", alt: "a", source: "generated" as const, width: 1600, height: 900 };
const a = (slug: string, category: string, updated: string, extra: Partial<Article> = {}): Article => ({
  kind: "article",
  slug,
  title: slug,
  description: "d",
  tags: [],
  refs: [],
  updated,
  sources: [],
  redirects: [],
  go: [],
  body: "",
  category,
  cover,
  featured: false,
  readingMinutes: 3,
  ...extra,
});
const content = (articles: Article[]): Content => ({
  tags: [],
  tools: [],
  articles,
  categories: [
    { key: "how-to", th: "สอนทำคลิป", description: "d" },
    { key: "tools", th: "เลือกเครื่องมือ", description: "d" },
    { key: "basics", th: "พื้นฐานและสิทธิ์", description: "d" },
  ],
});

test("the index features the newest article and lists the rest newest first", () => {
  const c = content([a("old", "basics", "2026-10-01"), a("new", "how-to", "2026-11-03"), a("mid", "basics", "2026-10-20")]);
  const idx = articleIndex(c);
  assert.equal(idx.featured?.slug, "new");
  assert.deepEqual(idx.rest.map((x) => x.slug), ["mid", "old"]);
});

test("featured: true wins the hero slot over a newer article", () => {
  const c = content([a("new", "how-to", "2026-11-03"), a("pick", "basics", "2026-10-01", { featured: true })]);
  assert.equal(articleIndex(c).featured?.slug, "pick");
});

test("a category view filters, and chips list only non-empty categories with counts and links", () => {
  const c = content([a("x", "basics", "2026-10-01"), a("y", "how-to", "2026-11-03"), a("z", "basics", "2026-10-20")]);
  const idx = articleIndex(c, "basics");
  assert.equal(idx.featured?.slug, "z");
  assert.deepEqual(idx.rest.map((x) => x.slug), ["x"]);
  assert.deepEqual(
    idx.chips.map((ch) => [ch.label, ch.count, ch.href, ch.active]),
    [
      ["ทั้งหมด", 3, "/articles", false],
      ["สอนทำคลิป", 1, "/articles/c/how-to", false],
      ["พื้นฐานและสิทธิ์", 2, "/articles/c/basics", true],
    ],
  );
  assert.equal(categoryHref("tools"), "/articles/c/tools");
});

test("category pages are indexable only with three or more articles, and only those enter the sitemap", () => {
  const c = content([a("1", "basics", "2026-10-01"), a("2", "basics", "2026-10-02"), a("3", "basics", "2026-10-03"), a("4", "how-to", "2026-10-04")]);
  assert.equal(categoryIsIndexable(c, "basics"), true);
  assert.equal(categoryIsIndexable(c, "how-to"), false);
  const urls = sitemapEntries(c).map((e) => e.url);
  assert.ok(urls.includes("https://kubcode.dev/articles/c/basics"));
  assert.ok(!urls.includes("https://kubcode.dev/articles/c/how-to"));
});
