import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup as renderReactMarkup } from "react-dom/server";
// React 19 prepends image resource hints; assertions below concern component DOM.
const renderToStaticMarkup = (node: Parameters<typeof renderReactMarkup>[0]) =>
  renderReactMarkup(node).replace(/<link\b(?=[^>]*rel="preload")(?=[^>]*as="image")[^>]*\/>/g, "");
import { skills, type Skill } from "../lib/catalog";
import { SkillIcon, ToolChips, getSkillTools } from "../components/ToolChips";
import {
  ToolMark,
  resolveToolMark,
  toolMarkSource,
} from "../components/ToolMark";

const bySlug = (slug: string): Skill => {
  const skill = skills.find((s) => s.slug === slug);
  assert.ok(skill, `missing catalog skill ${slug}`);
  return skill;
};

const render = (skill: Skill, authors = false) =>
  renderToStaticMarkup(createElement(ToolChips, { skill, authors }));

const mark = (name: string, size?: number, className?: string) =>
  renderToStaticMarkup(createElement(ToolMark, { name, size, className }));

const chipNames = (html: string) =>
  [...html.matchAll(/<span class="tool-name">([^<]*)<\/span>/g)].map(
    (m) => m[1],
  );

/* Outer mark element only — not the inner .tool-mark-glyph of mask marks. */
const markTags = (html: string) =>
  html.match(/<(?:img|svg|span) class="tool-mark(?: [^"]*)?"[^>]*>/g) || [];

type Provenance = { file: string; status: string; sha256?: string }[];
const provenance: Provenance = JSON.parse(
  readFileSync("public/tool-icons/PROVENANCE.json", "utf8"),
);

const AGENT_NAMES = ["Claude Code", "Codex CLI", "OpenCode"];

/* name → [asset file, render, tone] for every fetched upstream logo in use */
const BRANDED: Record<string, [string, "image" | "mask", "color" | "mono"]> = {
  "Claude Code": ["claudecode.svg", "image", "color"],
  "Codex CLI": ["codex.svg", "image", "color"],
  OpenCode: ["opencode.svg", "image", "mono"],
  React: ["react.svg", "image", "color"],
  "Three.js": ["threejs.svg", "image", "mono"],
  FFmpeg: ["ffmpeg.svg", "mask", "color"],
  GSAP: ["gsap.svg", "mask", "color"],
};

/* names with no fetched official logo: functional symbols only */
const SYMBOLIC = [
  "Canvas 2D",
  "Editable SVG",
  "VoxCPM2 / MLX",
  "Captions",
  "Renderer adapter",
  "Remotion",
  "HyperFrames",
  "JK local study",
  "Some Future Agent",
];

test("author chips come only from real example authors", () => {
  assert.deepEqual(chipNames(render(bySlug("growkaz-stickman"), true)), [
    "Claude Code",
    "Codex CLI",
  ]);
  assert.deepEqual(chipNames(render(bySlug("thai-survival"), true)), [
    "Claude Code",
    "Codex CLI",
  ]);
  assert.deepEqual(chipNames(render(bySlug("freshstack-what-if"), true)), [
    "OpenCode",
  ]);
  assert.deepEqual(chipNames(render(bySlug("low-poly-urban"), true)), [
    "JK local study",
  ]);
});

test("every author chip matches a genuine example author in the catalog", () => {
  for (const skill of skills) {
    const real = new Set(skill.examples.map((e) => e.author));
    for (const tool of getSkillTools(skill, true)) {
      assert.ok(real.has(tool.name), `${skill.slug}: phantom ${tool.name}`);
    }
  }
});

test("no-example audio and captions entries render no author chips", () => {
  for (const slug of ["thai-narrator", "captions-overlay"]) {
    const skill = bySlug(slug);
    assert.equal(skill.examples.length, 0);
    assert.deepEqual(getSkillTools(skill, true), []);
    assert.equal(render(skill, true), "");
  }
});

