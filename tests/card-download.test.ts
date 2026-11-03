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
  m.exports = new Proxy(
    {},
    { get: (_t, key) => (key === "__esModule" ? false : String(key)) },
  );
};

const { CardDownloadAction } =
  require("../components/CardDownloadAction") as typeof import("../components/CardDownloadAction");

const render = (slug: string) =>
  renderToStaticMarkup(createElement(CardDownloadAction, { slug }));

test("shows the full download label with a persistent unavailable status", () => {
  const html = render("hello-skill");
  assert.match(html, /ดาวน์โหลด skill/);
  assert.match(html, /ยังไม่เปิดดาวน์โหลด/);
});

test("button is a real disabled button", () => {
  const html = render("hello-skill");
  const button = html.match(/<button\b[^>]*>/)?.[0] ?? "";
  assert.ok(button, "renders a <button>");
  assert.match(button, /\stype="button"/);
  assert.match(button, /\sdisabled(=""|\s|>)/);
});

test("makes no fake download claim or downloadable href", () => {
  const html = render("hello-skill");
  assert.doesNotMatch(html, /\sdownload(=|\s|>)/);
  assert.doesNotMatch(html, /\/api\/download/);
  assert.doesNotMatch(html, /\.zip/i);
  assert.doesNotMatch(html, /ดาวน์โหลดสำเร็จ|เริ่มดาวน์โหลด|กำลังดาวน์โหลด/);
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["/skills/hello-skill#download"]);
});

test("details link is named as conditions and encodes the slug", () => {
  const slug = "my skill/ไทย?x=1#y";
  const html = render(slug);
  const expected = "/skills/" + encodeURIComponent(slug) + "#download";
  assert.ok(html.includes(`href="${expected}"`), html);
  const link = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
  assert.match(link, /เงื่อนไข/);
});

test("has no interactive element nested inside the button", () => {
  const html = render("hello-skill");
  const inner = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? "";
  assert.ok(inner.length > 0);
  assert.doesNotMatch(inner, /<(a|button|input|select|textarea)\b/);
});
