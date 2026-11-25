// UI/UX Pro Max review (owner 2026-11-23): no repeated Social pitch, CTA above
// the phone on mobile, no text under 12px in the demo, 44px tap targets.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const { SocialSection } = require("../components/SocialSection") as typeof import("../components/SocialSection");
const { PRODUCTS } = require("../lib/products") as typeof import("../lib/products");

test("the Social section shows the demo instead of repeating the hero", () => {
  const html = renderToStaticMarkup(createElement(SocialSection, {}));
  const h2 = html.match(/<h2[^>]*id="social-heading"[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "";
  assert.doesNotMatch(h2, /คลิปเสร็จแล้ว/, "the hero's headline is not repeated");
  assert.match(h2, /คีย์เวิร์ด/);
  assert.ok(!html.includes(PRODUCTS.social.lead.slice(0, 30)), "the hero lead is not repeated");
  // Facebook: posting is live; only comment replies are coming.
  assert.match(html, /Facebook Page: ตั้งเวลาโพสต์ได้แล้ว/);
});

test("phones: the CTA comes right after the lead, before the phone mock", () => {
  const css = readFileSync("components/HeroStage.module.css", "utf8");
  const phone = css.slice(css.indexOf("@media (max-width: 759px)"));
  const order = (sel: string) => Number(phone.match(new RegExp(`\\.${sel} \\{[^}]*order: (-?\\d+)`))?.[1]);
  assert.ok(order("lead") < order("actions") && order("actions") < order("stageWrap"), "lead → CTA → phone");
  assert.ok(order("stageWrap") < order("side"));
});

test("no text under 12px in the phone demo; 44px tap targets", () => {
  assert.doesNotMatch(readFileSync("components/SocialStage.module.css", "utf8"), /font-size: 1[01]px/);
  assert.match(readFileSync("components/SocialSection.module.css", "utf8"), /\.roadmap \{[^}]*min-height: 44px/);
  assert.match(readFileSync("app/globals.css", "utf8"), /\.code-copy::before \{[^}]*inset: -6px/);
});
