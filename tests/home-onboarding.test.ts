// Homepage onboarding: the hero says what kubcode gives and which agents it
// works with, a "first skill" section walks through install with copyable
// prompts and an FAQ, and style names are Thai first. Every claim here is
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
const { SHOWCASE_STYLES } = require("../lib/showcase-allowlist") as typeof import("../lib/showcase-allowlist");
const html = renderToStaticMarkup(createElement(Library, { articles: [] }));
const hero = html.slice(0, html.indexOf("</section>"));
const start = html.match(/<section[^>]*id="get-started"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";

test("hero says which agents the skills work with, linking their tool pages", () => {
  const chips = hero.match(/<ul[^>]*aria-label="ใช้กับ"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  for (const tool of ["claude-code", "opencode"]) assert.match(chips, new RegExp(`href="/tools/${tool}"`), tool);
  assert.doesNotMatch(chips, /codex/i, "no claim for an agent the packages do not name");
});

test("hero has one primary action that starts the first skill", () => {
  assert.match(hero, /<a[^>]*href="#get-started"[^>]*>[\s\S]*?เริ่มใช้ skill แรก/);
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
    assert.match(b, /<button[^>]*class="code-copy"/);
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
  for (const [slug, style] of Object.entries(SHOWCASE_STYLES)) {
    assert.match(style.name, /^[฀-๿]/, `${slug} Thai name`);
    assert.match(style.en, /^[A-Za-z]/, `${slug} English name`);
  }
  for (const style of Object.values(SHOWCASE_STYLES)) assert.ok(html.includes(style.en), style.en);
});
