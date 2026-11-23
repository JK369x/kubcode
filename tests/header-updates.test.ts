// Header (owner 2026-11-23): no "เข้าสู่ระบบ", one bright "เริ่มใช้งาน"; an
// "อัปเดต · N ใหม่" button like "New drops · 5 New" that opens เพิ่งปล่อย.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const { UpdatesBadge, unseenCount, MAX_NEW, SEEN_KEY } = require("../components/UpdatesBadge") as typeof import("../components/UpdatesBadge");

test("N ใหม่ counts releases newer than the last one seen, at most 5", () => {
  const prs = [139, 138, 137, 135, 134, 133, 121];
  assert.equal(unseenCount(null, prs), MAX_NEW, "first visit: capped, not 7");
  assert.equal(unseenCount(135, prs), 3);
  assert.equal(unseenCount(139, prs), 0, "seen the newest: no chip");
  assert.equal(unseenCount(200, prs), 0);
  assert.equal(MAX_NEW, 5);
});

test("server render: the link to เพิ่งปล่อย with no count (read in the browser), and seen is kept per browser", () => {
  const html = renderToStaticMarkup(createElement(UpdatesBadge));
  assert.match(html, /<a[^>]*href="\/roadmap#shipped-h"[^>]*>[\s\S]*อัปเดต/);
  assert.doesNotMatch(html, /ใหม่/, "no count before the client knows what was seen");
  assert.equal(SEEN_KEY, "kubcode.updates.seen");
  const src = readFileSync("components/UpdatesBadge.tsx", "utf8");
  assert.match(src, /localStorage\.setItem\(SEEN_KEY, String\(newest\(\)\)\)/);
  // The roadmap page marks them seen too (bookmark or typed URL).
  assert.match(readFileSync("app/roadmap/page.tsx", "utf8"), /<MarkUpdatesSeen \/>/);
  assert.match(readFileSync("app/roadmap/page.tsx", "utf8"), /id="shipped-h"/);
});

test("header: อัปเดต first in the links, เริ่มใช้งาน instead of เข้าสู่ระบบ; phones get อัปเดต in the menu", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<span className="header-links">[\s\S]*?<UpdatesBadge \/>[\s\S]*?<HeaderNav \/>/);
  const menu = readFileSync("components/AccountMenu.tsx", "utf8");
  assert.match(menu, /href="\/account">\s*เริ่มใช้งาน\s*</);
  assert.doesNotMatch(menu, />\s*เข้าสู่ระบบ\s*</);
  assert.match(readFileSync("components/MobileNav.tsx", "utf8"), /href="\/roadmap#shipped-h"[\s\S]*?อัปเดต/);
});


test("the ใหม่ chip uses the brand primary tokens, not a hard-coded colour (owner 2026-11-23)", () => {
  const css = readFileSync("components/UpdatesBadge.module.css", "utf8");
  const chip = css.match(/\.chip \{([^}]*)\}/)?.[1] ?? "";
  assert.match(chip, /background: var\(--primary\);/);
  assert.match(chip, /color: var\(--primary-foreground\);/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, "no raw hex colours in the updates button");
});
