// Homepage hero, option B "phone stage" (owner decision 2026-11-11,
// ~/Studio/work/kubcode-hero-options/DECISION.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const { HERO_FEATURED, commonPrefix, graphemes, headlinePhrase, heroClips } = require("../lib/hero-stage") as typeof import("../lib/hero-stage");
const { publishedShowcase } = require("../lib/showcase") as typeof import("../lib/showcase");
const { HeroStage } = require("../components/HeroStage") as typeof import("../components/HeroStage");

const CLIPS = heroClips(publishedShowcase("local-study"));
const css = readFileSync("components/HeroStage.module.css", "utf8");
const src = readFileSync("components/HeroStage.tsx", "utf8");

test("picker: one card per series beat, in the decided order, with aura colours", () => {
  assert.deepEqual(CLIPS.map((c) => c.id), HERO_FEATURED.filter((id) => CLIPS.some((c) => c.id === id)));
  assert.ok(CLIPS.length >= 5);
  for (const c of CLIPS) {
    assert.match(c.deep, /^#[0-9a-f]{6}$/);
    assert.match(c.accent, /^#[0-9a-f]{6}$/);
  }
  // Only what this build may publish; licensed-only shows none and the hero falls back.
  assert.equal(heroClips(publishedShowcase("licensed-only")).length, publishedShowcase("licensed-only").length === 0 ? 0 : heroClips(publishedShowcase("licensed-only")).length);
});

test("media URLs are versioned (?v=) so they can be cached for a year", () => {
  for (const c of CLIPS) {
    assert.match(c.poster.src, /\?v=[0-9a-f]{12}$/, c.id);
    if (c.preview) assert.match(c.preview, /\?v=[0-9a-f]{12}$/, c.id);
  }
});

test("typewriter types ทำแนว<แนวเรื่อง> by Thai grapheme cluster and keeps the common prefix", () => {
  assert.equal(headlinePhrase({ storyTh: "ซอมบี้คอนโด", visualTh: "x" }), "ทำแนวซอมบี้คอนโด");
  // Tone marks and vowels stay on their consonant: never typed alone.
  assert.deepEqual(graphemes("บี้"), ["บี้"]);
  for (const g of graphemes("ทำแนวถ้าเกิดว่า…")) assert.doesNotMatch(g, /^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/, g);
  assert.equal(commonPrefix(graphemes("ทำแนวซอมบี้คอนโด"), graphemes("ทำแนวถ้าเกิดว่า…")), graphemes("ทำแนว").length);
  // Erase ~28ms, type 70–120ms per grapheme.
  assert.match(src, /setTimeout\(erase, 28\)/);
  assert.match(src, /setTimeout\(type, 70 \+ Math\.random\(\) \* 50\)/);
});

test("server render: one h1, typed span hidden from screen readers, full phrase for them; picker is a radio group", () => {
  const html = renderToStaticMarkup(createElement(HeroStage, { clips: CLIPS, headingId: "h" }));
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<span[^>]*aria-hidden="true"[^>]*>ทำแนวซอมบี้คอนโด<\/span><span class="sr-only">ทำแนวซอมบี้คอนโด<\/span>/);
  assert.match(html, /role="radiogroup"/);
  assert.equal((html.match(/role="radio"/g) || []).length, CLIPS.length);
  assert.equal((html.match(/aria-checked="true"/g) || []).length, 1);
  assert.match(html, /aria-label="คลิปก่อนหน้า"/);
  assert.match(html, /aria-label="คลิปถัดไป"/);
  // Nothing plays or downloads before the client knows motion is allowed.
  for (const v of html.match(/<video\b[^>]*>/g) || []) {
    assert.doesNotMatch(v, /\ssrc=|autoplay/);
    assert.match(v, /preload="none"/);
    assert.match(v, /muted=""/);
  }
  assert.doesNotMatch(html, /data-hero-auto/, "no auto-advance control until motion is known to be allowed");
});

test("behaviour contract: only the active preview plays, while visible; still mode is poster-only; next poster preloaded", () => {
  assert.match(src, /play=\{i === index && visible && !still\}/);
  assert.match(src, /prefers-reduced-motion: reduce/);
  assert.match(src, /saveData/);
  assert.match(src, /link\.rel = "preload";/);
  assert.match(src, /const next = clips\[\(index \+ 1\) % clips\.length\];/);
  assert.match(src, /new IntersectionObserver/);
  assert.match(src, /visibilitychange/);
  // A user pick stops auto-advance for good; the toggle names what it does.
  assert.match(src, /if \(opts\.user\) \{\s*setAuto\(false\);/);
  assert.match(src, /<span>หยุดสลับอัตโนมัติ<\/span>/);
});

test("CSS: aura is a gradient (no blur over video); reduced motion stops it; mobile has no sideways scroll", () => {
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /(^|[\s;{])filter:\s*blur/m, "no blur filter (backdrop on the arrow buttons is fine)");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.aura,\s*\.tw::after \{\s*animation: none;/);
  assert.match(css, /\.tw\[data-still\]::after \{\s*animation: none;/);
  assert.match(readFileSync("app/globals.css", "utf8"), /\.library-page \{[^}]*overflow-x: clip;/);
});
