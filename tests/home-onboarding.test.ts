// Homepage onboarding: the hero says what kubcode gives and which agents it
// works with, a "first skill" section walks through install with copyable
// prompts and an FAQ, and visual-style names are Thai first. Every claim here is
// backed by docs/adr/0002 and the What If package README.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};

const { Library } = require("../components/Library") as typeof import("../components/Library");
const { SHOWCASE_VISUALS } = require("../lib/showcase-allowlist") as typeof import("../lib/showcase-allowlist");
const { VISUAL_STYLES } = require("../lib/taxonomy") as typeof import("../lib/taxonomy");
type VisualKey = import("../lib/taxonomy").VisualKey;
const html = renderToStaticMarkup(createElement(Library, { articles: [] }));
const hero = html.slice(0, html.indexOf("</section>"));
const start = html.match(/<section[^>]*id="get-started"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";

test("hero says which agents the skills work with, linking their tool pages", () => {
  // Phone-stage hero (owner, 2026-11-11): "ทำได้ด้วย Claude Code หรือ OpenCode", plain text with small logos.
  const chips = hero.match(/ทำได้ด้วย([\s\S]*?)<\/p>/)?.[1] ?? "";
  for (const tool of ["claude-code", "opencode"]) assert.match(chips, new RegExp(`href="/tools/${tool}"`), tool);
  assert.doesNotMatch(chips, /codex/i, "no claim for an agent the packages do not name");
});

test("hero has one primary action that starts the first skill", () => {
  assert.match(hero, /<a[^>]*href="#get-started"[^>]*>[\s\S]*?เริ่มทำคลิปแรก/);
});

test("first-skill section: numbered install steps with the real skills path", () => {
  assert.match(start, /<h2[^>]*>เริ่มใช้ skill แรก: What If<\/h2>/);
  const steps = start.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
  assert.equal((steps.match(/<li\b/g) || []).length, 5);
  assert.match(steps, /~\/\.claude\/skills\/what-if-animation/);
  assert.match(steps, /ELEVENLABS_API_KEY/);
});

test("example prompts are copyable code blocks", () => {
  const blocks = [...start.matchAll(/<div[^>]*class="code-block[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 2);
  for (const b of blocks) {
    assert.match(b, /<pre[^>]*><code[^>]*>[^<]+<\/code><\/pre>/);
    assert.match(b, /<button[^>]*data-slot="button"[^>]*class="[^"]*\bcode-copy\b[^"]*"[^>]*aria-label="คัดลอก prompt"/);
  }
});

test("FAQ answers the questions people ask, in collapsible items", () => {
  const items = [...start.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
  assert.ok(items.length >= 4);
  const all = start.replace(/<[^>]+>/g, " ");
  assert.match(all, /20 ครั้ง/, "the real download limit");
  assert.match(all, /ElevenLabs/, "the paid dependency is disclosed");
  assert.match(all, /Google|LINE/, "how to sign in");
});

test("style names are Thai first, with the English name kept", () => {
  for (const slug of Object.keys(SHOWCASE_VISUALS) as VisualKey[]) {
    const style = VISUAL_STYLES[slug];
    assert.match(style.th, /^[฀-๿0-9]/, `${slug} Thai name`);
    assert.match(style.en, /^[A-Za-z0-9]/, `${slug} English name`);
  }
  // Shelf cards (every visual style but the podcast section) show both names.
  for (const [slug, v] of Object.entries(SHOWCASE_VISUALS) as [VisualKey, { section?: string }][]) {
    if (v.section === "podcast") continue;
    assert.ok(html.includes(VISUAL_STYLES[slug].en), VISUAL_STYLES[slug].en);
    assert.ok(html.includes(VISUAL_STYLES[slug].th), VISUAL_STYLES[slug].th);
  }
});
