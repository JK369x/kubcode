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

const { skills } = require("../lib/catalog") as typeof import("../lib/catalog");
const { coverFor } = require("../lib/media-covers") as typeof import("../lib/media-covers");
const hero =
  require("../components/KineticHero") as typeof import("../components/KineticHero");
const { KineticHero, composeStage, resolveMotion, pointerShift, POSTER_SIZES } =
  hero;

const noop = () => {};
const renderHero = (activeSlug = skills[0].slug, children?: string) =>
  render(
    createElement(
      KineticHero,
      { skills, activeSlug, onSelectSkill: noop },
      children ? createElement("span", { className: "slot" }, children) : null,
    ),
  );


// ---------------------------------------------------------------- stage data

test("stage uses only real local posters from the catalog, unique slugs", () => {
  const items = composeStage(skills);
  assert.ok(items.length >= 3 && items.length <= 4, String(items.length));
  assert.equal(new Set(items.map((i) => i.slug)).size, items.length);
  for (const item of items) {
    const skill = skills.find((s) => s.slug === item.slug);
    assert.ok(skill, "stage item must be a catalog skill: " + item.slug);
    assert.equal(item.name, skill.name);
    assert.ok(
      coverFor(skill) === item.poster,
      "poster must belong to that skill's own example",
    );
    assert.ok(item.poster.startsWith("/previews/"));
    assert.ok(!item.poster.includes(".."));
  }
});

test("zero-media skills are excluded, never given stand-in art", () => {
  const items = composeStage(skills);
  const zeroMedia = skills.filter((s) => !s.examples.some((e) => e.poster));
  assert.ok(zeroMedia.length >= 1);
  for (const skill of zeroMedia) {
    assert.ok(!items.some((i) => i.slug === skill.slug), skill.slug);
  }
  assert.deepEqual(composeStage(zeroMedia), []);
});

test("every selected stage poster has declared intrinsic dimensions", () => {
  for (const item of composeStage(skills)) {
    assert.ok(POSTER_SIZES[item.poster], "stage needs known size: " + item.poster);
  }
});

test("composition: one dominant landscape plus distinct-shape fragments", () => {
  const items = composeStage(skills);
  assert.deepEqual(
    items.map((i) => i.slot),
    items.map((_, index) => index),
  );
  assert.equal(items[0].shape, "landscape", "slot 0 is the wide dominant work");
  assert.equal(items[1].shape, "portrait");
  if (items[2]) assert.equal(items[2].shape, "landscape");
  if (items[3]) assert.equal(items[3].shape, "portrait");
});

test("read-only input: frozen catalog is accepted and left untouched", () => {
  const frozen = Object.freeze(skills.map((s) => Object.freeze({ ...s })));
  const before = JSON.stringify(frozen);
  const items = composeStage(frozen);
  assert.ok(items.length > 0);
  assert.equal(JSON.stringify(frozen), before);
  // Stable slugs are passed through, not rewritten.
  const slugs = new Set(skills.map((s) => s.slug));
  assert.ok(items.every((i) => slugs.has(i.slug)));
});

test("tool labels are the catalog's own runtime names", () => {
  const urban = composeStage(skills).find((i) => i.slug === "low-poly-urban");
  assert.ok(urban, "low-poly-urban has a real poster");
  assert.deepEqual(urban.tools, ["Three.js", "HyperFrames"]);
});

// ------------------------------------------------------------- motion gating

const base = {
  reducedMotion: false,
  userPaused: false,
  onScreen: true,
  documentHidden: false,
  finePointer: true,
};

test("motion runs only when allowed, on screen, visible and not paused", () => {
  assert.deepEqual(resolveMotion(base), {
    drift: "running",
    parallax: true,
    entrance: true,
  });
  assert.equal(resolveMotion({ ...base, userPaused: true }).drift, "paused");
  assert.equal(resolveMotion({ ...base, onScreen: false }).drift, "paused");
  assert.equal(resolveMotion({ ...base, documentHidden: true }).drift, "paused");
  for (const k of ["userPaused", "onScreen", "documentHidden"] as const) {
    const flipped = { ...base, [k]: !base[k] };
    assert.equal(resolveMotion(flipped).parallax, false, k);
  }
});

