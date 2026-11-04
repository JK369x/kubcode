import { test } from "node:test";
import assert from "node:assert/strict";
import type { Article, Content, Tool, ToolCategory } from "../lib/content";
import { stageHref, toolIndex, toolUsage } from "../lib/tool-index";
import { sitemapEntries, stageIsIndexable } from "../lib/seo";

const t = (slug: string, category: ToolCategory, name = slug, refs: Tool["refs"] = []): Tool => ({
  kind: "tool",
  slug,
  title: name,
  name,
  description: "d",
  tags: [],
  refs,
  updated: "2026-11-03",
  sources: [],
  redirects: [],
  go: [],
  body: "",
  category,
  links: {},
  license: "MIT",
  pricing: "free",
  logo: { kind: "monogram", text: "X", reason: "test" },
});
const article = (slug: string, refs: Article["refs"]): Article => ({
  kind: "article",
  slug,
  title: slug,
  description: "d",
  tags: [],
  refs,
  updated: "2026-11-03",
  sources: [],
  redirects: [],
  go: [],
  body: "",
  category: "how-to",
  cover: { src: "/covers/x/cover.jpg", og: "/covers/x/og.jpg", alt: "a", source: "generated", width: 1600, height: 900 },
  featured: false,
  readingMinutes: 3,
});
const content = (tools: Tool[], articles: Article[] = []): Content => ({ tags: [], categories: [], articles, tools });

test("tools are listed in production order, then by name, with chips for non-empty stages only", () => {
  const c = content([t("ffmpeg", "package", "FFmpeg"), t("remotion", "render", "Remotion"), t("opencode", "script", "OpenCode"), t("glm", "script", "GLM")]);
  const idx = toolIndex(c);
  assert.deepEqual(idx.tools.map((x) => x.slug), ["glm", "opencode", "remotion", "ffmpeg"]);
  assert.deepEqual(
    idx.chips.map((ch) => [ch.label, ch.step, ch.count, ch.href, ch.active]),
    [
      ["ทั้งหมด", null, 4, "/tools", true],
      // Steps keep their place in the eight-stage pipeline, so gaps show.
      ["เขียนบทและโค้ด", 1, 2, "/tools/c/script", false],
      ["เรนเดอร์วิดีโอ", 5, 1, "/tools/c/render", false],
      ["รวมไฟล์และแปลงไฟล์", 7, 1, "/tools/c/package", false],
    ],
  );
});

test("a stage view lists only that stage and marks its chip", () => {
  const c = content([t("remotion", "render"), t("opencode", "script"), t("glm", "script")]);
  const idx = toolIndex(c, "script");
  assert.deepEqual(idx.tools.map((x) => x.slug), ["glm", "opencode"]);
  assert.deepEqual(idx.chips.filter((ch) => ch.active).map((ch) => ch.href), ["/tools/c/script"]);
  assert.equal(stageHref("voice"), "/tools/c/voice");
});

test("usage counts the articles and skills linked either way", () => {
  const c = content(
    [t("remotion", "render", "Remotion", [{ kind: "skill", slug: "freshstack-what-if" }]), t("ffmpeg", "package", "FFmpeg", [{ kind: "tool", slug: "remotion" }])],
    [article("a1", [{ kind: "tool", slug: "remotion" }]), article("a2", [{ kind: "tool", slug: "remotion" }]), article("a3", [])],
  );
  assert.deepEqual(toolUsage(c, c.tools[0]), { articles: 2, skills: 1 });
  assert.deepEqual(toolUsage(c, c.tools[1]), { articles: 0, skills: 0 });
});

test("stage pages are indexable only with three or more tools, and only those enter the sitemap", () => {
  const c = content([t("a", "script"), t("b", "script"), t("c", "script"), t("d", "render")]);
  assert.equal(stageIsIndexable(c, "script"), true);
  assert.equal(stageIsIndexable(c, "render"), false);
  const urls = sitemapEntries(c).map((e) => e.url);
  assert.ok(urls.includes("https://kubcode.dev/tools/c/script"));
  assert.ok(!urls.includes("https://kubcode.dev/tools/c/render"));
});
