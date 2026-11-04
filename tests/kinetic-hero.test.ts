import test from "node:test";
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup as renderReactMarkup } from "react-dom/server";

// Node cannot load CSS modules; stub them as identity class maps before
// requiring components (tsx compiles this file as CommonJS).
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy(
    {},
    { get: (_t, key) => (key === "__esModule" ? false : String(key)) },
  );
};

// React 19 prepends image resource hints; assertions concern component DOM.
const render = (node: Parameters<typeof renderReactMarkup>[0]) =>
  renderReactMarkup(node).replace(
    /<link\b(?=[^>]*rel="preload")(?=[^>]*as="image")[^>]*\/>/g,
    "",
  );

const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const { skills } = require("../lib/catalog") as typeof import("../lib/catalog");
const { publishedShowcase } = require("../lib/showcase") as typeof import("../lib/showcase");
const hero =
  require("../components/KineticHero") as typeof import("../components/KineticHero");
const { KineticHero } = hero;
const { styleShelf } = require("../lib/showcase") as typeof import("../lib/showcase");
const { SHOWCASE_STYLES } = require("../lib/showcase-allowlist") as typeof import("../lib/showcase-allowlist");

const CLIPS = publishedShowcase("licensed-only");
const SHELF = styleShelf(CLIPS);
const noop = () => {};
const renderHero = (activeSlug = skills[0].slug, children?: string, clips = CLIPS) =>
  render(
    createElement(
      KineticHero,
      { skills, activeSlug, onSelectSkill: noop, clips },
      children ? createElement("span", { className: "slot" }, children) : null,
    ),
  );

/** The style cards (<li>) of the shelf. */
const cards = (html: string) =>
  [...html.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/g)].map(([, attrs, body]) => ({ attrs, body }));
const cardFor = (html: string, posterSrc: string) => cards(html).find((c) => c.body.includes(`src="${posterSrc}"`));

test("SSR hero: one Thai h1 and one card per style, named by its style", () => {
  const html = renderHero();
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  const h1Text = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
  assert.match(h1Text, /^[\u0E00-\u0E7F]/, "heading is Thai: " + h1Text);
  assert.equal(cards(html).length, SHELF.length);
  for (const entry of SHELF) {
    const card = cardFor(html, entry.clip.poster.src);
    assert.ok(card, entry.style);
    assert.ok(card.body.includes(SHOWCASE_STYLES[entry.style].name), entry.style);
    assert.match(card.body, new RegExp(`${entry.count} คลิป`), `${entry.style} clip count`);
  }
});

test("no run of episodes: a series appears once, under its style", () => {
  const html = renderHero();
  const zombieCards = cards(html).filter((c) => /zombie-condo/.test(c.body));
  assert.equal(zombieCards.length, 1);
});

test("a card goes to its skill page, else to the published post, else nowhere", () => {
  const html = renderHero();
  for (const entry of SHELF) {
    const card = cardFor(html, entry.clip.poster.src)!;
    const link = card.body.match(/<a\b([^>]*)>/);
    const skill = SHOWCASE_STYLES[entry.style].skill;
    if (skill) {
      assert.ok(link?.[1].includes(`href="/skills/${skill}"`), entry.style);
      assert.doesNotMatch(link![1], /target=/);
    } else if (entry.clip.link) {
      assert.ok(link?.[1].includes(`href="${entry.clip.link.url}"`), entry.style);
      assert.match(link![1], /target="_blank"/);
      assert.match(link![1], /rel="noopener noreferrer"/);
      assert.match(card.body, /เปิดแท็บใหม่/);
    } else {
      assert.equal(link, null, entry.style);
    }
  }
});