test("audio runtime names only VoxCPM2 / MLX, never an AI coding tool", () => {
  const html = render(bySlug("thai-narrator"));
  assert.deepEqual(chipNames(html), ["VoxCPM2 / MLX"]);
  for (const agent of AGENT_NAMES) assert.ok(!html.includes(agent));
  assert.match(html, /data-tool-mark="voice-synthesis"/);
  assert.match(html, /data-mark-source="symbol"/);
  assert.ok(!html.includes("/tool-icons/"));
});

test("runtime grouping follows renderer and requirements", () => {
  const expected: Record<string, string[]> = {
    "growkaz-stickman": ["Canvas 2D", "FFmpeg"],
    "thai-survival": ["GSAP", "HyperFrames"],
    "freshstack-what-if": ["React", "Remotion"],
    "low-poly-urban": ["Three.js", "HyperFrames"],
    "thai-narrator": ["VoxCPM2 / MLX"],
    "captions-overlay": ["Renderer adapter"],
  };
  for (const [slug, names] of Object.entries(expected)) {
    assert.deepEqual(chipNames(render(bySlug(slug))), names, slug);
    for (const tool of getSkillTools(bySlug(slug))) {
      assert.equal(tool.kind, "runtime", `${slug}: ${tool.name}`);
    }
  }
});

test("groups expose role and accessible label; class names preserved", () => {
  const runtime = render(bySlug("freshstack-what-if"));
  const authors = render(bySlug("freshstack-what-if"), true);
  assert.match(
    runtime,
    /^<div class="tool-chips" role="group" aria-label="เครื่องมือที่ต้องใช้"/,
  );
  assert.match(
    authors,
    /^<div class="tool-chips" role="group" aria-label="ผู้เขียนโค้ด"/,
  );
  assert.equal((runtime.match(/class="tool-chip"/g) || []).length, 2);
});

test("every mark is decorative, 18px, and the name text stays visible", () => {
  for (const skill of skills) {
    for (const authors of [false, true]) {
      const html = render(skill, authors);
      const marks = markTags(html);
      const chips = html.match(/class="tool-chip"/g) || [];
      assert.equal(marks.length, chips.length, skill.slug);
      assert.equal(chipNames(html).length, chips.length, skill.slug);
      for (const tag of marks) {
        assert.match(tag, /aria-hidden="true"/);
        if (tag.startsWith("<img")) {
          assert.match(tag, /alt=""/);
          assert.match(tag, /width="18"/);
          assert.match(tag, /height="18"/);
        } else if (tag.startsWith("<svg")) {
          assert.match(tag, /focusable="false"/);
          assert.match(tag, /width="18"/);
        } else {
          assert.match(tag, /width:18px;height:18px/);
        }
      }
      for (const name of chipNames(html)) assert.ok(name.trim().length > 0);
    }
  }
});

test("branded marks point at the pinned, fetched upstream asset files", () => {
  for (const [name, [file, render, tone]] of Object.entries(BRANDED)) {
    const source = toolMarkSource(name);
    assert.equal(source.source, "brand", name);
    if (source.source !== "brand") continue;
    assert.equal(source.src, "/tool-icons/" + file, name);
    assert.equal(source.render, render, name);
    assert.equal(source.tone, tone, name);
    assert.ok(statSync("public" + source.src).size > 0, source.src);
    const entry = provenance.find((p) => p.file === file);
    assert.ok(entry, `${file} missing from provenance`);
    assert.equal(entry.status, "fetched", file);
    assert.match(entry.sha256 || "", /^[0-9a-f]{64}$/, file);

    const html = mark(name, 18);
    assert.match(html, /data-mark-source="brand"/, name);
    assert.ok(!html.includes('stroke="currentColor"'), `${name}: redrawn`);
    if (render === "image") {
      assert.match(html, new RegExp(`^<img[^>]*src="/tool-icons/${file}"`));
    } else {
      assert.match(html, new RegExp(`data-mask-src="/tool-icons/${file}"`));
      assert.match(html, /class="tool-mark-glyph"/);
    }
  }
});

