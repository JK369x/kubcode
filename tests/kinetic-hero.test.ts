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
const { getContent } = require("../lib/content") as typeof import("../lib/content");
const { styleToolsFrom } = require("../lib/showcase") as typeof import("../lib/showcase");
const STYLE_TOOLS = styleToolsFrom(getContent().tools);
const noop = () => {};
const renderHero = (activeSlug = skills[0].slug, children?: string, clips = CLIPS) =>
  render(
    createElement(
      KineticHero,
      { skills, activeSlug, onSelectSkill: noop, clips, styleTools: STYLE_TOOLS },
      children ? createElement("span", { className: "slot" }, children) : null,
    ),
  );

/** Top-level <li> cards of the shelf track (cards contain their own lists); loop copies carry data-copy. */
function allItems(full: string) {
  // Only the shelf track: the hero also has other lists (agent chips).
  const html = full.slice(Math.max(0, full.indexOf('aria-label="ตัวอย่างคลิป สไตล์ละหนึ่งคลิป"')));
  const out: { attrs: string; body: string }[] = [];
  let depth = 0;
  let start = -1;
  let attrs = "";
  for (const m of html.matchAll(/<(\/?)li\b([^>]*)>/g)) {
    if (!m[1]) {
      if (depth === 0) {
        start = m.index! + m[0].length;
        attrs = m[2];
      }
      depth++;
    } else if (--depth === 0) {
      out.push({ attrs, body: html.slice(start, m.index!) });
    }
  }
  return out;
}
const cards = (html: string) => allItems(html).filter((i) => !/data-copy/.test(i.attrs));
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

test("skill styles: see the template, download locked behind sign-in", () => {
  const html = renderHero();
  for (const entry of SHELF.filter((e) => SHOWCASE_STYLES[e.style].skill)) {
    const card = cardFor(html, entry.clip.poster.src)!;
    const skill = SHOWCASE_STYLES[entry.style].skill!;
    assert.match(card.body, new RegExp(`<a[^>]*href="/skills/${skill}"[^>]*>[\\s\\S]*?ดู template`), entry.style);
    assert.match(card.body, /<a[^>]*href="\/account"[^>]*>[\s\S]*?เข้าสู่ระบบเพื่อดาวน์โหลด/, entry.style);
    assert.doesNotMatch(card.body, /ดูคลิป/, entry.style);
  }
});

test("styles without a skill: only a link to the clip, no template or download", () => {
  const html = renderHero();
  for (const entry of SHELF.filter((e) => !SHOWCASE_STYLES[e.style].skill)) {
    const card = cardFor(html, entry.clip.poster.src)!;
    assert.doesNotMatch(card.body, /ดู template|ดาวน์โหลด/, entry.style);
    if (entry.clip.link) {
      const link = card.body.match(/<a\b([^>]*)>[\s\S]*?ดูคลิป/);
      assert.ok(link?.[1].includes(`href="${entry.clip.link.url}"`), entry.style);
      assert.match(link![1], /target="_blank"/);
      assert.match(link![1], /rel="noopener noreferrer"/);
    } else {
      assert.doesNotMatch(card.body, /<a\b/, entry.style);
    }
  }
});

test("signed in: the download button says it is coming, and is disabled", () => {
  const { CardActions } = require("../components/StyleShelf") as typeof import("../components/StyleShelf");
  const entry = SHELF.find((e) => SHOWCASE_STYLES[e.style].skill)!;
  const html = render(createElement(CardActions, { entry, signedIn: true }));
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?ดาวน์โหลดเร็วๆ นี้/);
  assert.doesNotMatch(html, /href="\/account"/);
});

test("tool icons: up to three, named, not links; more shows +N", () => {
  const html = renderHero();
  for (const entry of SHELF) {
    const card = cardFor(html, entry.clip.poster.src)!;
    const tools = STYLE_TOOLS[entry.style] ?? [];
    const icons = card.body.match(/<ul[^>]*aria-label="เครื่องมือที่ใช้"[^>]*>([\s\S]*?)<\/ul>/);
    if (tools.length === 0) {
      assert.equal(icons, null, entry.style);
      continue;
    }
    assert.ok(icons, entry.style);
    assert.doesNotMatch(icons[1], /<a\b/, "icons are not links");
    for (const t of tools.slice(0, 3)) assert.match(icons[1], new RegExp(`title="${t.name}"`), t.name);
    if (tools.length > 3) assert.match(icons[1], new RegExp(`\\+${tools.length - 3}`));
  }
});

