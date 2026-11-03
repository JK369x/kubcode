import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Replaces the archived atlas/shader browser scripts. Uses only local media and APIs.
const base = process.env.BASE_URL || "http://127.0.0.1:3040";
const report = {
  base,
  status: "running",
  checks: [],
  screenshots: [],
  errors: [],
};
const browser = await chromium.launch({ headless: true, channel: "chrome" });
fs.mkdirSync(".qa", { recursive: true });
fs.mkdirSync(".impeccable/review", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
const check = (name, detail = {}) => report.checks.push({ name, ...detail });
async function settle() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    [...document.images]
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return (
          image.loading !== "lazy" ||
          (rect.bottom > 0 && rect.top < innerHeight)
        );
      })
      .every((image) => image.complete && image.naturalWidth > 0),
  );
}
async function noOverflow(label) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scroll <= dimensions.width,
    `${label}: ${JSON.stringify(dimensions)}`,
  );
}
async function mediaProof(expected) {
  const video = page.locator("#selected-example video");
  await video.waitFor();
  assert.match(await video.locator("source").getAttribute("src"), expected);
  await video.evaluate(async (element) => {
    element.muted = true;
    await element.play();
  });
  const start = await video.evaluate((element) => element.currentTime);
  await page.waitForFunction(
    (initial) =>
      document.querySelector("#selected-example video").currentTime >
      initial + 0.3,
    start,
    { timeout: 15000 },
  );
  const advanced = await video.evaluate((element) => element.currentTime);
  const seek = await video.evaluate((element) => {
    element.pause();
    const target = Math.min(3, element.duration / 2);
    element.currentTime = target;
    return target;
  });
  await page.waitForFunction(
    (target) => {
      const video = document.querySelector("#selected-example video");
      return (
        !video.seeking &&
        Math.abs(video.currentTime - target) < 0.2 &&
        video.readyState >= 2
      );
    },
    seek,
    { timeout: 15000 },
  );
  check("actual media advancement and seek", {
    source: await video.locator("source").getAttribute("src"),
    start,
    advanced,
    seek,
    observed: await video.evaluate((element) => element.currentTime),
  });
}
try {
  assert.equal((await page.goto(base)).status(), 200);
  await settle();
  assert.equal(await page.locator(".skill-card").count(), 7);
  assert.equal(await page.locator(".support-preview").count(), 2);
  assert.equal(await page.locator(".without-media").count(), 2);
  assert.equal(
    await page.locator(".featured-copy h2").innerText(),
    "Stickman Cinema",
  );
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await mediaProof(/growkaz-stickman-claude/);
  await page.getByRole("button", { name: "Codex", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Codex", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await mediaProof(/growkaz-stickman-codex/);
  await page
    .locator(".support-preview")
    .filter({ hasText: "Survival Stories" })
    .click();
  assert.equal(
    await page.locator(".featured-copy h2").innerText(),
    "Survival Stories",
  );
  await mediaProof(/thai-survival-claude/);
  await page.getByRole("button", { name: "Codex", exact: true }).click();
  await mediaProof(/thai-survival-codex/);
  check("supporting selection and author variants");

  const search = page.getByRole("textbox", {
    name: "ค้นหาทักษะหรือเครื่องมือ",
    exact: true,
  });
  await search.fill("canvas");
  assert.equal(await page.locator(".skill-card").count(), 1);
  assert.equal(
    await page.locator(".card-title").innerText(),
    "Stickman Cinema",
  );
  await search.press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector("#skill-index").getBoundingClientRect().top < 50,
  );
  await search.fill("zz-no-results");
  await page
    .getByRole("heading", { name: "ยังไม่มีรายการที่ตรงกัน" })
    .waitFor();
  await page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
  assert.equal(await page.locator(".skill-card").count(), 7);
  await page.locator(".categories button").filter({ hasText: "โค้ด" }).click();
  assert.equal(await page.locator(".skill-card").count(), 0);
  await page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
  await page.locator(".categories button").filter({ hasText: "เสียง" }).click();
  assert.equal(await page.locator(".skill-card").count(), 1);
  assert.match(await page.locator(".skill-card").innerText(), /Thai Voice/);
  assert.match(
    await page.locator(".skill-card").innerText(),
    /ยังไม่มีสื่อพรีวิว/,
  );
  await page
    .locator(".categories button")
    .filter({ hasText: "ทั้งหมด" })
    .click();
  await page
    .locator(".card-preview")
    .filter({ hasText: "เวิร์กโฟลว์เสียงไทย" })
    .click();
  assert.equal(
    await page
      .locator("#selected-example video, #selected-example img")
      .count(),
    0,
  );
  assert.match(
    await page.locator("#selected-example").innerText(),
    /ยังไม่มีสื่อพรีวิว/,
  );
  await page.locator(".style-register summary").click();
  assert.equal(await page.locator(".register-row").count(), 8);
  check(
    "search intersection, category empty state, reset, honest no-media, register",
  );

  await page.goto(base);
  const featureLink = page.getByRole("link", {
    name: "ดู skill และวิธีทำ",
    exact: true,
  });
  await featureLink.focus();
  const outline = await featureLink.evaluate(
    (node) => getComputedStyle(node).outlineStyle,
  );
  assert.notEqual(outline, "none");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/skills/growkaz-stickman");
  await page.getByRole("heading", { name: "ก่อนเริ่มใช้งาน" }).waitFor();
  await page
    .getByRole("button", { name: "ดาวน์โหลดยังไม่เปิด", exact: true })
    .click();
  await page
    .locator(".download [role=status]")
    .filter({ hasText: "ยังไม่เชื่อมต่อ" })
    .waitFor();
  await page.locator(".credits summary").click();
  assert.match(await page.locator(".credits").innerText(), /claude-opus-5-5/);
  assert.match(await page.locator(".credits").innerText(), /Renderer/);
  check(
    "keyboard detail navigation, focus ring, provenance and download fail-closed",
  );
  const theme = page.getByRole("button", { name: "เปลี่ยนเป็นธีมสว่าง" });
  await theme.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("jk-theme")),
    "light",
  );
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page
    .getByRole("navigation", { name: "หลัก", exact: true })
    .getByRole("link", { name: "บทความ", exact: true })
    .click();
  await page.waitForURL("**/articles");
  const articleHrefs = await page
    .locator(".article-row")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  for (const href of articleHrefs) {
    await page.locator(`.article-row[href="${href}"]`).click();
    await page.waitForURL(`**${href}`);
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    assert.equal(await page.locator("main h1").count(), 1);
    await page
      .getByRole("navigation", { name: "หลัก", exact: true })
      .getByRole("link", { name: "บทความ", exact: true })
      .click();
    await page.waitForURL("**/articles");
    check("article link", { href });
  }
  await page
    .getByRole("link", { name: "พื้นที่สมาชิก", exact: false })
    .first()
    .click();
  await page.waitForURL("**/account");
  await page
    .getByRole("button", { name: "ตรวจสถานะการเชื่อมต่อ", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "ไม่ได้สร้างบัญชี" })
    .waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  check(
    "account link and real unavailable connection state; persistent theme across navigation",
  );
  for (const [method, path] of [
    ["get", "/api/download/growkaz-stickman"],
    ["post", "/api/account"],
  ]) {
    const response = await page.request[method](base + path);
    assert.equal(response.status(), 503);
    assert.equal((await response.json()).code, "BACKEND_NOT_CONFIGURED");
    check("fail-closed API", { method, path, status: response.status() });
  }

  await page.goto(base);
  const detailHrefs = await page
    .locator(".card-title a")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  for (const href of detailHrefs) {
    await page.locator(`.card-title a[href="${href}"]`).click();
    await page.waitForURL(`**${href}`);
    assert.equal(await page.locator("main h1").count(), 1);
    await page
      .getByRole("link", { name: "กลับไปคลังทักษะ", exact: true })
      .click();
    await page.waitForURL(base + "/");
    check("real detail link", { href });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".media-stage")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  assert.equal(await page.locator("canvas").count(), 0);
  check(
    "reduced motion: no selection animation or GPU; shader deliberately unmounted",
  );

  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const currentTheme of ["dark", "light"]) {
      await page.evaluate((value) => {
        localStorage.setItem("jk-theme", value);
      }, currentTheme);
      await page.reload();
      await settle();
      await noOverflow(`${width} ${currentTheme} home`);
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        currentTheme,
      );
      if ([1440, 390].includes(width)) {
        await page.evaluate(() => scrollTo(0, 0));
        const topPath = `.impeccable/review/redesign-${width}-${currentTheme}.png`;
        await page.screenshot({ path: topPath, animations: "disabled" });
        report.screenshots.push(topPath);
        await page
          .locator(".catalog-section")
          .evaluate((node) =>
            scrollTo({
              top: node.getBoundingClientRect().top + scrollY - 20,
              behavior: "instant",
            }),
          );
        await settle();
        const catalogPath = `.impeccable/review/redesign-${width}-${currentTheme}-catalog.png`;
        await page.screenshot({ path: catalogPath, animations: "disabled" });
        report.screenshots.push(catalogPath);
      }
      check("responsive home", { width, theme: currentTheme, overflow: false });
    }
  }
  // Check inherited surfaces at narrow width; no screenshots beyond the bounded batch.
  for (const path of [
    "/skills/growkaz-stickman",
    "/skills/thai-jk-voice",
    "/articles",
    ...articleHrefs,
    "/account",
  ]) {
    assert.equal((await page.goto(base + path)).status(), 200);
    await noOverflow(path + " mobile light");
  }
  check("shared detail/articles/account reflow at 390px");
  assert.deepEqual(report.errors, []);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    ".qa/redesign-browser-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
