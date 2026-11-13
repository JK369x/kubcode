// Home: kubcode Studio / kubcode Social (owner, 2026-11-13): platform logos,
// the product switch and the interactive social demo.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const { PLATFORMS, PlatformLogo } = require("../components/PlatformLogo") as typeof import("../components/PlatformLogo");
const { SocialSection, cleanKeyword, cleanLink, KEYWORD_MAX, LINK_MAX } = require("../components/SocialSection") as typeof import("../components/SocialSection");
const { PRODUCTS, productFromSearch } = require("../lib/products") as typeof import("../lib/products");

test("platform logos are the vendored simple-icons paths, unmodified, with provenance", () => {
  const prov = JSON.parse(readFileSync("public/platform-icons/PROVENANCE.json", "utf8")) as { file: string; sha256: string; modifications: string }[];
  for (const key of ["youtube", "instagram", "tiktok", "facebook"] as const) {
    const svg = readFileSync(`public/platform-icons/${key}.svg`, "utf8");
    assert.equal(PLATFORMS[key].path, svg.match(/ d="([^"]+)"/)![1], key);
    const entry = prov.find((p) => p.file === `${key}.svg`)!;
    assert.equal(entry.modifications, "none");
    const sha = require("node:crypto").createHash("sha256").update(readFileSync(`public/platform-icons/${key}.svg`)).digest("hex");
    assert.equal(entry.sha256, sha, key);
  }
  assert.ok(readFileSync("public/platform-icons/simple-icons-LICENSE.txt", "utf8").length > 100);
});

test("a logo names its platform unless the text next to it already does", () => {
  const named = renderToStaticMarkup(createElement(PlatformLogo, { platform: "tiktok" }));
  assert.match(named, /role="img"/);
  assert.match(named, /aria-label="TikTok"/);
  assert.match(named, /<title>TikTok<\/title>/);
  const deco = renderToStaticMarkup(createElement(PlatformLogo, { platform: "youtube", decorative: true }));
  assert.match(deco, /aria-hidden="true"/);
  assert.doesNotMatch(deco, /role="img"|<title>/);
  // Brand colours as published; TikTok follows the text colour (black/white mark).
  assert.match(renderToStaticMarkup(createElement(PlatformLogo, { platform: "instagram" })), /fill="#FF0069"/);
  assert.match(named, /fill="currentColor"/);
  assert.match(renderToStaticMarkup(createElement(PlatformLogo, { platform: "facebook", tone: "muted" })), /text-muted-foreground/);
});

test("product switch: names in one config, ?product=social links to Social, default Studio", () => {
  assert.equal(PRODUCTS.studio.name, "kubcode Studio");
  assert.equal(PRODUCTS.social.name, "kubcode Social");
  assert.equal(PRODUCTS.social.cta.href, "/account/channels");
  assert.equal(PRODUCTS.studio.cta.href, "#get-started");
  assert.equal(productFromSearch("?product=social"), "social");
  for (const q of ["", "?product=studio", "?product=x", "?product=<b>"]) assert.equal(productFromSearch(q), "studio");
  // Honest points: IG = DM, TikTok = public reply.
  assert.ok(PRODUCTS.social.points.some((p) => /Instagram.*DM/.test(p)));
  assert.ok(PRODUCTS.social.points.some((p) => /TikTok.*สาธารณะ/.test(p)));
  assert.doesNotMatch(JSON.stringify(PRODUCTS), /Facebook/);
  const src = readFileSync("components/HeroStage.tsx", "utf8");
  assert.match(src, /aria-label="เลือกผลิตภัณฑ์"/);
  assert.match(src, /url\.searchParams\.set\("product", p\)/);
  assert.match(src, /if \(product !== "social" \|\| still\) return;/, "no typing under reduced motion");
});

