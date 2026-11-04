import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { ContentError, loadContent } from "../lib/content";
import { fakePng } from "./fixtures/images";

test("repo content loads the two migrated articles from MDX", () => {
  const content = loadContent();
  const slugs = content.articles.map((a) => a.slug);
  for (const slug of ["install-with-permissions", "style-author-renderer"]) assert.ok(slugs.includes(slug), slug);
  const article = content.articles.find((a) => a.slug === "style-author-renderer")!;
  assert.equal(article.title, "สไตล์ ผู้เขียน และ renderer ไม่ใช่สิ่งเดียวกัน");
  assert.match(article.body, /## หกชั้นที่ต้องอ่านให้แยกกัน/);
});

const CATEGORIES =
  "how-to:\n  th: สอนทำคลิป\n  description: d\nbasics:\n  th: พื้นฐานและสิทธิ์\n  description: d\n";

/** Content files under <tmp>/content and images under <tmp>/public, like the repo. */
function tree(files: Record<string, string>, images: Record<string, Buffer> = {}): string {
  const base = mkdtempSync(path.join(tmpdir(), "kb-content-"));
  const root = path.join(base, "content");
  const all: Record<string, string> = {
    "tags.yaml": "video-pipeline:\n  th: ไปป์ไลน์วิดีโอ\n  en: Video pipeline\n  description: How clips are made\n",
    "categories.yaml": CATEGORIES,
    "tools/.keep": "",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  const pics: Record<string, Buffer> = {
    "covers/good/cover.png": fakePng(1600, 900),
    "covers/good/og.png": fakePng(1200, 630),
    ...images,
  };
  for (const [rel, data] of Object.entries(pics)) {
    mkdirSync(path.dirname(path.join(base, "public", rel)), { recursive: true });
    writeFileSync(path.join(base, "public", rel), data);
  }
  return root;
}

function article(fm: Record<string, unknown>, body = "## Heading\n\nText\n"): string {
  const base = {
    slug: "good-article",
    title: "บทความ",
    description: "คำอธิบายสั้น",
    tags: ["video-pipeline"],
    refs: [],
    updated: "2026-11-03",
    sources: [],
    category: "how-to",
    cover: { src: "/covers/good/cover.png", og: "/covers/good/og.png", alt: "ภาพประกอบ", source: "generated" },
    ...fm,
  };
  return "---\n" + stringifyYaml(base) + "---\n" + body;
}

function problemsOf(root: string): string[] {
  try {
    loadContent(root);
  } catch (e) {
    assert.ok(e instanceof ContentError, String(e));
    return e.problems;
  }
  assert.fail("expected loadContent to reject the content");
}

test("a valid fixture article loads", () => {
  const root = tree({ "articles/good-article.mdx": article({}) });
  assert.equal(loadContent(root).articles[0].slug, "good-article");
});

test("missing and over-long SEO fields are reported per file and field", () => {
  const root = tree({
    "articles/good-article.mdx": article({
      title: "ก".repeat(61),
      description: undefined,
    }),
  });
  const problems = problemsOf(root);
  assert.ok(problems.some((p) => /good-article\.mdx.*title.*60/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /good-article\.mdx.*description/.test(p)), problems.join("\n"));
});

test("slugs must be ASCII lower-kebab, at most 5 words, and match the file name", () => {
  const cases: Array<[string, string]> = [
    ["Bad_Slug", "articles/Bad_Slug.mdx"],
    ["ทำแอนิเมชัน", "articles/thai.mdx"],
    ["one-two-three-four-five-six", "articles/one-two-three-four-five-six.mdx"],
    ["right-slug", "articles/wrong-file.mdx"],
  ];
  for (const [slug, file] of cases) {
    const problems = problemsOf(tree({ [file]: article({ slug }) }));
    assert.ok(problems.some((p) => p.includes(file) && /slug/.test(p)), `${slug}: ${problems.join("\n")}`);
  }
});

test("article tags must be defined in tags.yaml and tag entries need th/en labels", () => {
  const unknown = problemsOf(tree({ "articles/good-article.mdx": article({ tags: ["no-such-tag"] }) }));
  assert.ok(unknown.some((p) => /tags.*no-such-tag/.test(p)), unknown.join("\n"));

  const badTags = problemsOf(
    tree({
      "tags.yaml": "Video_Pipeline:\n  th: x\n  en: y\n  description: z\nvideo-pipeline:\n  th: วิดีโอ\n",
      "articles/good-article.mdx": article({}),
    }),
  );
  assert.ok(badTags.some((p) => /tags\.yaml.*Video_Pipeline/.test(p)), badTags.join("\n"));
  assert.ok(badTags.some((p) => /tags\.yaml.*video-pipeline.*en/.test(p)), badTags.join("\n"));
});

test("loaded tags carry their labels", () => {
  const root = tree({ "articles/good-article.mdx": article({}) });
  const [tag] = loadContent(root).tags;
  assert.deepEqual(tag, { slug: "video-pipeline", th: "ไปป์ไลน์วิดีโอ", en: "Video pipeline", description: "How clips are made" });
});

test("refs resolve to existing articles, tools or catalog skills; unknown refs fail", () => {
  const ok = tree({
    "articles/good-article.mdx": article({ refs: ["skill:thai-jk-voice", "article:other-article"] }),
    "articles/other-article.mdx": article({ slug: "other-article" }),
  });
  const good = loadContent(ok).articles.find((a) => a.slug === "good-article")!;
  assert.deepEqual(good.refs, [
    { kind: "skill", slug: "thai-jk-voice" },
    { kind: "article", slug: "other-article" },
  ]);

  const bad = problemsOf(
    tree({ "articles/good-article.mdx": article({ refs: ["tool:nope", "skill:nope", "clip:abc", "garbage"] }) }),
  );
  for (const ref of ["tool:nope", "skill:nope", "clip:abc", "garbage"]) {
    assert.ok(bad.some((p) => p.includes("refs") && p.includes(ref)), `${ref}: ${bad.join("\n")}`);
  }
});

test("updated must be a real ISO date and source links must be https", () => {
  const problems = problemsOf(
    tree({
      "articles/good-article.mdx": article({
        updated: "2026-13-40",
        sources: [{ title: "ok", url: "https://example.com" }, { title: "bad", url: "http://example.com" }, { url: "https://x.dev" }],
      }),
    }),
  );
  assert.ok(problems.some((p) => /updated/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /sources.*http:\/\/example\.com/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /sources.*title/.test(p)), problems.join("\n"));

  const ok = loadContent(
    tree({ "articles/good-article.mdx": article({ sources: [{ title: "FreshStack", url: "https://www.freshstack.ai/" }] }) }),
  ).articles[0];
  assert.equal(ok.updated, "2026-11-03");
  assert.deepEqual(ok.sources, [{ title: "FreshStack", url: "https://www.freshstack.ai/" }]);
});

test("redirects keep old slugs but may not collide with live slugs or each other", () => {
  const ok = loadContent(
    tree({ "articles/good-article.mdx": article({ redirects: ["old-name"] }) }),
  ).articles[0];
  assert.deepEqual(ok.redirects, ["old-name"]);

  const problems = problemsOf(
    tree({
      "articles/good-article.mdx": article({ redirects: ["other-article", "Bad Slug", "shared-old"] }),
      "articles/other-article.mdx": article({ slug: "other-article", redirects: ["shared-old"] }),
    }),
  );
  assert.ok(problems.some((p) => /redirects.*other-article/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /redirects.*Bad Slug/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /redirects.*shared-old/.test(p)), problems.join("\n"));
});

function tool(fm: Record<string, unknown>, body = "## What it is\n\nText\n"): string {
  const base = {
    slug: "good-tool",
    title: "Good Tool",
    description: "เครื่องมือดี",
    tags: ["video-pipeline"],
    name: "Good Tool",
    category: "render",
    refs: [],
    links: { website: "https://example.com" },
    license: "MIT",
    updated: "2026-11-03",
    sources: [],
    ...fm,
  };
  return "---\n" + stringifyYaml(base) + "---\n" + body;
}

test("tools load with category, https links and a license note", () => {
  const root = tree({
    "tools/good-tool.mdx": tool({ links: { repo: "https://github.com/x/y", docs: "https://docs.x.dev" } }),
    "articles/good-article.mdx": article({ refs: ["tool:good-tool"] }),
  });
  const [t] = loadContent(root).tools;
  assert.equal(t.slug, "good-tool");
  assert.equal(t.category, "render");
  assert.deepEqual(t.links, { repo: "https://github.com/x/y", docs: "https://docs.x.dev" });
  assert.equal(t.license, "MIT");
});

test("tools reject unknown categories, non-https or unknown link kinds, and a missing license", () => {
  const problems = problemsOf(
    tree({
      "tools/good-tool.mdx": tool({
        category: "editing",
        links: { website: "http://x.dev", blog: "https://b.dev" },
        license: undefined,
        name: undefined,
      }),
    }),
  );
  for (const re of [/tools\/good-tool\.mdx.*category/, /links.*website/, /links.*blog/, /license/, /: name is required/]) {
    assert.ok(problems.some((p) => re.test(p)), `${re}: ${problems.join("\n")}`);
  }
});


test("go short codes are short lower-case codes, unique across all pages", () => {
  const ok = loadContent(tree({ "articles/good-article.mdx": article({ go: ["anim1"] }) })).articles[0];
  assert.deepEqual(ok.go, ["anim1"]);

  const problems = problemsOf(
    tree({
      "articles/good-article.mdx": article({ go: ["dup", "Not Ok"] }),
      "tools/good-tool.mdx": tool({ go: ["dup"] }),
    }),
  );
  assert.ok(problems.some((p) => /go.*Not Ok/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /go.*dup/.test(p)), problems.join("\n"));
});

test("articles need a category defined once in categories.yaml", () => {
  const missing = problemsOf(tree({ "articles/good-article.mdx": article({ category: undefined }) }));
  assert.ok(missing.some((p) => /good-article\.mdx: category/.test(p)), missing.join("\n"));
  const unknown = problemsOf(tree({ "articles/good-article.mdx": article({ category: "news" }) }));
  assert.ok(unknown.some((p) => /category.*news/.test(p)), unknown.join("\n"));
  const ok = loadContent(tree({ "articles/good-article.mdx": article({}) }));
  assert.equal(ok.articles[0].category, "how-to");
  assert.deepEqual(ok.categories.map((c) => c.key), ["how-to", "basics"]);
  assert.equal(ok.categories[0].th, "สอนทำคลิป");
});

test("articles need a cover under /covers with alt text, a known source and real size", () => {
  const cases: Array<[Record<string, unknown> | undefined, RegExp, Record<string, Buffer>?]> = [
    [undefined, /cover is required/],
    [{ src: "/covers/good/cover.png", og: "/covers/good/og.png", source: "generated" }, /cover\.alt/],
    [{ src: "/covers/good/cover.png", alt: "x", source: "generated" }, /cover\.og is required/],
    [{ src: "/covers/good/cover.png", og: "/covers/good/cover.png", alt: "x", source: "generated" }, /cover\.og must be exactly 1200×630/],
    [{ src: "/covers/good/cover.png", alt: "x", source: "stock" }, /cover\.source/],
    [{ src: "https://example.com/a.png", alt: "x", source: "generated" }, /cover\.src/],
    [{ src: "/covers/../secret.png", alt: "x", source: "generated" }, /cover\.src/],
    [{ src: "/covers/none/cover.png", alt: "x", source: "generated" }, /cover\.src.*not found/],
    [{ src: "/covers/small/cover.png", alt: "x", source: "generated" }, /at least 1200/, { "covers/small/cover.png": fakePng(1000, 563) }],
    [{ src: "/covers/square/cover.png", alt: "x", source: "generated" }, /16:9 or 1200×630/, { "covers/square/cover.png": fakePng(1600, 1200) }],
  ];
  for (const [cover, re, images] of cases) {
    const problems = problemsOf(tree({ "articles/good-article.mdx": article({ cover }) }, images));
    assert.ok(problems.some((p) => re.test(p)), `${JSON.stringify(cover)}: ${problems.join("\n")}`);
  }
  for (const [w, h] of [[1600, 900], [1200, 630], [1920, 1080]]) {
    const root = tree(
      { "articles/good-article.mdx": article({ cover: { src: "/covers/x/cover.png", og: "/covers/good/og.png", alt: "ภาพ", source: "own-clip" } }) },
      { "covers/x/cover.png": fakePng(w, h) },
    );
    const a = loadContent(root).articles[0];
    assert.deepEqual(a.cover, { src: "/covers/x/cover.png", og: "/covers/good/og.png", alt: "ภาพ", source: "own-clip", width: w, height: h });
  }
});

test("featured flag, video link and reading time", () => {
  const body = "## หัวข้อ\n\n" + "ก".repeat(2400) + "\n\n```bash\n" + "x".repeat(5000) + "\n```\n";
  const a = loadContent(
    tree({ "articles/good-article.mdx": article({ featured: true, video: "https://www.youtube.com/watch?v=abc" }, body) }),
  ).articles[0];
  assert.equal(a.featured, true);
  assert.equal(a.video, "https://www.youtube.com/watch?v=abc");
  assert.equal(a.readingMinutes, 3, "about 800 Thai characters a minute; code blocks don't count");
  const problems = problemsOf(tree({ "articles/good-article.mdx": article({ featured: "yes", video: "http://x.dev" }) }));
  assert.ok(problems.some((p) => /featured/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /video/.test(p)), problems.join("\n"));
});
