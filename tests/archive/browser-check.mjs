import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync(".qa", { recursive: true });
fs.mkdirSync(".impeccable/review", { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const findings = [];
await page.goto("http://127.0.0.1:3040");
await page.waitForLoadState("networkidle");
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
const video = page.locator("video");
await video.waitFor();
assert.match(
  await video.locator("source").getAttribute("src"),
  /growkaz-stickman-claude/,
);
await page.getByRole("button", { name: "Codex", exact: true }).click();
assert.match(
  await video.locator("source").getAttribute("src"),
  /growkaz-stickman-codex/,
);
await page
  .locator(".skill-list button")
  .filter({ hasText: "Thai Survival" })
  .click();
assert.match(
  await video.locator("source").getAttribute("src"),
  /thai-survival-claude/,
);
assert.match(await page.locator(".facts h2").innerText(), /Thai Survival/);
await page.locator(".search input").fill("canvas");
assert.equal(await page.locator(".skill-list button").count(), 1);
await page.locator(".search input").fill("zz-no-results");
await page.getByRole("heading", { name: "ยังไม่มีรายการที่ตรงกัน" }).waitFor();
await page.getByRole("button", { name: "ล้างตัวกรอง" }).click();
await page.locator(".categories button").filter({ hasText: "โค้ด" }).click();
assert.equal(await page.locator(".skill-list button").count(), 0);
await page.getByRole("button", { name: "ล้างตัวกรอง" }).click();
await page
  .getByRole("button", { name: "ดาวน์โหลดยังไม่เปิด", exact: true })
  .click();
await page
  .locator(".download [role=status]")
  .filter({ hasText: "ยังไม่เชื่อมต่อ" })
  .waitFor();
const download = await page.request.get(
  "http://127.0.0.1:3040/api/download/growkaz-stickman",
);
assert.equal(download.status(), 503);
assert.equal((await download.json()).code, "BACKEND_NOT_CONFIGURED");
await page.locator(".shader-field[data-renderer=webgpu-ready]").waitFor();
await page.getByRole("button", { name: "หยุด visual field" }).click();
assert.equal(await page.locator(".shader-field canvas").count(), 0);
await page.getByRole("button", { name: "เล่น visual field" }).click();
await page.locator(".shader-field[data-renderer=webgpu-ready]").waitFor();
const shader = await page.locator(".shader-caption").innerText();
findings.push({
  shader,
  renderer: "onReady observed; pause and resume exercised",
  navigatorGPU: await page.evaluate(() => "gpu" in navigator),
  canvasCount: await page.locator(".shader-field canvas").count(),
});
await page.goto("http://127.0.0.1:3040");
await page.waitForLoadState("networkidle");
await page.locator("video").evaluate(async (video) => {
  video.preload = "auto";
  video.load();
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve;
    video.onerror = reject;
  });
});
// Freeze the GPU layer for capture only; onReady/pause/resume were tested above.
const capturePause = page.getByRole("button", {name: "หยุด visual field"});
if (await capturePause.isEnabled()) await capturePause.click();
for (const width of [1440, 1280, 390]) {
  await page.setViewportSize({ width, height: 1000 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "overflow " + width,
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({path: `.impeccable/review/top-${width}.png`, animations: "disabled"});
  await page.locator(".facts").scrollIntoViewIfNeeded();
  await page.screenshot({path: `.impeccable/review/facts-${width}.png`, animations: "disabled"});
  await page.locator(".article-teasers").scrollIntoViewIfNeeded();
  await page.screenshot({path: `.impeccable/review/lower-${width}.png`, animations: "disabled"});
  await page.evaluate(() => scrollTo(0, 0));
  const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({width, height: documentHeight});
  await page.screenshot({
    path:
      ".impeccable/review/" +
      (width === 1440 ? "desktop" : width === 390 ? "mobile" : "desktop-1280") +
      ".png",
    fullPage: false,
    animations: "disabled",
  });
  findings.push({ width, overflow: false });
}
await page.setViewportSize({ width: 1440, height: 1000 });
await page.getByRole("button", { name: "เปลี่ยนเป็นธีมสว่าง" }).click();
assert.equal(
  await page.evaluate(() => localStorage.getItem("jk-theme")),
  "light",
);
await page.reload();
await page.waitForLoadState("networkidle");
assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
const lightPause = page.getByRole("button", {name: "หยุด visual field"});
if (await lightPause.isEnabled()) await lightPause.click();
await page.evaluate(() => scrollTo(0, 0));
const lightHeight = await page.evaluate(() => document.documentElement.scrollHeight);
await page.setViewportSize({width: 1440, height: lightHeight});
await page.screenshot({
  path: ".impeccable/review/desktop-light.png",
  fullPage: false,
  animations: "disabled",
});
await page.setViewportSize({width: 1440, height: 1000});
for (const path of [
  "/skills/growkaz-stickman",
  "/articles",
  "/articles/style-author-renderer",
  "/articles/install-with-permissions",
  "/account",
]) {
  const response = await page.goto("http://127.0.0.1:3040" + path);
  assert.equal(response.status(), 200);
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  findings.push({ path, status: 200, theme: "light" });
}
await page.getByRole("button", { name: "ตรวจสถานะการเชื่อมต่อ" }).click();
await page
  .getByRole("status")
  .filter({ hasText: "ไม่ได้สร้างบัญชี" })
  .waitFor();
const account = await page.request.post("http://127.0.0.1:3040/api/account");
assert.equal(account.status(), 503);
await page.getByRole("button", { name: "เปลี่ยนเป็นธีมมืด" }).focus();
await page.keyboard.press("Enter");
assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
await page.goto("http://127.0.0.1:3040");
await page.emulateMedia({ reducedMotion: "reduce" });
await page.getByText("ภาพนิ่ง · ลดการเคลื่อนไหว").waitFor();
assert.equal(await page.locator(".shader-field canvas").count(), 0);
findings.push({
  reducedMotion: "static fallback observed",
  themePersistence: "reload and routes verified; keyboard toggled",
});
assert.deepEqual(errors, []);
const unsupported = await browser.newContext();
await unsupported.addInitScript(() =>
  Object.defineProperty(navigator, "gpu", { value: undefined }),
);
const unsupportedPage = await unsupported.newPage();
await unsupportedPage.goto("http://127.0.0.1:3040");
await unsupportedPage.getByText("ภาพนิ่ง · WebGPU ไม่พร้อม").waitFor();
assert.equal(await unsupportedPage.locator(".shader-field canvas").count(), 0);
await unsupported.close();
findings.push({ unsupportedGPU: "fallback observed", pageErrors: errors });
fs.writeFileSync(".qa/browser-results.json", JSON.stringify(findings, null, 2));
console.log(JSON.stringify(findings, null, 2));
await browser.close();