test("social demo: the visitor's channel, local only, input cleaned and capped", () => {
  const html = renderToStaticMarkup(createElement(SocialSection, {}));
  assert.match(html, /ช่องของคุณ/);
  assert.doesNotMatch(html, /kube\.code/);
  assert.match(html, /ตัวอย่าง<\/span> ลองเปลี่ยนดู/);
  assert.match(html, /<label[^>]*for="[^"]+-kw"[^>]*>คีย์เวิร์ด<\/label>/);
  assert.match(html, /<label[^>]*for="[^"]+-link"[^>]*>ลิงก์ของคุณ<\/label>/);
  assert.match(html, new RegExp(`maxLength="${KEYWORD_MAX}"`, "i"));
  assert.match(html, /เร็ว ๆ นี้/);
  assert.match(html, /กำลังทำ/);
  assert.doesNotMatch(html, /href="\/pricing"/, "no pricing link before the page exists");
  assert.match(renderToStaticMarkup(createElement(SocialSection, { pricing: true })), /href="\/pricing"/);
  assert.equal(cleanKeyword("  ลด ราคา<b>  "), "ลดราคาb");
  assert.equal(cleanKeyword("x".repeat(50)).length, KEYWORD_MAX);
  assert.equal(cleanLink("https://myshop.co/<script>sale 1"), "myshop.co/scriptsale1");
  assert.equal(cleanLink("y".repeat(99)).length, LINK_MAX);
  const src = readFileSync("components/SocialSection.tsx", "utf8");
  assert.doesNotMatch(src, /fetch\(|dangerouslySetInnerHTML/);
});

test("Social mode: the hero phone shows a demo of the visitor's channel, three screens, no video", () => {
  const { SOCIAL_SCREENS, SocialStage } = require("../components/SocialStage") as typeof import("../components/SocialStage");
  assert.deepEqual(SOCIAL_SCREENS.map((x) => x.title), ["ตั้งเวลาโพสต์", "โพสต์ขึ้นแล้ว", "คอมเมนต์ → DM"]);
  const shots = [0, 1, 2].map((screen) => renderToStaticMarkup(createElement(SocialStage, { screen })));
  for (const h of shots) {
    assert.match(h, /ช่องของคุณ/);
    assert.match(h, /ตัวอย่าง/);
    assert.doesNotMatch(h, /<video|kube\.code|@kubcode|facebook/i);
  }
  assert.match(shots[0], /สัปดาห์นี้/);
  for (const d of ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"]) assert.match(shots[0], new RegExp(`>${d}<`));
  assert.match(shots[0], /19:00/);
  assert.match(shots[1], /เผยแพร่แล้ว/);
  assert.match(shots[2], /ลิงก์/);
  assert.match(shots[2], /yourshop\.com\/promo/);
  const css = readFileSync("components/SocialStage.module.css", "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  const hero = readFileSync("components/HeroStage.tsx", "utf8");
  assert.match(hero, /const SOCIAL_MS = 4000;/);
  assert.match(hero, /if \(!running \|\| product !== "social"\) return;/, "only while visible, not held, motion allowed");
  assert.match(readFileSync("components/HeroStage.module.css", "utf8"), /\.stageLayer \{[\s\S]*?transition:\s*opacity 0\.18s/);
});

test("Social accent gradient: white text ≥ 4.5:1 at every point; gradient text readable on the page", () => {
  const css = readFileSync("components/HeroStage.module.css", "utf8");
  const lum = (h: string) => {
    const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const mix = (a: string, b: string, t: number) =>
    "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
  const worst = (stops: string[], against: string) => {
    let w = 99;
    for (let i = 0; i < stops.length - 1; i++) for (let k = 0; k <= 20; k++) w = Math.min(w, ratio(mix(stops[i], stops[i + 1], k / 20), against));
    return w;
  };
  const grad = (name: string, scope: RegExp) => {
    const block = css.match(scope)![0];
    return [...block.match(new RegExp(`${name}: linear-gradient\\([^;]*\\);`))![0].matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
  };
  const social = /\.stageArea\[data-product="social"\] \{[^}]*\}/;
  for (const name of ["--hero-fill", "--hero-fill-hover"]) assert.ok(worst(grad(name, social), "#ffffff") >= 4.5, name);
  assert.ok(worst(grad("--hero-text-fill", social), "#100e15") >= 4.5, "dark gradient text");
  const light = /:root\[data-theme="light"\]\) \.stageArea\[data-product="social"\] \{[^}]*\}/;
  assert.ok(worst(grad("--hero-text-fill", light), "#faf8fd") >= 4.5, "light gradient text");
  // Studio stays solid purple; switching crossfades the gradient layer (≤ 200 ms), none under reduced motion.
  assert.match(css, /--hero-solid: #7c3aed;/);
  assert.match(css, /\.productTab\.productTab::before \{[\s\S]*?transition: opacity 0\.18s ease;/);
});