test("hover details: each card carries its style's description", () => {
  const html = renderHero();
  for (const entry of SHELF) {
    const card = cardFor(html, entry.clip.poster.src)!;
    assert.ok(card.body.includes(SHOWCASE_STYLES[entry.style].detail), entry.style);
  }
});

test("no link inside another link in any card", () => {
  for (const card of cards(renderHero())) {
    let depth = 0;
    for (const tag of card.body.matchAll(/<(\/?)a\b/g)) {
      depth += tag[1] ? -1 : 1;
      assert.ok(depth <= 1, "nested link");
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

test("the row loops: copies are hidden from assistive tech and keyboard", () => {
  const html = renderHero();
  const copies = allItems(html).filter((i) => /data-copy/.test(i.attrs));
  assert.ok(copies.length >= SHELF.length, "the loop has a second half");
  for (const copy of copies) {
    assert.match(copy.attrs, /aria-hidden="true"/);
    assert.match(copy.attrs, /inert=""/);
  }
});

test("a pause control stops the slide; it is a real toggle with a Thai name", () => {
  const html = renderHero();
  const toggles = [...html.matchAll(/<button([^>]*data-motion-toggle[^>]*)>([\s\S]*?)<\/button>/g)];
  assert.equal(toggles.length, 1);
  const [, attrs, content] = toggles[0];
  assert.match(attrs, /type="button"/);
  assert.match(attrs, /aria-pressed="false"/);
  assert.match(content.replace(/<[^>]+>/g, "").trim(), /หยุดเลื่อน/);
});

test("credit line covers exactly the credits of the cards shown", () => {
  const html = renderHero();
  const line = html.match(/<p\b[^>]*>เครดิต:[\s\S]*?<\/p>/)?.[0] ?? "";
  const shown = SHELF.flatMap((s) => s.clip.credits);
  for (const c of shown) assert.ok(line.includes(c.text), c.text);
  if (shown.length === 0) assert.equal(line, "");
});

test("without approved clips: no shelf, no motion control, honest copy", () => {
  const html = renderHero(skills[0].slug, undefined, []);
  assert.doesNotMatch(html, /<video|<li\b|data-motion-toggle/);
  assert.match(html, /data-media="none"/);
});

test("CSS: no enclosing purple panel; reduced motion shows posters only", () => {
  const heroCss = fs.readFileSync(path.join(__dirname, "../components/KineticHero.module.css"), "utf8");
  const heroRule = heroCss.match(/(^|\n)\.hero\s*\{([^}]*)\}/)?.[2] ?? "";
  assert.doesNotMatch(heroRule, /background|border-radius/, "the hero sits on the page background");
  const shelfCss = fs.readFileSync(path.join(__dirname, "../components/StyleShelf.module.css"), "utf8");
  const reduced = [...shelfCss.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
  assert.match(reduced, /\.video\s*\{[^}]*display:\s*none/);
  assert.match(reduced, /\.track\s*\{[^}]*animation:\s*none/, "no sliding with reduced motion");
  assert.match(reduced, /\[data-copy\]\s*\{[^}]*display:\s*none/, "no duplicate cards when static");
  assert.match(reduced, /overflow-x:\s*auto/, "the static row can still be scrolled");
  assert.match(shelfCss, /\.viewport:hover \.track,\s*\.viewport:focus-within \.track/, "hover and focus pause the slide");
  assert.match(shelfCss, /\[data-paused\] \.track/, "the pause button stops the slide");
});

test("selected-work cue hands off to the native preview anchor", () => {
  const html = renderHero("growkaz-stickman");
  const cue = html.match(/<a[^>]*href="#selected-example"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(cue, "cue links to #selected-example");
  assert.match(cue[1], /Stickman Cinema/);
  // The hero never owns the anchors it points at.
  assert.doesNotMatch(html, /id="(selected-example|skill-index)"/);
});

test("downloads stay locked: no download link or file, only sign-in; action slot renders", () => {
  const html = renderHero(skills[0].slug, "ACTION-SLOT");
  assert.doesNotMatch(html, /\/api\/download|\sdownload(=|\s|>)|\.zip"/);
  const total = (html.match(/ดาวน์โหลด/g) || []).length;
  const onSignIn = [...html.matchAll(/<a[^>]*href="\/account"[^>]*>[\s\S]*?<\/a>/g)]
    .reduce((n, m) => n + (m[0].match(/ดาวน์โหลด/g) || []).length, 0);
  assert.equal(onSignIn, total, "download is only ever offered through the sign-in link");
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
