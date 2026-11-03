// Reading experience in real Chrome against `next start` (needs a prior
// `next build`): TOC scroll-spy and jumps, code copy, A−/A+, view
// transitions list → article → back, reduced motion, and screenshots in
// light/dark at desktop and mobile widths. Run: npm run test:reading-browser
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { chromium, type Page } from "@playwright/test";

const ARTICLE = "/articles/free-ai-animation-opencode";

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_MEDIA_MODE: "licensed-only", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "ignore",
  });
  mkdirSync(".qa", { recursive: true });
  const checks: string[] = [];
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`${base}/robots.txt`)).ok) break;
      } catch {}
      if (i > 100) throw new Error("server did not start");
      await new Promise((r) => setTimeout(r, 200));
    }

    async function open(opts: { width: number; theme: "dark" | "light"; reduced?: boolean }): Promise<{ page: Page; errors: string[] }> {
      const context = await browser.newContext({
        viewport: { width: opts.width, height: 900 },
        reducedMotion: opts.reduced ? "reduce" : "no-preference",
        permissions: ["clipboard-read", "clipboard-write"],
      });
      await context.addInitScript((theme) => {
        try {
          localStorage.setItem("jk-theme", theme);
        } catch {}
        // Count view transitions started by navigations.
        const w = window as unknown as { __vt: number };
        w.__vt = 0;
        const start = document.startViewTransition?.bind(document);
        if (start)
          document.startViewTransition = ((arg: never) => {
            w.__vt++;
            return start(arg);
          }) as typeof document.startViewTransition;
      }, opts.theme);
      const page = await context.newPage();
      const errors: string[] = [];
      // "Failed to load resource" without a URL comes from Chrome's own
      // /favicon.ico probe (the site has no favicon yet); page requests that
      // fail are caught by the response listener below instead.
      page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));
      return { page, errors };
    }

    // Desktop: TOC, scroll-spy, copy, font size.
    {
      const { page, errors } = await open({ width: 1280, theme: "dark" });
      await page.goto(base + ARTICLE, { waitUntil: "networkidle" });
      const toc = page.locator(".toc-col");
      await toc.waitFor();
      assert.equal(await page.locator(".toc-mobile").isVisible(), false);
      const entries = await toc.locator("a").allInnerTexts();
      assert.ok(entries.length >= 8, `toc entries ${entries.length}`);
      assert.ok(await toc.locator(".toc-sub").count() >= 2, "h3 entries are nested");

      const target = toc.getByRole("link", { name: "ซับไทย", exact: true });
      await target.click();
      await page.waitForFunction(() => location.hash === "#ซับไทย" || decodeURIComponent(location.hash) === "#ซับไทย");
      await page.waitForFunction(() => {
        const h = document.getElementById("ซับไทย");
        return h && Math.abs(h.getBoundingClientRect().top - 96) < 40;
      });
      await page.waitForFunction(() => document.querySelector('.toc-col a[aria-current="location"]')?.textContent === "ซับไทย");
      checks.push("TOC click scrolls to the heading, updates the hash and marks it current");

      await page.evaluate(() => document.getElementById("ลำดับการตั้งค่า")!.scrollIntoView({ block: "start" }));
      await page.mouse.wheel(0, 10);
      await page.waitForFunction(() => document.querySelector('.toc-col a[aria-current="location"]')?.textContent === "ลำดับการตั้งค่า");
      checks.push("scroll-spy follows manual scrolling");

      const copy = page.locator(".code-block .code-copy").first();
      await copy.scrollIntoViewIfNeeded();
      await copy.click();
      await page.waitForFunction(() => document.querySelector(".code-copy")?.textContent === "คัดลอกแล้ว");
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert.match(clip, /^# Each line prints a version/);
      assert.match(clip, /ffprobe -version/);
      assert.equal(await page.locator(".code-block .code-lang").first().innerText(), "bash");
      assert.equal(await page.locator(".code-block .code-file").first().innerText(), "check-setup.sh");
      checks.push("copy button copies the exact code and confirms");

      assert.equal(await page.locator(".font-size span").innerText(), "100%", "fresh readers start at 100%");
      const size = () => page.locator(".prose").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      const before = await size();
      await page.getByRole("button", { name: "เพิ่มขนาดตัวอักษร" }).click();
      assert.ok((await size()) > before);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForFunction((b) => parseFloat(getComputedStyle(document.querySelector(".prose")!).fontSize) > b, before);
      await page.getByRole("button", { name: "ลดขนาดตัวอักษร" }).click();
      assert.equal(await size(), before);
      checks.push("A+/A− resize the article text and the choice survives a reload");

      await page.goto(base + ARTICLE, { waitUntil: "networkidle" });
      await page.screenshot({ path: ".qa/reading-1280-dark.png", fullPage: false });
      assert.deepEqual(errors, []);
      await page.context().close();
    }

    // View transitions: list → article (title morph) → back via breadcrumb.
    {
      const { page, errors } = await open({ width: 1280, theme: "light" });
      await page.goto(base + "/articles", { waitUntil: "networkidle" });
      await page.getByRole("link", { name: /ทำแอนิเมชัน AI ฟรีแบบของเรา/ }).click();
      await page.waitForURL("**" + ARTICLE);
      await page.locator("h1").waitFor();
      assert.ok((await page.evaluate(() => (window as unknown as { __vt: number }).__vt)) >= 1, "forward navigation used a view transition");
      await page.waitForTimeout(800);
      await page.screenshot({ path: ".qa/reading-1280-light.png", fullPage: false });
      await page.locator(".crumbs").getByRole("link", { name: "บทความ" }).click();
      await page.waitForURL("**/articles");
      assert.ok((await page.evaluate(() => (window as unknown as { __vt: number }).__vt)) >= 2, "back navigation used a view transition");
      checks.push("list → article → list navigations run view transitions");
      assert.deepEqual(errors, []);
      await page.context().close();
    }

    // Reduced motion: entrance animation and transition animations are off.
    {
      const { page } = await open({ width: 1280, theme: "dark", reduced: true });
      await page.goto(base + ARTICLE, { waitUntil: "networkidle" });
      const anim = await page.locator(".reading-head .enter").first().evaluate((el) => getComputedStyle(el).animationName);
      assert.equal(anim, "none");
      const vtRuleOff = await page.evaluate(() =>
        [...document.styleSheets].some((sheet) => {
          try {
            return [...sheet.cssRules].some(
              (r) => r instanceof CSSMediaRule && r.conditionText.includes("prefers-reduced-motion") && r.cssText.includes("::view-transition-group(*)"),
            );
          } catch {
            return false;
          }
        }),
      );
      assert.ok(vtRuleOff, "reduced-motion rule disables view transition animations");
      checks.push("prefers-reduced-motion removes entrance and transition animation");
      await page.context().close();
    }

    // Mobile: TOC collapses into a details block at the top.
    for (const theme of ["light", "dark"] as const) {
      const { page, errors } = await open({ width: 390, theme });
      await page.goto(base + ARTICLE, { waitUntil: "networkidle" });
      assert.equal(await page.locator(".toc-col").isVisible(), false);
      const details = page.locator(".toc-mobile");
      assert.equal(await details.isVisible(), true);
      await details.locator("summary").click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, "no horizontal page scroll");
      await page.screenshot({ path: `.qa/reading-390-${theme}.png`, fullPage: false });
      await page.locator(".code-block").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.qa/reading-390-${theme}-code.png`, fullPage: false });
      assert.deepEqual(errors, []);
      await page.context().close();
    }
    checks.push("mobile: collapsible TOC, no horizontal scroll (light + dark)");

    // Tool pages share the layout.
    {
      const { page, errors } = await open({ width: 1280, theme: "dark" });
      await page.goto(base + "/tools", { waitUntil: "networkidle" });
      await page.getByRole("link", { name: /Remotion — เขียนวิดีโอด้วย React/ }).click();
      await page.waitForURL("**/tools/remotion");
      await page.locator(".toc-col").waitFor();
      await page.waitForTimeout(900); // let the title morph finish
      await page.screenshot({ path: ".qa/reading-tool-1280-dark.png", fullPage: false });
      assert.deepEqual(errors.filter((e) => !/api\/interactions|503/.test(e)), []);
      await page.context().close();
    }
    checks.push("tool pages use the same reading layout");

    console.log(`PASS reading browser (${checks.length} checks)\n- ${checks.join("\n- ")}`);
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
