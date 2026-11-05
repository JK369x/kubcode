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

// --- Skills with an approved package (ADR 0002) ---

const { downloadPhase } = require("../lib/downloads/view") as typeof import("../lib/downloads/view");

test("phase: no package stays locked whatever the session", () => {
  for (const signedIn of [undefined, false, true])
    assert.equal(downloadPhase({ hasPackage: false, signedIn, available: true, working: false }), "none");
});

test("phase: a packaged skill checks first, then locks, asks to sign in, or is ready", () => {
  const p = (signedIn: boolean | undefined, available: boolean | undefined, working = false) =>
    downloadPhase({ hasPackage: true, signedIn, available, working });
  assert.equal(p(undefined, undefined), "checking");
  assert.equal(p(true, undefined), "checking");
  assert.equal(p(undefined, true), "checking");
  assert.equal(p(true, false), "closed");
  assert.equal(p(false, false), "closed");
  assert.equal(p(false, true), "signin");
  assert.equal(p(true, true), "ready");
  assert.equal(p(true, true, true), "working");
});

test("a packaged skill renders a disabled checking state on the server, never a file link", () => {
  const html = render("freshstack-what-if");
  const button = html.match(/<button\b[^>]*>/)?.[0] ?? "";
  assert.match(button, /\sdisabled(=""|\s|>)/);
  assert.match(html, /ดาวน์โหลด skill/);
  assert.match(html, /กำลังตรวจสอบ/);
  assert.doesNotMatch(html, /\/api\/download|\.zip|amazonaws/i);
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["/skills/freshstack-what-if#download"]);
});

const { DownloadAction } = require("../components/DownloadAction") as typeof import("../components/DownloadAction");

test("detail: a packaged skill states its licence, credit, contents and limit", () => {
  const html = renderToStaticMarkup(createElement(DownloadAction, { slug: "freshstack-what-if" }));
  assert.match(html, /id="download"/);
  assert.match(html, /MIT/);
  assert.match(html, /FreshStack/);
  assert.match(html, /0\.1\.0/);
  assert.match(html, /20 ครั้ง/);
  assert.doesNotMatch(html, /ยังไม่มีชุดดาวน์โหลด/);
});

test("detail: a skill without a package still says there is nothing to download", () => {
  const html = renderToStaticMarkup(createElement(DownloadAction, { slug: "growkaz-stickman" }));
  assert.match(html, /ยังไม่มีชุดดาวน์โหลด/);
  assert.doesNotMatch(html, /MIT|FreshStack/);
});
