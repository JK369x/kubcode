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

test("hero promises the outcome in plain Thai, without jargon", () => {
  const h1 = text(hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  assert.equal(h1, "คลิปแบบนี้ ทำเองได้");
  const lead = text(hero.match(/<p\b[^>]*class="lead"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
  assert.match(lead, /โหลดชุดคำสั่งฟรี/);
  assert.match(lead, /ในคอมของคุณ/);
  assert.doesNotMatch(h1 + " " + lead, /skill|agent|template|render|เรนเดอร์|เทมเพลต/i);
});

test("hero has exactly one primary action and no search box", () => {
  const links = hero.match(/<a\b[^>]*class="start"[^>]*>[\s\S]*?<\/a>/g) || [];
  assert.equal(links.length, 1);
  assert.match(links[0], /href="#get-started"/);
  assert.match(text(links[0]), /^ดูวิธีทำคลิปแรก/);
  assert.doesNotMatch(hero, /<input\b/, "search lives in the catalogue, not the hero");
  assert.doesNotMatch(hero, /ดูคลังทั้งหมด/);
});
