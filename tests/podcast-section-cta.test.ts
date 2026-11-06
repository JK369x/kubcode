// The podcast clips are use-case examples only; the skill's "ดู template" and
// download appear once, next to the section heading (owner, 2026-11-06).
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Node cannot load CSS modules; stub them as identity class maps before
// requiring the component (tsx compiles this file as CommonJS).
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};

const { PodcastSection } = require("../components/PodcastSection") as typeof import("../components/PodcastSection");
const { podcastShowcase, publishedShowcase } = require("../lib/showcase") as typeof import("../lib/showcase");

const items = podcastShowcase(publishedShowcase("local-study"));
const html = renderToStaticMarkup(createElement(PodcastSection, { items }));
const count = (re: RegExp) => (html.match(re) ?? []).length;

test("the section shows every podcast clip as a card", () => {
  assert.equal(items.length, 4);
  assert.equal(count(/<li\b/g), 4);
});

test("template and download appear exactly once, not on each card", () => {
  assert.equal(count(/href="\/skills\/podcast-tool-short"/g), 1);
  // One control: its visible label (the title and screen-reader text repeat the word).
  assert.equal(count(/>ดาวน์โหลด</g), 1);
});

test("the single action pair sits in the heading, outside the clip list", () => {
  const list = html.slice(html.indexOf("<ul"), html.lastIndexOf("</ul>"));
  assert.doesNotMatch(list, /\/skills\/podcast-tool-short/);
  assert.doesNotMatch(list, /ดาวน์โหลด/);
});