test("reduced motion disables entrance, drift and parallax", () => {
  assert.deepEqual(resolveMotion({ ...base, reducedMotion: true }), {
    drift: "off",
    parallax: false,
    entrance: false,
  });
});

test("parallax needs a fine pointer", () => {
  assert.equal(resolveMotion({ ...base, finePointer: false }).parallax, false);
  assert.equal(resolveMotion({ ...base, finePointer: false }).drift, "running");
});

test("pointer shift is bounded to [-1, 1] and safe on empty rects", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  assert.deepEqual(pointerShift(200, 100, rect), { x: 0, y: 0 });
  assert.deepEqual(pointerShift(300, 150, rect), { x: 1, y: 1 });
  assert.deepEqual(pointerShift(100, 50, rect), { x: -1, y: -1 });
  assert.deepEqual(pointerShift(9999, -9999, rect), { x: 1, y: -1 });
  assert.deepEqual(
    pointerShift(10, 10, { left: 0, top: 0, width: 0, height: 0 }),
    { x: 0, y: 0 },
  );
});

// ------------------------------------------------------------- SSR semantics

test("SSR hero: one Thai h1, real artwork visible, no media autoplay", () => {
  const html = renderHero();
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  const h1Text = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "")
    .replace(/<[^>]+>/g, "")
    .trim();
  assert.match(h1Text, /^[฀-๿]/, "heading is Thai: " + h1Text);
  for (const item of composeStage(skills)) {
    const img = html.match(
      new RegExp(`<img[^>]*src="${item.poster.replace(/[.]/g, "\\.")}"[^>]*>`),
    );
    assert.ok(img, "poster rendered in SSR: " + item.poster);
    assert.match(img[0], /width="\d+"/);
    assert.match(img[0], /height="\d+"/);
    assert.doesNotMatch(img[0], /\shidden\b/);
  }
  assert.doesNotMatch(html, /<video|<audio|autoplay/i);
  assert.match(html, /data-drift="running"/);
});

test("hero buttons name the actual work and reflect the active selection", () => {
  const html = renderHero("low-poly-urban");
  const buttons = [
    ...html.matchAll(/<button([^>]*data-slug="([^"]+)"[^>]*)>/g),
  ];
  const items = composeStage(skills);
  assert.equal(buttons.length, items.length);
  for (const [, attrs, slug] of buttons) {
    const item = items.find((i) => i.slug === slug)!;
    assert.match(attrs, /type="button"/);
    const label = attrs.match(/aria-label="([^"]+)"/)?.[1] ?? "";
    assert.ok(label.startsWith(item.name), label);
    for (const tool of item.tools) assert.ok(label.includes(tool), label);
    assert.match(
      attrs,
      new RegExp(`aria-pressed="${slug === "low-poly-urban"}"`),
    );
  }
  assert.match(html, /src="\/tool-icons\/threejs\.svg"/);
});

test("selected-work cue hands off to the native preview anchor", () => {
  const html = renderHero("growkaz-stickman");
  const cue = html.match(/<a[^>]*href="#selected-example"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(cue, "cue links to #selected-example");
  assert.match(cue[1], /Stickman Cinema/);
  // The hero never owns the anchors it points at.
  assert.doesNotMatch(html, /id="(selected-example|skill-index)"/);
});

test("pause control is a real toggle with a Thai accessible name", () => {
  const html = renderHero();
  const toggles = [
    ...html.matchAll(/<button([^>]*data-motion-toggle[^>]*)>([\s\S]*?)<\/button>/g),
  ];
  assert.equal(toggles.length, 1);
  const [, attrs, content] = toggles[0];
  assert.match(attrs, /type="button"/);
  assert.match(attrs, /aria-pressed="false"/, "unpressed (playing) by default");
  // Accessible name comes from visible text, which stays constant across
  // states; aria-pressed carries the state.
  const name = content.replace(/<[^>]+>/g, "").trim();
  assert.match(name, /หยุดภาพเคลื่อนไหว/);
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
  const html = render(createElement(Library));
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
