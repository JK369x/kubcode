import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { loadContent } from "../lib/content";
import { fakePng } from "./fixtures/images";
import { hrefOf, pagesForTag, related } from "../lib/content-links";

function page(kind: "article" | "tool", slug: string, fm: Record<string, unknown> = {}): [string, string] {
  const base: Record<string, unknown> = {
    slug,
    title: `T ${slug}`,
    description: "d",
    tags: [],
    refs: [],
    updated: "2026-11-03",
    ...(kind === "tool"
      ? { name: slug, category: "render", license: "MIT", pricing: "free", logo: { fallback: "monogram", reason: "fixture" }, links: {} }
      : { category: "basics", cover: { src: "/covers/t/cover.png", og: "/covers/t/og.png", alt: "a", source: "generated" } }),
    ...fm,
  };
  return [`${kind}s/${slug}.mdx`, "---\n" + stringifyYaml(base) + "---\nBody\n"];
}

function load(...files: Array<[string, string]>) {
  const base = mkdtempSync(path.join(tmpdir(), "kb-links-"));
  const root = path.join(base, "content");
  mkdirSync(path.join(base, "public", "covers", "t"), { recursive: true });
  writeFileSync(path.join(base, "public", "covers", "t", "cover.png"), fakePng(1600, 900));
  writeFileSync(path.join(base, "public", "covers", "t", "og.png"), fakePng(1200, 630));
  const all = [
    ["categories.yaml", "basics:\n  th: พื้นฐาน\n  description: d\n"],
    ["tags.yaml", "animation:\n  th: แอนิเมชัน\n  en: Animation\n  description: d\nvoice:\n  th: เสียง\n  en: Voice\n  description: d\n"],
    ...files,
  ];
  for (const [rel, text] of all) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return loadContent(root);
}

const slugs = (items: Array<{ kind: string; slug: string }>) => items.map((i) => `${i.kind}:${i.slug}`).sort();

test("related pages are computed from refs in both directions without duplicates", () => {
  const content = load(
    page("article", "how-we-animate", { refs: ["tool:remotion", "skill:freshstack-what-if"] }),
    page("tool", "remotion", { refs: ["skill:freshstack-what-if", "article:how-we-animate"] }),
  );
  assert.deepEqual(slugs(related(content, { kind: "tool", slug: "remotion" })), [
    "article:how-we-animate",
    "skill:freshstack-what-if",
  ]);
  assert.deepEqual(slugs(related(content, { kind: "skill", slug: "freshstack-what-if" })), [
    "article:how-we-animate",
    "tool:remotion",
  ]);
  assert.deepEqual(slugs(related(content, { kind: "article", slug: "how-we-animate" })), [
    "skill:freshstack-what-if",
    "tool:remotion",
  ]);
});

test("related items carry a title and canonical href", () => {
  const content = load(page("tool", "remotion", { refs: ["skill:freshstack-what-if"] }));
  const [skill] = related(content, { kind: "tool", slug: "remotion" });
  assert.equal(skill.href, "/skills/freshstack-what-if");
  assert.equal(skill.title, "What If Lab");
  assert.equal(hrefOf({ kind: "tool", slug: "remotion" }), "/tools/remotion");
  assert.equal(hrefOf({ kind: "article", slug: "x" }), "/articles/x");
});

test("tag pages list every article and tool with that tag", () => {
  const content = load(
    page("article", "a-one", { tags: ["animation"] }),
    page("tool", "t-one", { tags: ["animation", "voice"] }),
    page("tool", "t-two", { tags: ["voice"] }),
  );
  assert.deepEqual(slugs(pagesForTag(content, "animation")), ["article:a-one", "tool:t-one"]);
  assert.deepEqual(slugs(pagesForTag(content, "voice")), ["tool:t-one", "tool:t-two"]);
});