test("colour identity comes from the real files, not currentColor redraws", () => {
  const svg = (file: string) =>
    readFileSync("public/tool-icons/" + file, "utf8");
  assert.match(svg("claudecode.svg"), /#D97757/i);
  assert.match(svg("codex.svg"), /#3941FF/i);
  assert.match(svg("react.svg"), /#61DAFB/i);
  for (const name of ["Claude Code", "Codex CLI", "React"]) {
    assert.match(mark(name), /data-tone="color"/, name);
  }
  // Legitimately monochrome upstream marks stay monochrome (theme-flipped).
  for (const name of ["OpenCode", "Three.js"]) {
    assert.match(mark(name), /data-tone="mono"/, name);
  }
});

test("names without a fetched logo get symbols, never a vendor asset", () => {
  for (const name of SYMBOLIC) {
    assert.deepEqual(toolMarkSource(name), { source: "symbol" }, name);
    const html = mark(name, 18);
    assert.match(html, /^<svg[^>]*data-mark-source="symbol"/, name);
    assert.ok(!html.includes("/tool-icons/"), name);
  }
  // Remotion's upstream fetch failed: no file may be referenced for it.
  const remotion = provenance.find((p) => p.file === "remotion.svg");
  assert.equal(remotion?.status, "unavailable");
  assert.ok(!mark("Remotion").includes("remotion.svg"));
});

test("distinct marks for each known tool", () => {
  const names = [
    "Claude Code",
    "Codex CLI",
    "OpenCode",
    "React",
    "Remotion",
    "Three.js",
    "GSAP",
    "HyperFrames",
    "Canvas 2D",
    "FFmpeg",
    "Editable SVG",
    "VoxCPM2 / MLX",
    "Captions",
  ];
  const keys = names.map((n) => resolveToolMark(n).key);
  assert.ok(!keys.includes("unknown"));
  assert.equal(new Set(keys).size, names.length);
  for (const n of AGENT_NAMES) {
    assert.equal(resolveToolMark(n).kind, "coding-agent");
  }
});

test("local study and unknown names are not labelled as AI tools", () => {
  assert.deepEqual(resolveToolMark("JK local study"), {
    key: "local-study",
    kind: "local",
  });
  for (const odd of ["Some Future Agent", "Claude", "claude-ish helper", ""]) {
    assert.deepEqual(resolveToolMark(odd), { key: "unknown", kind: "unknown" });
    assert.deepEqual(toolMarkSource(odd), { source: "symbol" });
  }
  const html = render(bySlug("low-poly-urban"), true);
  assert.match(html, /data-tool-kind="local"/);
  assert.match(html, /data-mark-source="symbol"/);
  assert.ok(!html.includes('data-tool-kind="coding-agent"'));
});

test("ToolMark honours size and className across all render paths", () => {
  const symbol = mark("Canvas 2D", 20, "x");
  assert.match(symbol, /class="tool-mark x"/);
  assert.match(symbol, /width="20"/);
  assert.match(symbol, /height="20"/);
  const image = mark("Claude Code", 20, "x");
  assert.match(image, /class="tool-mark x"/);
  assert.match(image, /width="20"/);
  assert.match(image, /height="20"/);
  const masked = mark("GSAP", 20, "x");
  assert.match(masked, /class="tool-mark x"/);
  assert.match(masked, /width:20px;height:20px/);
  assert.match(masked, /data-tool-mark="gsap"/);
  const fallback = mark("?");
  assert.match(fallback, /width="16"/);
  assert.match(fallback, /data-tool-mark="unknown"/);
});

test("SkillIcon export still renders a decorative icon", () => {
  const html = renderToStaticMarkup(
    createElement(SkillIcon, { category: "audio" }),
  );
  assert.match(html, /^<svg/);
  assert.match(html, /aria-hidden="true"/);
});
