// Reading experience in real Chrome against `next start` (needs a prior
// `next build`): TOC scroll-spy and jumps, code copy, A−/A+, view
// transitions list → article → back, reduced motion, and screenshots in
// light/dark at desktop and mobile widths. Run: npm run test:reading-browser
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { chromium, type Page } from "@playwright/test";
import { loadContent } from "../lib/content";

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
      // This server runs without sign-in configured, so the header's session
      // check answers 503 AUTH_NOT_CONFIGURED by design; anything else counts.
      page.on("response", (r) => {
        const path = new URL(r.url()).pathname;
        if (r.status() >= 400 && !(r.status() === 503 && path === "/api/auth/session")) errors.push(`${r.status()} ${path}`);
      });
      return { page, errors };
    }

    // Desktop: TOC, scroll-spy, copy, font size.
    {
      const { page, errors } = await open({ width: 1280, theme: "dark" });
      await page.goto(base + ARTICLE, { waitUntil: "networkidle" });
      const toc = page.locator(".page-rail");
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
      await page.waitForFunction(() => document.querySelector('.page-rail a[aria-current="location"]')?.textContent === "ซับไทย");
      checks.push("TOC click scrolls to the heading, updates the hash and marks it current");

      await page.evaluate(() => document.getElementById("ลำดับการตั้งค่า")!.scrollIntoView({ block: "start" }));
      await page.mouse.wheel(0, 10);
      await page.waitForFunction(() => document.querySelector('.page-rail a[aria-current="location"]')?.textContent === "ลำดับการตั้งค่า");
      checks.push("scroll-spy follows manual scrolling");

      // The TOC box has a fixed height, scrolls itself to keep the current
      // entry visible, and never moves the page while doing so.
      const box = page.locator("[data-toc-scroll]");
      const boxHeight = await box.evaluate((el) => el.getBoundingClientRect().height);
      assert.ok(boxHeight <= 19 * 16 + 1, `toc box ${boxHeight}px`);
      assert.ok(await box.evaluate((el) => el.scrollHeight > el.clientHeight), "this article's TOC overflows its box");
      const ids = await page.evaluate(() => [...document.querySelectorAll(".prose h2, .prose h3")].map((h) => h.id));
      // Earlier steps use smooth scrolling; start each measurement from rest.
      const settle = () =>
        page.evaluate(async () => {
          let last = -1;
          for (let still = 0; still < 6; ) {
            await new Promise((r) => setTimeout(r, 50));
            still = Math.round(scrollY) === last ? still + 1 : 0;
            last = Math.round(scrollY);
          }
        });
      for (const id of ids) {
        await settle();
        const y = await page.evaluate((hid) => {
          const h = document.getElementById(hid)!;
          const target = Math.round(window.scrollY + h.getBoundingClientRect().top - 110);
          window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
          return Math.round(window.scrollY);
        }, id);
        await page.waitForFunction((hid) => document.querySelector('[data-toc-scroll] a[aria-current="location"]')?.getAttribute("href") === `#${hid}`, id);
        await page.waitForTimeout(450); // let the TOC box finish its smooth scroll
        const state = await page.evaluate(() => {
          const b = document.querySelector("[data-toc-scroll]")!.getBoundingClientRect();
          const a = document.querySelector('[data-toc-scroll] a[aria-current="location"]')!.getBoundingClientRect();
          return { inView: a.top >= b.top - 1 && a.bottom <= b.bottom + 1, scrollY: Math.round(window.scrollY) };
        });
        assert.ok(state.inView, `active TOC entry for ${id} stays visible in its box`);
        assert.equal(state.scrollY, y, `TOC auto-scroll for ${id} left the page where the reader put it (${y} → ${state.scrollY})`);
      }
      assert.ok(await box.evaluate((el) => el.scrollTop > 0), "the box scrolled to follow later sections");
      checks.push("fixed-height TOC follows the reader (active entry always visible) without moving the page");

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
      checks.push("A+/A− resize the article text and the choice survives a reload; header tool icons in production order");

      await page.goto(base + ARTICLE, { waitUntil: "networkidle" });
      const headerTools = page.locator(".reading-head").getByRole("list", { name: "เครื่องมือที่ใช้" }).getByRole("link");
      assert.ok((await headerTools.count()) >= 6, "article header shows the tools it uses");
      assert.equal(await headerTools.first().getAttribute("href"), "/tools/glm-5-3-flash", "tools in production order, then by name");
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
      await page.getByRole("link", { name: "Remotion", exact: true }).click();
      await page.waitForURL("**/tools/remotion");
      await page.locator(".page-rail").waitFor();
      await page.locator(".page-rail").getByText("ดาวและคอมเมนต์ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้").waitFor();
      const railBottom = () => page.locator(".page-rail").evaluate((el) => el.getBoundingClientRect().bottom);
      assert.ok((await railBottom()) <= 900, `rail fits the first screen (bottom ${await railBottom()})`);
      await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" as ScrollBehavior }));
      assert.ok((await railBottom()) <= 900, `rail fits the viewport while reading (bottom ${await railBottom()})`);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.waitForTimeout(900); // let the title morph finish
      await page.screenshot({ path: ".qa/reading-tool-1280-dark.png", fullPage: false });
      assert.deepEqual(errors.filter((e) => !/api\/interactions|503/.test(e)), []);
      await page.context().close();
    }
    checks.push("tool pages use the same rail; with interactions off it says so in place and fits the viewport");

    // Mobile tool page: floating comments button opens a modal bottom sheet.
    {
      const { page, errors } = await open({ width: 390, theme: "dark" });
      await page.goto(base + "/tools/remotion", { waitUntil: "networkidle" });
      assert.equal(await page.locator(".page-rail").isVisible(), false);
      const fab = page.getByRole("button", { name: /^คอมเมนต์/ });
      await fab.click();
      const sheet = page.getByRole("dialog");
      await sheet.waitFor();
      assert.ok(await sheet.evaluate((d) => d.contains(document.activeElement)), "focus moves into the sheet");
      await sheet.getByText("ดาวและคอมเมนต์ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้").waitFor();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      assert.ok(await sheet.evaluate((d) => d.contains(document.activeElement)), "focus stays trapped in the sheet");
      await page.screenshot({ path: ".qa/reading-390-dark-sheet.png" });
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "hidden" });
      assert.equal(await fab.evaluate((b) => b === document.activeElement), true, "focus returns to the button");
      assert.equal(new URL(page.url()).pathname, "/tools/remotion", "closing pops only the sheet's history entry");
      await fab.click();
      await sheet.waitFor();
      await page.goBack();
      await sheet.waitFor({ state: "hidden" });
      assert.equal(new URL(page.url()).pathname, "/tools/remotion", "browser back closes the sheet and stays on the page");
      assert.deepEqual(errors, []);
      await page.context().close();
    }
    checks.push("mobile: comments button opens a bottom sheet; focus trapped and restored; Esc and back close it");

    // /articles: featured hero, category filter as real URLs, optimised covers.
    for (const [width, theme] of [[1280, "dark"], [1280, "light"], [390, "dark"], [390, "light"]] as const) {
      const { page, errors } = await open({ width, theme });
      const images: string[] = [];
      page.on("response", (r) => r.url().includes("/_next/image") && images.push(r.headers()["content-type"] ?? ""));
      await page.goto(base + "/articles", { waitUntil: "networkidle" });
      const hero = page.locator("main h2").first();
      assert.match(await hero.innerText(), /ทำแอนิเมชัน AI ฟรีแบบของเรา/, "featured: true takes the hero slot");
      const chips = page.getByRole("navigation", { name: "หมวดบทความ" });
      assert.equal(await chips.getByRole("link", { name: /ทั้งหมด/ }).getAttribute("aria-current"), "page");
      assert.ok(images.length >= 3 && images.every((t) => /image\/(avif|webp)/.test(t)), `covers served as AVIF/WebP (${images.join(",")})`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "no horizontal scroll");
      // Tool icons: the makers' logo files from /tools, each a named link above the card link.
      const icons = page.getByRole("list", { name: "เครื่องมือที่ใช้" }).first().getByRole("link");
      const names = await icons.evaluateAll((els) => els.map((el) => [el.getAttribute("aria-label"), el.getAttribute("href"), el.querySelector("img")?.getAttribute("src") ?? "monogram"]));
      assert.ok(names.length >= 6, `featured article shows its tools (${JSON.stringify(names)})`);
      for (const [name, href, src] of names) {
        assert.ok(name && /^\/tools\/[a-z0-9-]+$/.test(href!), `named link to a tool page: ${name} ${href}`);
        assert.ok(src === "monogram" || src === `${href}/logo.svg` || src === `${href}/logo.png`, `logo is the tool's own file: ${src}`);
      }
      await icons.first().scrollIntoViewIfNeeded();
      const iconBox = (await icons.first().boundingBox())!;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href"), [iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2]);
      assert.equal(hit, names[0][1], "tool icon sits above the card's stretched link");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `.qa/articles-${width}-${theme}.png`, fullPage: true });
      if (width === 1280 && theme === "dark") {
        await chips.getByRole("link", { name: /พื้นฐานและสิทธิ์/ }).click();
        await page.waitForURL("**/articles/c/basics");
        assert.equal(await page.locator("main h1").innerText(), "พื้นฐานและสิทธิ์");
        assert.equal(await page.locator("main article :is(h2, h3) a[href^='/articles/']").count(), 2);
        assert.equal(await chips.getByRole("link", { name: /พื้นฐานและสิทธิ์/ }).getAttribute("aria-current"), "page");
        assert.match((await page.locator('meta[name="robots"]').getAttribute("content")) ?? "", /noindex/, "fewer than 3 articles: noindex");
        await page.goto(base + "/articles", { waitUntil: "networkidle" });
        const before = await page.evaluate(() => (window as unknown as { __vt: number }).__vt);
        await page.getByRole("link", { name: /สไตล์ ผู้เขียน และ renderer/ }).click();
        await page.waitForURL("**/articles/style-author-renderer");
        assert.ok((await page.evaluate(() => (window as unknown as { __vt: number }).__vt)) > before, "card → article uses a view transition");
        const heroImg = page.locator(".reading-hero img");
        await heroImg.waitFor();
        assert.ok(((await heroImg.getAttribute("alt")) ?? "").length > 10, "article hero carries the cover alt text");
        await page.waitForTimeout(800);
        await page.screenshot({ path: ".qa/article-hero-1280-dark.png" });
      }
      assert.deepEqual(errors, []);
      await page.context().close();
    }
    {
      const { page } = await open({ width: 1280, theme: "dark", reduced: true });
      await page.goto(base + "/articles", { waitUntil: "networkidle" });
      const t = await page.locator("main article img").first().evaluate((el) => getComputedStyle(el).transitionDuration);
      assert.equal(t, "0s", "reduced motion: no cover zoom");
      await page.context().close();
    }
    checks.push("/articles: featured hero, category chips as URLs (filter + aria-current + noindex <3), AVIF/WebP covers, tool icon links (own logo files, above the card link), card → article transition with cover hero, reduced motion, 4 screenshots");

    // /tools: production-line stage filter, logo cards, morph card → tool page.
    for (const [width, theme] of [[1280, "dark"], [1280, "light"], [390, "dark"], [390, "light"]] as const) {
      const { page, errors } = await open({ width, theme });
      await page.goto(base + "/tools", { waitUntil: "networkidle" });
      const line = page.getByRole("navigation", { name: "ขั้นตอนทำคลิป" });
      assert.equal(await line.getByRole("link", { name: /ทั้งหมด/ }).getAttribute("aria-current"), "page");
      const cards = page.locator("main article");
      const content = loadContent();
      assert.equal(await cards.count(), content.tools.length);
      // Every logo is a local file that actually loaded (or a monogram).
      const logos = await page.locator("main article .tool-logo").evaluateAll((els) =>
        els.map((el) => {
          const img = el.querySelector("img");
          return img ? { src: img.getAttribute("src"), ok: img.complete && img.naturalWidth > 0 } : { src: "monogram", ok: (el.querySelector("[data-monogram]")?.getAttribute("data-monogram") ?? "").length > 0 };
        }),
      );
      assert.equal(logos.length, content.tools.length);
      for (const l of logos) assert.ok(l.ok && (l.src === "monogram" || /^\/tools\/[a-z0-9-]+\/logo\.(svg|png)$/.test(l.src!)), JSON.stringify(l));
      // Stars are off on this server: no counts are shown.
      assert.equal(await page.locator("main article [data-stars]").count(), 0, "star counts hidden while interactions are off");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "no horizontal scroll");
      await page.screenshot({ path: `.qa/tools-${width}-${theme}.png`, fullPage: true });
      if (width === 1280 && theme === "dark") {
        const svg = logos.find((l) => l.src?.endsWith(".svg"));
        if (svg) {
          const res = await page.request.get(base + svg.src);
          assert.match(res.headers()["content-security-policy"] ?? "", /default-src 'none'.*sandbox/, "SVG logos are served sandboxed");
        }
        // The external link is its own action and opens a new tab, not the card.
        const ext = cards.filter({ hasText: "FFmpeg" }).getByRole("link", { name: /ffmpeg\.org/ });
        assert.equal(await ext.getAttribute("target"), "_blank");
        await ext.scrollIntoViewIfNeeded();
        const box = (await ext.boundingBox())!;
        const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href"), [box.x + box.width / 2, box.y + box.height / 2]);
        assert.equal(top, "https://ffmpeg.org", "external link sits above the card's stretched link");
        await line.getByRole("link", { name: /เขียนบทและโค้ด/ }).click();
        await page.waitForURL("**/tools/c/script");
        assert.equal(await page.locator("main h1").innerText(), "เขียนบทและโค้ด");
        const scriptTools = content.tools.filter((t) => t.category === "script").length;
        assert.ok(scriptTools >= 3);
        assert.equal(await cards.count(), scriptTools);
        assert.equal(await line.getByRole("link", { name: /เขียนบทและโค้ด/ }).getAttribute("aria-current"), "page");
        const robots = await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((el) => el.getAttribute("content")).join(" "));
        assert.doesNotMatch(robots, /noindex/, "3+ tools: indexable");
        await page.goto(base + "/tools/c/render", { waitUntil: "networkidle" });
        assert.match((await page.locator('meta[name="robots"]').getAttribute("content")) ?? "", /noindex/, "fewer than 3 tools: noindex");
        assert.equal((await page.request.get(base + "/tools/c/image")).status(), 404, "empty stage 404s");
        await page.goto(base + "/tools", { waitUntil: "networkidle" });
        const before = await page.evaluate(() => (window as unknown as { __vt: number }).__vt);
        await page.getByRole("link", { name: "OpenCode", exact: true }).click();
        await page.waitForURL("**/tools/opencode");
        assert.ok((await page.evaluate(() => (window as unknown as { __vt: number }).__vt)) > before, "card → tool page uses a view transition");
        // Shared names as served (React marks them with vt-name; the CSS
        // property itself only exists mid-transition, so it can't be read reliably).
        const served = async (path: string) =>
          (await (await page.request.get(base + path)).text()).match(new RegExp(`vt-name="(kb-(?:logo|title)-tool-opencode)"`, "g"))?.map((m) => m.slice(9, -1)) ?? [];
        assert.deepEqual((await served("/tools")).sort(), ["kb-logo-tool-opencode", "kb-title-tool-opencode"], "card names the logo and title");
        const names = await served("/tools/opencode");
        assert.deepEqual(names.sort(), ["kb-logo-tool-opencode", "kb-title-tool-opencode"], "logo and title morph from the card");
        await page.waitForTimeout(800);
        await page.screenshot({ path: ".qa/tool-page-1280-dark.png" });
        assert.equal(await page.locator(".crumbs").getByRole("link", { name: "เขียนบทและโค้ด" }).getAttribute("href"), "/tools/c/script");
      }
      if (width === 390 && theme === "light") {
        await page.goto(base + "/tools/remotion", { waitUntil: "networkidle" });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        await page.screenshot({ path: ".qa/tool-page-390-light.png" });
      }
      assert.deepEqual(errors, []);
      await page.context().close();
    }
    checks.push("/tools: one logo card per tool (local files that load), stage chips as URLs (filter + aria-current + noindex <3 + empty 404), external link above the card link, stars hidden when off, logo+title morph card → page (reduced motion: global view-transition rule above), 4+2 screenshots");

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
