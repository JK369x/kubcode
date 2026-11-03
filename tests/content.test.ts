import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { ContentError, loadContent } from "../lib/content";

test("repo content loads the two migrated articles from MDX", () => {
  const content = loadContent();
  const slugs = content.articles.map((a) => a.slug).sort();
  assert.deepEqual(slugs, ["install-with-permissions", "style-author-renderer"]);
  const article = content.articles.find((a) => a.slug === "style-author-renderer")!;
  assert.equal(article.title, "สไตล์ ผู้เขียน และ renderer ไม่ใช่สิ่งเดียวกัน");
  assert.match(article.body, /## หกชั้นที่ต้องอ่านให้แยกกัน/);
});

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "kb-content-"));
  const all: Record<string, string> = {
    "tags.yaml": "video-pipeline:\n  th: ไปป์ไลน์วิดีโอ\n  en: Video pipeline\n  description: How clips are made\n",
    "tools/.keep": "",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
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
      }),
    }),
  );
  for (const re of [/tools\/good-tool\.mdx.*category/, /links.*website/, /links.*blog/, /license/]) {
    assert.ok(problems.some((p) => re.test(p)), `${re}: ${problems.join("\n")}`);
  }
});

