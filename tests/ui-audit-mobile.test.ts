// UX audit 2026-11-16: P0-5, P1-1, P1-2, P1-3, P2-2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAIN_LINKS } from "../lib/main-links";

const read = (f: string) => readFileSync(f, "utf8");

test("P1-1 + nav rework: one header row on phones; the sheet mirrors the grouped header", () => {
  assert.deepEqual(MAIN_LINKS.map((l) => l.href), ["/", "/articles", "/tools", "/community", "/pricing"]);
  const layout = read("app/layout.tsx");
  assert.match(layout, /<HeaderNav \/>/);
  assert.match(layout, /<MobileNav \/>/);
  const nav = read("components/MobileNav.tsx");
  assert.match(nav, /LEARN_LINKS\.map/);
  assert.match(nav, /PRICING_LINK\.href/);
  assert.match(nav, /WORK_LINKS\.map/);
  assert.match(nav, /<ThemeToggle variant="row" \/>/);
  assert.match(nav, /aria-label="เมนู"/);
  assert.match(nav, /min-\[561px\]:hidden/);
  assert.match(read("app/globals.css"), /@media \(max-width: 560px\) \{[\s\S]{0,400}\.header \.header-links,\s*\.header \.header-theme \{\s*display: none;/);
});

test("P1-2: short Studio / Social tab labels on small phones keep the full accessible name", () => {
  const hero = read("components/HeroStage.tsx");
  assert.match(hero, /<span className=\{styles\.tabLong\}> · \{PRODUCTS\.social\.tab\}<\/span>/);
  const css = read("components/HeroStage.module.css");
  assert.match(css, /\.tabLong \{\s*position: absolute;[\s\S]*clip-path: inset\(50%\)/, "visually hidden, not display:none");
  assert.match(read("components/pricing/PricingShowcase.tsx"), /className=\{styles\.tabLong\}/);
});

test("P0-5: sign-in card comes right after the headline in DOM order; lead is positive", () => {
  const page = read("app/account/page.tsx");
  const head = page.indexOf("styles.pitchHead");
  const card = page.indexOf('aria-labelledby="signin-h"');
  const more = page.indexOf("styles.pitchMore");
  assert.ok(head > 0 && head < card && card < more);
  assert.match(page, /lead="ใช้บัญชี Google หรือ LINE ที่มีอยู่ ไม่ต้องสร้างรหัสผ่านใหม่"/);
});

test("P1-3 / P2-2: Social pricing link from home; reassurance under the Social CTA; recommended first on phones", () => {
  assert.match(read("components/HeroStage.tsx"), /product === "social" \? "\/pricing\?for=social" : "\/pricing"/);
  const show = read("components/pricing/PricingShowcase.tsx");
  assert.match(show, /ยกเลิกได้ทุกเมื่อ · ไม่ตัดเงินอัตโนมัติ/);
  assert.match(show, /matchMedia\("\(max-width: 680px\)"\)/);
  assert.match(show, /sort\(\(a, b\) => Number\(b\.highlighted\) - Number\(a\.highlighted\)\)/);
});

test("contrast: selected clip card sub text in light mode and the demo DM blue stay ≥ 4.5:1", () => {
  assert.match(read("components/HeroStage.module.css"), /\.pick\[data-state="on"\] \.pickText small \{\s*color: #5d5070;/);
  for (const f of ["components/SocialSection.module.css", "components/SocialStage.module.css"]) assert.doesNotMatch(read(f), /#3797f0/i, f);
});
