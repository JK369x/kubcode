// Homepage UX pass after the competitor review (owner grill, 2026-11-06):
// a real footer, a plain-Thai hero with one primary action, use-case filters
// with honest badges, and skills without a clip moved to a small group.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};

const { Library } = require("../components/Library") as typeof import("../components/Library");
const { SiteFooter } = require("../components/SiteFooter") as typeof import("../components/SiteFooter");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const home = renderToStaticMarkup(createElement(Library, { articles: [] }));
const hero = home.slice(0, home.indexOf("</section>"));

/* ------------------------------------------------------------- footer */

test("footer: no prototype wording, links to articles, tools and privacy", () => {
  const html = renderToStaticMarkup(createElement(SiteFooter));
  for (const href of ["/articles", "/tools", "/privacy"]) assert.match(html, new RegExp(`href="${href}"`), href);
  assert.match(html, /<footer\b/);
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<SiteFooter\s*\/>/);
  for (const src of [html, layout]) {
    assert.doesNotMatch(src, /Personal library|Local prototype|ต้นแบบในเครื่อง|ตรวจในเครื่องเท่านั้น|ยังไม่เปิดใช้งาน/);
  }
});

/* --------------------------------------------------------------- hero */

test("hero promises the outcome in plain Thai (phone stage, owner 2026-11-11)", () => {
  // Line 1 is static; line 2 types "ทำแนว<แนวเรื่อง>" of the selected clip, and
  // screen readers get the whole phrase once (the typed span is aria-hidden).
  const h1 = hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
  assert.match(h1, /เห็นคลิปไหนถูกใจ/);
  assert.match(h1, /<span[^>]*aria-hidden="true"[^>]*>ทำแนวซอมบี้คอนโด<\/span><span class="sr-only">ทำแนวซอมบี้คอนโด<\/span>/);
  const lead = text(hero.match(/<p\b[^>]*class="[^"]*\blead\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
  assert.match(lead, /สกิลฟรี/);
  assert.match(lead, /ในคอมคุณเอง/);
  assert.doesNotMatch(text(h1), /template|render|เรนเดอร์|เทมเพลต/i);
});

test("hero has exactly one primary action and no search box", () => {
  // Owner 2026-11-12: one solid primary Button + one outline Button, no underlines.
  const copy = hero.slice(0, hero.indexOf('role="radiogroup"'));
  const buttons = copy.match(/<a\b[^>]*data-slot="button"[^>]*>[\s\S]*?<\/a>/g) || [];
  const links = buttons.filter((b) => /data-variant="default"/.test(b));
  assert.equal(links.length, 1, "one primary action");
  const secondary = buttons.filter((b) => /data-variant="outline"/.test(b));
  assert.equal(secondary.length, 1);
  assert.match(secondary[0], /href="#skill-index"[^>]*>ดูทุกแนวคลิป/);
  for (const b of [links[0], secondary[0]]) {
    assert.match(b, /data-size="lg"/, "48px");
    assert.match(b, /\bno-underline\b/);
  }
  assert.match(links[0], /href="#get-started"/);
  assert.match(text(links[0]), /^เริ่มทำคลิปแรก/);
  assert.doesNotMatch(hero, /<input\b/, "search lives in the catalogue, not the hero");
  assert.doesNotMatch(hero, /ดูคลังทั้งหมด/);
});

/* ---------------------------------------------- use-case filters */

const { skills, useCases, filterSkills } = require("../lib/catalog") as typeof import("../lib/catalog");
const { skillBadges } = require("../lib/skill-badges") as typeof import("../lib/skill-badges");
const { approvedPackageFor, PACKAGES } = require("../lib/packages") as typeof import("../lib/packages");
const { showcaseForSkill } = require("../lib/showcase") as typeof import("../lib/showcase");

const slugsFor = (useCase: string) => filterSkills(skills, "", useCase).map((s) => s.slug).sort();

test("filters are by what the creator wants to make, each one non-empty", () => {
  assert.deepEqual(useCases.map((u) => u.label), ["ทั้งหมด", "การ์ตูนเล่าเรื่อง", "คลิปสั้นจากพอดแคสต์", "เสียงพากย์และซับไทย", "ช่วยออกแบบแอป"]);
  assert.deepEqual(slugsFor("story"), ["deep-sea-docs", "freshstack-what-if", "growkaz-stickman", "low-poly-urban", "make-short", "thai-survival"]);
  assert.deepEqual(slugsFor("podcast"), ["podcast-tool-short"]);
  assert.deepEqual(slugsFor("voice-captions"), ["captions-overlay", "thai-narrator"]);
  assert.equal(slugsFor("all").length, skills.length);
  for (const s of skills) assert.ok(s.useCases.length > 0, s.slug);
});

test("the filter bar shows the use cases, not the old tech categories", () => {
  const bar = home.match(/<div[^>]*role="radiogroup"[^>]*aria-label="อยากทำอะไร"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  for (const u of useCases) assert.match(bar, new RegExp(u.label), u.label);
  assert.doesNotMatch(bar, /วิดีโอ \/ ภาพ|ซับไตเติล|โค้ด|การทำงาน/);
});

/* -------------------------------------------------------- badges */

const labels = (slug: string) => skillBadges(skills.find((s) => s.slug === slug)!).map((b) => b.label);

test("badges say free download, external cost and agents, only with evidence", () => {
  assert.deepEqual(labels("freshstack-what-if"), ["โหลดฟรี", "มีค่าใช้จ่ายภายนอก", "ใช้กับ Claude Code · OpenCode"]);
  assert.deepEqual(labels("podcast-tool-short"), ["โหลดฟรี", "ไม่ต้องใช้ API key", "ใช้กับ Claude Code"]);
  assert.deepEqual(labels("growkaz-stickman"), ["ยังไม่เปิดโหลด", "ไม่ต้องใช้ API key"]);
  for (const s of skills) {
    const hasAgents = labels(s.slug).some((l) => l.startsWith("ใช้กับ"));
    assert.equal(hasAgents, Boolean(approvedPackageFor(s.slug)), `${s.slug}: agent badge only with a package`);
  }
});

test("every agent a package claims is named in that package's README", () => {
  const names: Record<string, string> = { "claude-code": "claude", opencode: "opencode" };
  for (const p of PACKAGES) {
    const readme = readFileSync(`packages/${p.slug}/${p.version}/README.md`, "utf8").toLowerCase();
    assert.ok(p.agents.length > 0, p.slug);
    for (const a of p.agents) assert.ok(readme.includes(names[a]), `${p.slug} README names ${a}`);
  }
});

test("external cost is named for every skill that has one", () => {
  for (const s of skills) if (s.cost === "external") assert.ok(s.costNote, s.slug);
  assert.match(skills.find((s) => s.slug === "freshstack-what-if")!.costNote ?? "", /ElevenLabs/);
});

/* ----------------------------------------- clip cards vs no-clip group */

const grid = home.slice(home.indexOf('class="skill-grid"'), home.indexOf('class="no-clip"'));
const noClip = home.match(/<section[^>]*class="no-clip"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";
const withClip = skills.filter((s) => showcaseForSkill(s.slug)).map((s) => s.slug);
const without = skills.filter((s) => !showcaseForSkill(s.slug)).map((s) => s.slug);

test("only skills with an approved clip get a full card, and every one can play it", () => {
  assert.equal(withClip.length, 3);
  const cards = [...grid.matchAll(/<article\b[^>]*data-skill="([^"]+)"[\s\S]*?<\/article>/g)];
  assert.deepEqual(cards.map((m) => m[1]).sort(), [...withClip].sort());
  for (const [card, slug] of cards) {
    assert.match(card, /<img\b/, `${slug} poster`);
    const preview = showcaseForSkill(slug)!.cover.preview;
    if (preview) assert.ok(new RegExp(`<video[^>]*data-src="([^"]+)"`).exec(card)?.[1] === preview.src, `${slug} preview`);
    for (const b of skillBadges(skills.find((s) => s.slug === slug)!)) assert.ok(card.includes(b.label), `${slug}: ${b.label}`);
  }
  assert.doesNotMatch(grid, /สิ่งที่ต้องมี/, "no requirement-list placeholders in the main grid");
});

test("skills without a clip sit in a small group at the end, linking their pages", () => {
  assert.match(noClip, /<h3[^>]*>ยังไม่มีคลิปตัวอย่าง<\/h3>/);
  for (const slug of without) assert.match(noClip, new RegExp(`href="/skills/${slug}"`), slug);
  assert.doesNotMatch(noClip, /เร็วๆ นี้/, "no promise that cannot be kept (Stickman/Survival never ship)");
  assert.ok(home.indexOf('class="no-clip"') > home.indexOf('class="skill-grid"'));
});
