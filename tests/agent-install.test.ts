import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stringify as stringifyYaml } from "yaml";
import { ContentError, LIMITS, loadContent } from "../lib/content";
import { ALL_PACKAGES as PACKAGES } from "../lib/packages";
import { AGENT_INSTALL_ID, AGENT_INSTALL_TITLE, tocWithAgentInstall } from "../lib/agent-install";
import { AgentInstall } from "../components/AgentInstall";
import { fakePng } from "./fixtures/images";

const content = loadContent();
const pages = [...content.articles, ...content.tools];

test("the pages that point at an installable kit carry an agent prompt", () => {
  const withPrompt = (list: Array<{ slug: string; agentInstall?: unknown }>) =>
    list.filter((p) => p.agentInstall).map((p) => p.slug).sort();
  assert.deepEqual(withPrompt(content.articles), [
    "deepseek-harness-subscriptions",
    "elephant-goldfish-model",
    "free-ai-animation-opencode",
    "make-short-blender",
    "style-author-renderer",
  ]);
  // Kit tools: skills, plugins and kits installed from a repo. Agents and
  // apps (Claude Code, Blender, FFmpeg…) have repos but are not kits.
  assert.deepEqual(withPrompt(content.tools), ["deep-sea-docs", "elephant-goldfish-model", "make-short", "tool-reel-system", "what-if-animation"]);
  // install-with-permissions is a concept article with no kit refs.
  assert.equal(content.articles.find((a) => a.slug === "install-with-permissions")!.agentInstall, undefined);
});

test("any article whose refs include a kit tool with a repo or a download package has agentInstall", () => {
  const kitTools = new Set(content.tools.filter((t) => t.links.repo && t.agentInstall).map((t) => t.slug));
  const pkgs = new Set(PACKAGES.map((p) => p.slug));
  for (const a of content.articles) {
    const needs = a.refs.some((r) => (r.kind === "tool" && kitTools.has(r.slug)) || (r.kind === "skill" && pkgs.has(r.slug)));
    if (needs) assert.ok(a.agentInstall, `${a.slug} needs agentInstall`);
  }
});

test("every prompt is safe and complete: asks first, no keys in chat, stops on an unsupported OS, names its source", () => {
  for (const p of pages) {
    const ai = p.agentInstall;
    if (!ai) continue;
    const where = `${p.kind}:${p.slug}`;
    assert.ok([...ai.prompt].length <= LIMITS.agentPrompt, where);
    assert.ok(ai.agents.length > 0, where);
    for (const a of ai.agents) assert.ok(content.tools.some((t) => t.slug === a), `${where}: agent ${a}`);
    assert.match(ai.prompt, /อธิบายว่าจะติดตั้งอะไร ไว้ที่ไหน/, `${where}: explain what and where`);
    assert.match(ai.prompt, /ขออนุญาตฉันก่อนรันทุกคำสั่ง/, `${where}: ask before running`);
    assert.match(ai.prompt, /ห้ามขอ.*(API key|key).*ในแชต/, `${where}: never ask for keys in chat`);
    assert.match(ai.prompt, /ไม่รองรับ.*หยุด|หยุด.*ไม่รองรับ/s, `${where}: stop on unsupported`);
    // Members-only kits have no public repo: their source is the kubcode.dev download page.
    if (ai.source?.startsWith("skill:")) assert.ok(ai.prompt.includes(`https://kubcode.dev/skills/${ai.source.slice(6)}`), `${where}: download page`);
    else assert.match(ai.prompt, /https:\/\/github\.com\/[\w.-]+\/[\w.-]+/, `${where}: upstream repo URL`);
    for (const slug of ai.packages) assert.ok(ai.prompt.includes(`https://kubcode.dev/skills/${slug}`), `${where}: ${slug}`);
  }
});

