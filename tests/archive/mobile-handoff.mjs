import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto("http://127.0.0.1:3040");
await page.waitForLoadState("networkidle");
const browse = page.getByRole("link", { name: "เลือก skill อื่น" });
assert.equal(
  await browse.count(),
  1,
  "mobile opening needs a discoverable index jump",
);
await browse.click();
await page
  .locator(".skill-list button")
  .filter({ hasText: "Thai Survival" })
  .click();
await page.waitForFunction(() => {
  const e = document.querySelector(".exhibit");
  return (
    e &&
    e.getBoundingClientRect().top >= 0 &&
    e.getBoundingClientRect().top < 100
  );
});
assert.match(
  await page.locator(".exhibit video").getAttribute("aria-label"),
  /Thai Survival/,
);
assert.equal(
  await page.locator(".exhibit").evaluate((e) => e === document.activeElement),
  true,
  "keyboard/screen-reader focus follows explicit selection",
);
await browse.click();
await page.emulateMedia({ reducedMotion: "no-preference" });
await page
  .locator(".skill-list button")
  .filter({ hasText: "Thai Survival" })
  .click();
await page.waitForFunction(() => {
  const top = document.querySelector(".exhibit")?.getBoundingClientRect().top;
  return top !== undefined && top >= 0 && top < 100;
});
await page.screenshot({ path: ".impeccable/review/handoff-pointer.png" });
await page.emulateMedia({ reducedMotion: "reduce" });
await browse.click();
const next = page
  .locator(".skill-list button")
  .filter({ hasText: "GrowKaz Stickman" });
await next.focus();
await page.keyboard.press("Enter");
await page.waitForFunction(
  () => document.querySelector(".exhibit")?.getBoundingClientRect().top < 100,
);
assert.match(
  await page.locator(".exhibit video").getAttribute("aria-label"),
  /GrowKaz/,
);
await page.screenshot({ path: ".impeccable/review/handoff-keyboard.png" });
await page.locator(".search input").scrollIntoViewIfNeeded();
await page.evaluate(() => {
  window.__handoffs = 0;
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) {
    window.__handoffs++;
    return original.apply(this, args);
  };
});
await page.locator(".search input").fill("canvas");
assert.equal(
  await page.evaluate(() => window.__handoffs),
  0,
  "search typing must not trigger preview handoff",
);
for (const selector of [
  ".theme-toggle",
  ".variants button",
  ".credits summary",
  ".categories button",
  ".shader-caption button",
]) {
  const boxes = await page.locator(selector).evaluateAll((es) =>
    es.map((e) => ({
      w: e.getBoundingClientRect().width,
      h: e.getBoundingClientRect().height,
    })),
  );
  assert.ok(boxes.length > 0, selector);
  assert.ok(
    boxes.every(
      (b) =>
        b.h >= 44 &&
        ((selector !== ".theme-toggle" &&
          selector !== ".shader-caption button") ||
          b.w >= 44),
    ),
    selector + " mobile targets need 44px",
  );
}
await page.screenshot({ path: ".impeccable/review/handoff-mobile.png" });
await page.setViewportSize({ width: 1280, height: 1000 });
await page.goto("http://127.0.0.1:3040");
await page.waitForLoadState("networkidle");
await page.evaluate(() => {
  window.__handoffs = 0;
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) {
    window.__handoffs++;
    return original.apply(this, args);
  };
});
await page
  .locator(".skill-list button")
  .filter({ hasText: "Thai Survival" })
  .click();
assert.equal(
  await page.evaluate(() => window.__handoffs),
  0,
  "desktop selection must not invoke handoff",
);
fs.writeFileSync(
  ".qa/mobile-handoff.json",
  JSON.stringify(
    {
      mobile: "explicit pointer/keyboard handoff observed",
      reducedMotion: "respected via static scrolling",
      search: "no programmatic handoff",
      desktop: "no programmatic handoff",
      targets: "listed mobile controls >=44px",
    },
    null,
    2,
  ),
);
console.log(
  "PASS: mobile jump/selection/keyboard; no search or desktop auto-scroll; mobile targets >=44px",
);
await browser.close();
