// Skill page after the competitor review (2026-11-06): a side panel that
// stays on screen with the download, version, file size, licence and a
// requirements checklist, and numbered Thai steps with copyable prompts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};

const { skills } = require("../lib/catalog") as typeof import("../lib/catalog");
const { PACKAGES, approvedPackageFor } = require("../lib/packages") as typeof import("../lib/packages");
const { guideFor } = require("../lib/skill-guides") as typeof import("../lib/skill-guides");

async function renderSkillPage(slug: string) {
  const { default: Detail } = require("../app/skills/[slug]/page") as {
    default: (p: { params: Promise<{ slug: string }> }) => Promise<import("react").ReactElement>;
  };
  return renderToStaticMarkup(await Detail({ params: Promise.resolve({ slug }) }));
}
const panelOf = (html: string) => html.match(/<aside[^>]*class="skill-panel"[^>]*>([\s\S]*?)<\/aside>/)?.[1] ?? "";
const stepsOf = (html: string) => html.match(/<ol[^>]*class="steps"[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function folderBytes(dir: string): number {
  return readdirSync(dir).reduce((sum, name) => {
    const p = path.join(dir, name);
    return sum + (statSync(p).isDirectory() ? folderBytes(p) : statSync(p).size);
  }, 0);
}

test("panel: download, version, file size, licence and a requirements checklist", async () => {
  const html = await renderSkillPage("freshstack-what-if");
  const panel = panelOf(html);
  assert.ok(panel, "skill page has a side panel");
  assert.match(panel, /id="download"/);
  const t = text(panel);
  assert.match(t, /เวอร์ชัน 0\.2\.0/);
  assert.match(t, /ขนาดไฟล์ ไม่เกิน 859 KB/);
  assert.match(t, /สัญญาอนุญาต MIT/);
  assert.match(t, /โหลดฟรี/);
  const checklist = panel.match(/<ul[^>]*class="checklist"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  for (const r of skills.find((s) => s.slug === "freshstack-what-if")!.requirements) assert.ok(checklist.includes(r), r);
});

test("the panel stays on screen while the page scrolls (wide screens)", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const rule = css.match(/\.skill-panel\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /position:\s*sticky/);
  assert.match(rule, /top:/);
});

test("a skill without a package says so in the panel, with no size or licence", async () => {
  const panel = text(panelOf(await renderSkillPage("growkaz-stickman")));
  assert.match(panel, /ยังไม่มีชุดดาวน์โหลด/);
  assert.match(panel, /ยังไม่เปิดโหลด/);
  assert.doesNotMatch(panel, /ขนาดไฟล์|สัญญาอนุญาต/);
});

test("file size is an upper bound: the unpacked package size, rounded up", () => {
  for (const p of PACKAGES) {
    const kb = Math.ceil(folderBytes(`packages/${p.slug}/${p.version}`) / 1024);
    assert.equal(p.maxKb, kb, `${p.slug}: update maxKb when the package changes`);
  }
});

test("packaged skills get numbered Thai steps with copyable prompts from their README", async () => {
  for (const p of PACKAGES) {
    const html = await renderSkillPage(p.slug);
    const steps = stepsOf(html);
    assert.ok((steps.match(/<li\b/g) || []).length >= 4, p.slug);
    const blocks = [...steps.matchAll(/<div[^>]*class="code-block[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);
    assert.ok(blocks.some((b) => /<button[^>]*data-slot="button"[^>]*class="[^"]*\bcode-copy\b/.test(b)), `${p.slug}: a copy button`);
    // README prose is hard-wrapped: compare with whitespace collapsed.
    const readme = readFileSync(`packages/${p.slug}/${p.version}/README.md`, "utf8").replace(/\s+/g, " ");
    const prompts = guideFor(p.slug).flatMap((s) => (s.prompt ? [s.prompt] : []));
    assert.ok(prompts.length > 0, `${p.slug}: at least one prompt`);
    for (const prompt of prompts) {
      assert.ok(readme.includes(prompt), `${p.slug}: prompt comes from the README: ${prompt}`);
      assert.ok(html.includes(prompt), `${p.slug}: prompt shown`);
    }
  }
});

test("skills without a package keep three plain steps and promise no download", async () => {
  for (const s of skills.filter((x) => !approvedPackageFor(x.slug))) {
    const steps = stepsOf(await renderSkillPage(s.slug));
    assert.equal((steps.match(/<li\b/g) || []).length, 3, s.slug);
    assert.match(steps, /ยังไม่มีชุดให้ดาวน์โหลด/);
  }
});