test("prompts use the upstream install commands we verified (README, 2026-11-11)", () => {
  const get = (kind: "article" | "tool", slug: string) => pages.find((p) => p.kind === kind && p.slug === slug)!.agentInstall!;
  const ms = get("article", "make-short-blender");
  assert.match(ms.prompt, /~\/\.claude\/skills\/make-short/);
  assert.match(ms.prompt, /kubcode\/mac-patch\.sh/);
  assert.match(ms.prompt, /KUBCODE-NOTICE\.md/);
  assert.match(ms.prompt, /Blender 5\.x, Node 22\+, Python 3\.10\+ \(pillow, numpy\) และ ffmpeg/);
  assert.match(ms.prompt, /รอฉันเล่าไอเดีย/);
  assert.deepEqual(ms.packages, ["make-short"]);
  const egm = get("article", "elephant-goldfish-model");
  assert.match(egm.prompt, /claude plugin marketplace add google\/elephant-goldfish-model/);
  assert.match(egm.prompt, /claude plugin install egm@egm/);
  assert.match(egm.prompt, /codex plugin marketplace add google\/elephant-goldfish-model/);
  assert.match(egm.prompt, /codex plugin add egm@egm/);
  assert.match(egm.prompt, /\/egm:egm-brainstorm/);
  const wi = get("article", "free-ai-animation-opencode");
  assert.match(wi.prompt, /\.claude\/skills\/what-if-animation/);
  assert.match(wi.prompt, /opencode\/commands\/what-if\.md/);
  assert.match(wi.prompt, /kubcode\.dev\/skills\/freshstack-what-if/);
  const dsh = get("article", "deepseek-harness-subscriptions");
  // Non-dev path: the signed desktop app from DeepSeek, then its bundled dsh adds the plugin (no git/Node/Python).
  assert.match(dsh.prompt, /https:\/\/download\.deepseek\.com\/desktop\/dsh-latest-macos-arm64\.dmg/);
  assert.match(dsh.prompt, /NAN929V4UM/);
  assert.match(dsh.prompt, /APP\/Contents\/Resources\/runtime\/cli\/bin\/dsh" plugin --profile desktop add dsh-plugin-subscriptions@0\.9\.12/);
  assert.doesNotMatch(dsh.prompt, /git clone|pnpm install|brew install/);
  // The same kit gets the same prompt on its article and its tool page.
  assert.equal(get("tool", "make-short").prompt, ms.prompt);
  assert.equal(get("tool", "elephant-goldfish-model").prompt, egm.prompt);
  assert.equal(get("tool", "what-if-animation").prompt, wi.prompt);
});

test("the section renders a titled block with agent badges, the prompt, a big copy button and the notes", () => {
  const page = pages.find((p) => p.slug === "make-short-blender")!;
  const html = renderToStaticMarkup(createElement(AgentInstall, { install: page.agentInstall!, tools: content.tools }));
  assert.match(html, new RegExp(`<h2 id="${AGENT_INSTALL_ID}" tabindex="-1">${AGENT_INSTALL_TITLE}</h2>`));
  assert.match(html, /<a href="\/tools\/claude-code">.*Claude Code<\/span><\/a>/);
  // Icon-only copy button in the box's top-right corner (owner, 2026-11-12); no header row.
  assert.match(html, /<div class="code-body"><button[^>]*data-slot="button"[^>]*class="[^"]*\bcode-copy\b[^"]*"[^>]*aria-label="คัดลอก prompt"[^>]*><svg[^>]*lucide-copy/);
  assert.doesNotMatch(html, /code-head|>prompt</);
  // The result is a toast (components/ui/toaster.tsx), announced by its live region.
  assert.match(readFileSync("components/CopyButton.tsx", "utf8"), /toast\.success\(/);
  assert.ok(html.includes("ไม่ต้องพิมพ์คำสั่งเอง"));
  assert.match(html, /ขออนุญาตก่อนรันคำสั่ง/);
  assert.match(html, /href="\/skills\/make-short">เข้าสู่ระบบแล้วดาวน์โหลด/);
  const egm = pages.find((p) => p.kind === "article" && p.slug === "elephant-goldfish-model")!;
  const egmHtml = renderToStaticMarkup(createElement(AgentInstall, { install: egm.agentInstall!, tools: content.tools }));
  assert.doesNotMatch(egmHtml, /เข้าสู่ระบบ/, "no sign-in note without a package");
});

test("the TOC lists the section first, only on pages that have it", () => {
  const toc = [{ depth: 2 as const, id: "a", text: "A" }];
  const withIt = pages.find((p) => p.agentInstall)!;
  assert.deepEqual(tocWithAgentInstall(withIt, toc)[0], { depth: 2, id: AGENT_INSTALL_ID, text: AGENT_INSTALL_TITLE });
  assert.equal(tocWithAgentInstall(withIt, toc).length, 2);
  const without = pages.find((p) => !p.agentInstall)!;
  assert.deepEqual(tocWithAgentInstall(without, toc), toc);
});

// --- schema on fixture content ---

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>';

function fixture(articleFm: Record<string, unknown>, toolFm: Record<string, unknown> = {}): string {
  const base = mkdtempSync(path.join(tmpdir(), "kb-agent-"));
  const root = path.join(base, "content");
  const tool = (slug: string, fm: Record<string, unknown>) =>
    "---\n" +
    stringifyYaml({
      slug, title: slug, name: slug, description: "d", tags: [], refs: [], updated: "2026-11-11", sources: [],
      category: "script", license: "MIT", pricing: "free", links: {},
      logo: { fallback: "monogram", reason: "r" }, ...fm,
    }) + "---\n## What\n\nText\n";
  const files: Record<string, string> = {
    "tags.yaml": "video-pipeline:\n  th: a\n  en: b\n  description: c\n",
    "categories.yaml": "how-to:\n  th: a\n  description: d\n",
    "tools/claude-code.mdx": tool("claude-code", {}),
    "tools/kit.mdx": tool("kit", { links: { repo: "https://github.com/x/kit" }, ...toolFm }),
    "articles/good.mdx":
      "---\n" +
      stringifyYaml({
        slug: "good", title: "t", description: "d", tags: [], refs: [], updated: "2026-11-11", sources: [], category: "how-to",
        cover: { src: "/covers/good/cover.png", og: "/covers/good/og.png", alt: "a", source: "generated" }, ...articleFm,
      }) + "---\n## H\n\nText\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  for (const [rel, data] of Object.entries({ "covers/good/cover.png": fakePng(1600, 900), "covers/good/og.png": fakePng(1200, 630), "x.svg": Buffer.from(SVG) })) {
    mkdirSync(path.dirname(path.join(base, "public", rel)), { recursive: true });
    writeFileSync(path.join(base, "public", rel), data);
  }
  return root;
}

function problems(root: string): string[] {
  try {
    loadContent(root);
    return [];
  } catch (e) {
    assert.ok(e instanceof ContentError, String(e));
    return e.problems;
  }
}

const KIT_INSTALL = { agents: ["claude-code"], source: "https://github.com/x/kit", prompt: "ติดตั้งจาก https://github.com/x/kit" };

test("schema: a concept article without kit refs needs no prompt", () => {
  assert.deepEqual(problems(fixture({ refs: ["tool:claude-code"] }, { agentInstall: KIT_INSTALL })), []);
});

test("schema: an article that refs a kit tool or a download package must have agentInstall", () => {
  const kit = problems(fixture({ refs: ["tool:kit"] }, { agentInstall: KIT_INSTALL }));
  assert.ok(kit.some((p) => /good\.mdx: agentInstall is required.*tool:kit/.test(p)), kit.join("\n"));
  const pkg = problems(fixture({ refs: ["skill:make-short"] }));
  assert.ok(pkg.some((p) => /agentInstall is required.*skill:make-short/.test(p)), pkg.join("\n"));
  assert.deepEqual(problems(fixture({ refs: ["tool:kit"], agentInstall: KIT_INSTALL }, { agentInstall: KIT_INSTALL })), []);
});

test("schema: agents must be tool slugs, prompt ≤ 1,200 chars and must carry its source", () => {
  const bad = problems(
    fixture({ agentInstall: { agents: ["claude-code", "cursor"], source: "https://github.com/x/kit", prompt: "ก".repeat(1201) } }),
  );
  assert.ok(bad.some((p) => /agentInstall\.agents has unknown tool "cursor"/.test(p)), bad.join("\n"));
  assert.ok(bad.some((p) => /agentInstall\.prompt must be at most 1200/.test(p)), bad.join("\n"));
  assert.ok(bad.some((p) => /must contain the source URL/.test(p)), bad.join("\n"));
  const empty = problems(fixture({ agentInstall: { agents: [], prompt: "" } }));
  assert.ok(empty.some((p) => /agents must be a non-empty list/.test(p)) && empty.some((p) => /prompt is required/.test(p)), empty.join("\n"));
  const pkg = problems(fixture({ agentInstall: { agents: ["claude-code"], source: "skill:make-short", prompt: "ดาวน์โหลดเอง" } }));
  assert.ok(pkg.some((p) => /must give the download page https:\/\/kubcode\.dev\/skills\/make-short/.test(p)), pkg.join("\n"));
  const notPkg = problems(fixture({ agentInstall: { agents: ["claude-code"], source: "skill:growkaz-stickman", prompt: "x" } }));
  assert.ok(notPkg.some((p) => /not a download package/.test(p)), notPkg.join("\n"));
  const ok = loadContent(fixture({ agentInstall: { agents: ["claude-code"], source: "skill:make-short", prompt: "โหลดจาก https://kubcode.dev/skills/make-short" } }));
  assert.deepEqual(ok.articles[0].agentInstall?.packages, ["make-short"]);
});