test("previews never autoplay or download before someone hovers or focuses", () => {
  const html = renderHero();
  const videos = [...html.matchAll(/<video\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(videos.length > 0);
  for (const v of videos) {
    assert.doesNotMatch(v, /\ssrc=|autoplay/i);
    assert.match(v, /data-src="\/showcase\/[^"]+\/preview\.mp4"/);
    assert.match(v, /muted=""/);
    assert.match(v, /playsInline=""|playsinline=""/);
    assert.match(v, /preload="none"/);
  }
  for (const img of [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])) {
    assert.match(img, /width="\d+"/);
    assert.match(img, /height="\d+"/);
  }
});

test("nothing moves on its own, so there is no pause control", () => {
  const html = renderHero();
  assert.doesNotMatch(html, /data-motion-toggle|หยุดภาพเคลื่อนไหว|data-copy/);
});

test("credit line covers exactly the credits of the cards shown", () => {
  const html = renderHero();
  const line = html.match(/<p\b[^>]*>เครดิต:[\s\S]*?<\/p>/)?.[0] ?? "";
  const shown = SHELF.flatMap((s) => s.clip.credits);
  for (const c of shown) assert.ok(line.includes(c.text), c.text);
  if (shown.length === 0) assert.equal(line, "");
});

test("without approved clips: no shelf, honest copy", () => {
  const html = renderHero(skills[0].slug, undefined, []);
  assert.doesNotMatch(html, /<video|<li\b/);
  assert.match(html, /data-media="none"/);
});

test("CSS: no enclosing purple panel; reduced motion shows posters only", () => {
  const heroCss = fs.readFileSync(path.join(__dirname, "../components/KineticHero.module.css"), "utf8");
  const heroRule = heroCss.match(/(^|\n)\.hero\s*\{([^}]*)\}/)?.[2] ?? "";
  assert.doesNotMatch(heroRule, /background|border-radius/, "the hero sits on the page background");
  const shelfCss = fs.readFileSync(path.join(__dirname, "../components/StyleShelf.module.css"), "utf8");
  const reduced = [...shelfCss.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
  assert.match(reduced, /\.video\s*\{[^}]*display:\s*none/);
});

test("selected-work cue hands off to the native preview anchor", () => {
  const html = renderHero("growkaz-stickman");
  const cue = html.match(/<a[^>]*href="#selected-example"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(cue, "cue links to #selected-example");
  assert.match(cue[1], /Stickman Cinema/);
  // The hero never owns the anchors it points at.
  assert.doesNotMatch(html, /id="(selected-example|skill-index)"/);
});

test("hero makes no download claims and renders the action slot", () => {
  const html = renderHero(skills[0].slug, "ACTION-SLOT");
  assert.doesNotMatch(html, /ดาวน์โหลด|\/api\/download|\sdownload(=|\s|>)/);
  assert.match(html, /ACTION-SLOT/);
});

// ----------------------------------------------------- Library integration

test("Library: hero, selected example and catalog keep their contracts", () => {
  const { Library } =
    require("../components/Library") as typeof import("../components/Library");
  const articles = [{ slug: "a-slug", title: "ชื่อบทความ", description: "สรุป" }];
  const html = render(createElement(Library, { articles }));
  assert.match(html, /<a[^>]*href="\/articles\/a-slug"[^>]*>[\s\S]*?ชื่อบทความ/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/id="selected-example"/g) || []).length, 1);
  assert.equal((html.match(/id="skill-index"/g) || []).length, 1);
  assert.match(html, /<a[^>]*href="#skill-index"/);
  // Rejected opening/showcase composition is gone.
  assert.doesNotMatch(html, /class="(opening|work-showcase|supporting-work)"/);
  // Order: hero → selected native preview → catalog.
  const h1 = html.indexOf("<h1");
  const selected = html.indexOf('id="selected-example"');
  const catalog = html.indexOf('id="skill-index"');
  assert.ok(h1 < selected && selected < catalog);
  assert.match(html.slice(0, selected), /<div[^>]*hidden=""/,
    "the duplicated selected-player block is closed until an explicit selection");
  // Searches stay editable inputs.
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 2);
  for (const input of inputs) assert.doesNotMatch(input, /readonly|disabled/i);
  // Honest disabled downloads, one per catalog card.
  const disabled = [...html.matchAll(/<button\b[^>]*\sdisabled=""[^>]*>[\s\S]*?ดาวน์โหลด skill/g)];
  assert.equal(disabled.length, skills.length);
});
