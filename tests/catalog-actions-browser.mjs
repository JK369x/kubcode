import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const checks = [];
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:3040");
  const cards = page.locator(".skill-card");
  assert.equal(await cards.count(), 7);
  assert.equal(
    await cards.locator(".card-preview .media-badge").count(),
    0,
    "no circular play badge remains on catalog images",
  );
  const actions = cards.getByRole("button", { name: /ดาวน์โหลด skill/ });
  assert.equal(await actions.count(), 7);
  for (let i = 0; i < 7; i++) {
    await assert.doesNotReject(() => actions.nth(i).waitFor());
    assert(await actions.nth(i).isDisabled());
    assert.match(await cards.nth(i).innerText(), /ยังไม่เปิดดาวน์โหลด/);
    const geometry = await cards.nth(i).evaluate((card) => {
      const button = [...card.querySelectorAll("button")].find((b) =>
        b.textContent.includes("ดาวน์โหลด skill"),
      );
      const r = button.getBoundingClientRect();
      const p = button.parentElement.getBoundingClientRect();
      return { width: r.width, parentWidth: p.width, height: r.height };
    });
    assert(
      Math.abs(geometry.width - geometry.parentWidth) < 2,
      "download button fills its content row",
    );
    assert(geometry.height >= 44);
    checks.push({ target: "card-download", index: i, ...geometry });
  }
  const details = cards
    .first()
    .getByRole("link", { name: "ดูเงื่อนไขการดาวน์โหลด" });
  await details.click();
  await page.waitForURL("**/skills/growkaz-stickman#download");
  assert.equal(await page.locator("#download").count(), 1);
  assert((await page.locator("h1").innerText()).includes("Stickman Cinema"));
  assert.equal(
    (
      await page.request.get(
        "http://127.0.0.1:3040/api/download/growkaz-stickman",
      )
    ).status(),
    503,
  );
  checks.push({ target: "real detail anchor and fail-closed API" });
  for (const width of [390, 768, 1440])
    for (const theme of ["dark", "light"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("http://127.0.0.1:3040");
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.locator("#skill-index").scrollIntoViewIfNeeded();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const icons = await page
        .locator('img[src^="/tool-icons/"]')
        .evaluateAll((imgs) =>
          imgs.map((i) => ({
            src: i.getAttribute("src"),
            complete: i.complete && i.naturalWidth > 0,
            width: i.getBoundingClientRect().width,
          })),
        );
      assert(icons.length > 0, "sourced brand logos actually mounted");
      assert(
        icons.every((i) => i.complete && i.width >= 16),
        "brand logos loaded and legible",
      );
      await page.screenshot({
        path: `.impeccable/review/final-card-actions-${width}-${theme}.png`,
        animations: "disabled",
      });
      checks.push({
        target: "catalog responsive",
        width,
        theme,
        loadedBrandIcons: icons.length,
      });
    }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    ".qa/catalog-actions-results.json",
    JSON.stringify({ status: "passed", checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ status: "passed", checks, errors }, null, 2));
} finally {
  await browser.close();
}
