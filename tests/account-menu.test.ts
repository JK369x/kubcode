import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Preview builds run with NEXTAUTH_URL present but empty. The header is on
// every page, so its module must load with that environment (next-auth/react
// parses NEXTAUTH_URL at import time and would throw "Invalid URL").
process.env.NEXTAUTH_URL = "";

// Node cannot load CSS modules; stub them as identity class maps before
// requiring the component (tsx compiles this file as CommonJS).
const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const { AccountMenuView } = require("../components/AccountMenu") as typeof import("../components/AccountMenu");

const html = (props: Parameters<typeof AccountMenuView>[0]) => renderToStaticMarkup(createElement(AccountMenuView, props));
const noop = () => {};

test("signed out: a compact เข้าสู่ระบบ link to /account and no member link", () => {
  const out = html({ user: null, onSignOut: noop });
  assert.match(out, /<a[^>]*href="\/account"[^>]*>เข้าสู่ระบบ<\/a>/);
  assert.doesNotMatch(out, /พื้นที่สมาชิก/);
});

test("still loading: renders a same-size placeholder, not a wrong state", () => {
  const out = html({ user: undefined, onSignOut: noop });
  assert.match(out, /aria-hidden="true"/);
  assert.doesNotMatch(out, /เข้าสู่ระบบ|<img/);
});

test("signed in with a picture: a menu button with the provider image, no referrer", () => {
  const out = html({
    user: { name: "JK Studio", image: "https://lh3.googleusercontent.com/a/x=s96-c" },
    onSignOut: noop,
  });
  // shadcn DropdownMenu (Radix): a menu button; the menu itself renders in a
  // portal on open (keyboard, focus and Esc are covered by test:interactions-app).
  assert.match(out, /<button[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(out, /aria-label="บัญชีของ JK Studio"/);
  assert.match(out, /<img[^>]*src="https:\/\/lh3\.googleusercontent\.com\/a\/x=s96-c"[^>]*>/);
  assert.match(out, /referrerPolicy="no-referrer"|referrerpolicy="no-referrer"/i);
  assert.doesNotMatch(out, /ตั้งค่าบัญชี/, "menu closed");
});

test("signed in without an allowed picture: the first letter on purple, never the raw URL", () => {
  const out = html({ user: { name: "สมชาย", image: "https://evil.example/x.png" }, onSignOut: noop });
  assert.doesNotMatch(out, /<img|evil\.example/);
  assert.match(out, />ส</);
});

test("menu items: display name, settings link and sign-out (source; Radix renders them on open)", () => {
  const src = require("node:fs").readFileSync("components/AccountMenu.tsx", "utf8") as string;
  assert.match(src, /<DropdownMenuLabel[^>]*>\s*\{name\}/);
  assert.match(src, /<DropdownMenuItem asChild>\s*<Link href="\/account\/settings">ตั้งค่าบัญชี<\/Link>/);
  assert.match(src, /<DropdownMenuItem onSelect=\{onSignOut\}>ออกจากระบบ<\/DropdownMenuItem>/);
});
