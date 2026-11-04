// Stars + comments against an actual Next production server and a real local
// PostgreSQL (throwaway database, connected as the runtime role kubcode_app).
// FICTIONAL members only; sessions are minted with a fixture secret, so this
// does not exercise Google/LINE consent. Requires a prior `next build` and
// KUBCODE_TEST_DATABASE_URL (loopback, database name containing "test").
// Run: npm run test:interactions-app
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { encode } from "next-auth/jwt";
import { chromium } from "@playwright/test";
import { createPgAccountStore } from "../lib/accounts/store";
import { accountToken } from "../lib/accounts/session";
import { CSRF_COOKIE } from "../lib/accounts/http";
import { SESSION_COOKIE_NAME } from "../lib/auth-policy";
import { throwawayDb } from "./accounts-db/harness";

const FIXTURE = {
  NEXTAUTH_URL: "https://kubcode.dev",
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
};

type Res = { status: number; headers: Record<string, string | string[] | undefined>; text: string; json: () => any };

function call(port: number, path: string, opts: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method: opts.method ?? "GET", headers: { host: "kubcode.dev", "x-forwarded-proto": "https", ...opts.headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) });
        });
      },
    );
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

async function main() {
  const db = await throwawayDb();
  const steps: string[] = [];
  const step = (name: string) => steps.push(name);
  const appPassword = randomBytes(18).toString("hex");
  let server: ReturnType<typeof spawn> | undefined;
  try {
    // Local container only: give the runtime role a login for this run.
    await db.pool.query(`ALTER ROLE kubcode_app LOGIN PASSWORD '${appPassword}'`);
    const dbName = (await db.pool.query("SELECT current_database() AS d")).rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const appUrl = `postgres://kubcode_app:${appPassword}@${base.host}/${dbName}`;

    const accounts = createPgAccountStore(db.pool);
    let n = 0;
    async function member(opts: { owner?: boolean; ageHours?: number; picture?: string } = {}) {
      const profile = { provider: "google" as const, subject: `g-app-${++n}`, displayName: `App Member ${n}`, email: `app${n}@example.test` };
      const r = await accounts.resolveLogin(profile);
      assert.equal(r.status, "ok");
      if (r.status !== "ok") throw new Error("login");
      await db.pool.query(
        "UPDATE kubcode_accounts.users SET created_at = now() - make_interval(hours => $2), is_owner = $3 WHERE id = $1",
        [r.userId, opts.ageHours ?? 48, opts.owner ?? false],
      );
      const token = accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email, picture: opts.picture });
      return `${SESSION_COOKIE_NAME}=${await encode({ token: token as never, secret: FIXTURE.NEXTAUTH_SECRET })}`;
    }
    const [a, b, owner, fresh] = [await member(), await member(), await member({ owner: true }), await member({ ageHours: 1 })];

    const port = await freePort();
    mkdirSync(".qa", { recursive: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      env: {
        ...process.env,
        ...FIXTURE,
        NODE_ENV: "production",
        KUBCODE_ACCOUNTS_ENABLED: "true",
        KUBCODE_INTERACTIONS_ENABLED: "true",
        DATABASE_URL: appUrl,
        KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK: "true",
        NEXT_PUBLIC_MEDIA_MODE: "licensed-only",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "ignore",
    });
    for (let i = 0; ; i++) {
      try {
        if ((await call(port, "/robots.txt")).status === 200) break;
      } catch {}
      if (i > 100) throw new Error("server did not start");
      await new Promise((r) => setTimeout(r, 200));
    }

    const csrfRes = await call(port, "/api/account/csrf");
    assert.equal(csrfRes.status, 200);
    const csrf = csrfRes.json().csrfToken as string;
    const write = (path: string, cookie: string, body?: unknown, opts: { method?: string; origin?: string; raw?: string } = {}) =>
      call(port, path, {
        method: opts.method ?? "POST",
        body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
        headers: {
          origin: opts.origin ?? "https://kubcode.dev",
          "sec-fetch-site": "same-origin",
          "x-kubcode-csrf": csrf,
          cookie: `${CSRF_COOKIE}=${csrf}; ${cookie}`,
          ...(body === undefined && opts.raw === undefined ? {} : { "content-type": "application/json" }),
        },
      });
    const state = async (cookie = "") =>
      (await call(port, "/api/interactions?kind=tool&slug=remotion", { headers: cookie ? { cookie } : {} })).json();
    const TOOL = { kind: "tool", slug: "remotion" };

    assert.equal((await call(port, "/tools/remotion")).status, 200);
    assert.equal((await state()).stars, 0);
    step("anonymous page state: 0 stars");

    assert.deepEqual((await write("/api/interactions/star", a, TOOL)).json(), { ok: true, starred: true, stars: 1 });
    assert.deepEqual((await write("/api/interactions/star", b, TOOL)).json(), { ok: true, starred: true, stars: 2 });
    assert.equal((await state(a)).starred, true);
    assert.deepEqual((await write("/api/interactions/star", a, TOOL)).json(), { ok: true, starred: false, stars: 1 });
    step("star / unstar by two members");

    const counts = await (await call(port, "/api/interactions/star-counts?kind=tool")).json();
    assert.deepEqual(counts, { available: true, stars: { remotion: 1 } });
    step("star counts for the tool index: public, known pages only");

    assert.equal((await write("/api/interactions/star", a, TOOL, { origin: "https://evil.example" })).status, 403);
    assert.equal((await write("/api/interactions/star", "", TOOL)).status, 401);
    assert.equal((await write("/api/interactions/star", a, { kind: "tool", slug: "no-such-tool" })).status, 404);
    step("bad origin 403, signed out 401, unknown page 404");

    const big = JSON.stringify({ ...TOOL, body: "ก".repeat(6000), parentId: null });
    assert.equal((await write("/api/interactions/comments", a, undefined, { raw: big })).json().code, "PAYLOAD_TOO_LARGE");
    step("oversized body rejected 413");

    const first = await write("/api/interactions/comments", a, { ...TOOL, body: "ใช้ Remotion ทำแอนิเมชันได้ดี", parentId: null });
    assert.equal(first.status, 200, first.text);
    const commentId = first.json().comment.id as string;
    assert.equal((await write("/api/interactions/comments", a, { ...TOOL, body: "อีกข้อความ", parentId: null })).json().code, "COMMENT_TOO_SOON");
    assert.equal((await write("/api/interactions/comments", b, { ...TOOL, body: "เห็นด้วย", parentId: commentId })).status, 200);
    assert.equal((await write("/api/interactions/comments", fresh, { ...TOOL, body: "ดู https://example.com", parentId: null })).json().code, "COMMENT_LINKS");
    step("comment, 20 s interval, reply, new-account link block");

    assert.equal((await write(`/api/interactions/comments/${commentId}/report`, b, {})).status, 200);
    assert.equal((await write(`/api/interactions/comments/${commentId}/hide`, a, { hidden: true })).status, 403);
    assert.equal((await write(`/api/interactions/comments/${commentId}/hide`, owner, { hidden: true })).status, 200);
    assert.equal((await state()).comments.some((c: { id: string }) => c.id === commentId), false);
    const ownerView = (await state(owner)).comments.find((c: { id: string }) => c.id === commentId);
    assert.deepEqual([ownerView.hidden, ownerView.reports], [true, 1]);
    assert.equal((await write(`/api/interactions/comments/${commentId}/hide`, owner, { hidden: false })).status, 200);
    step("report, non-owner hide 403, owner hide/unhide");

    assert.equal((await write("/api/interactions/profile", a, { publicName: "JK Studio" })).json().publicName, "JK Studio");
    assert.equal((await state()).comments.find((c: { id: string }) => c.id === commentId).author, "JK Studio");
    assert.equal((await write("/api/interactions/profile", a, { publicName: "spam.com" })).json().code, "NAME_INVALID");
    step("public name edit shows on comments; link names rejected");

    assert.equal((await write(`/api/interactions/comments/${commentId}`, b, undefined, { method: "DELETE" })).status, 403);
    assert.equal((await write(`/api/interactions/comments/${commentId}`, a, undefined, { method: "DELETE" })).status, 200);
    step("delete own only");

    const go = await call(port, "/go/rm");
    assert.equal(go.status, 301);
    assert.equal(go.headers.location, "/tools/remotion");
    assert.match((await call(port, "/sitemap.xml")).text, /https:\/\/kubcode\.dev\/tools\/remotion/);
    step("/go short link 301 and sitemap");

    // Browser phase: real Chrome drives the UI. kubcode-ui.test resolves to the
    // local server (.dev is HSTS-preloaded, so it can't be served over http); each request gets the headers Vercel's HTTPS edge would
    // add, plus this fixture member's cookies (Secure cookies can't be set
    // over plain http, so they are injected per request).
    const ui = await member();
    const csrfFixture = randomBytes(32).toString("base64url");
    const browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: [`--host-resolver-rules=MAP kubcode-ui.test 127.0.0.1:${port}`],
    });
    // Enough threads for two pages, so pagination and the panel's own scroll
    // are exercised (first page is 20 threads, newest first).
    const seeder = (await db.pool.query("SELECT user_id FROM kubcode_accounts.user_identities WHERE subject = 'g-app-2'")).rows[0].user_id;
    await db.pool.query(
      `INSERT INTO kubcode_accounts.page_comments (user_id, page_kind, page_slug, body, body_hash, created_at)
       SELECT $1, 'tool', 'remotion', 'ความเห็นตัวอย่างที่ ' || g, sha256(('seed ' || g)::bytea), now() - make_interval(mins => 200 - g)
         FROM generate_series(1, 25) g`,
      [seeder],
    );
    try {
      const runs = [
        { width: 1280, height: 900, theme: "dark" },
        { width: 1280, height: 900, theme: "light" },
        { width: 390, height: 844, theme: "dark" },
        { width: 390, height: 844, theme: "light" },
      ] as const;
      for (const run of runs) {
        const desktop = run.width > 1000;
        const page = await browser.newPage({ viewport: { width: run.width, height: run.height } });
        await page.addInitScript((t) => {
          try {
            localStorage.setItem("jk-theme", t);
          } catch {}
        }, run.theme);
        const errors: string[] = [];
        page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
        // Chrome drops cookie overrides on continue(), so the request is
        // replayed from Node with the edge headers and fulfilled as-is.
        await page.route("http://kubcode-ui.test/**", async (route) => {
          const { pathname, search } = new URL(route.request().url());
          const response = await route.fetch({
            url: `http://127.0.0.1:${port}${pathname}${search}`,
            headers: {
              ...route.request().headers(),
              host: "kubcode.dev",
              origin: "https://kubcode.dev",
              "x-forwarded-proto": "https",
              cookie: `${CSRF_COOKIE}=${csrfFixture}; ${ui}`,
            },
            maxRedirects: 0,
          });
          await route.fulfill({ response });
        });
        await page.goto("http://kubcode-ui.test/tools/remotion");
        const label = `${run.width}-${run.theme}`;

        // Desktop uses the rail; mobile opens the bottom sheet.
        const starScope = desktop ? page.locator(".page-rail") : page.locator("[class*=mobileBar]");
        const star = starScope.getByRole("button", { name: /ให้ดาว/ });
        await star.waitFor({ timeout: 15000 });
        await star.click();
        await starScope.getByRole("button", { name: "ให้ดาวแล้ว" }).waitFor();
        let panel = page.locator(".page-rail");
        if (!desktop) {
          await page.getByRole("button", { name: /^คอมเมนต์/ }).click();
          panel = page.getByRole("dialog");
          await panel.waitFor();
        }
        const scroller = panel.locator("[data-comments-scroll]");
        await scroller.getByText("ความเห็นตัวอย่างที่ 25").waitFor();
        const threads = () => scroller.locator(":scope > ol > li").count();
        assert.equal(await threads(), 20, `${label}: first page holds 20 threads`);
        const order = await scroller.locator(":scope > ol > li").allInnerTexts();
        const at = (n: number) => order.findIndex((t) => t.includes(`ความเห็นตัวอย่างที่ ${n}\n`) || t.endsWith(`ความเห็นตัวอย่างที่ ${n}`));
        assert.ok(at(25) >= 0 && at(25) < at(24) && at(24) < at(23), `${label}: newest thread first`);

        // The panel scrolls on its own; the page stays put.
        const pageY = await page.evaluate(() => window.scrollY);
        const moved = await scroller.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
          return el.scrollTop;
        });
        assert.ok(moved > 0, `${label}: comment list scrolls inside its panel`);
        assert.equal(await page.evaluate(() => window.scrollY), pageY, `${label}: page did not scroll with the panel`);
        await scroller.getByRole("button", { name: "แสดงเพิ่ม" }).click();
        await scroller.getByText("ความเห็นตัวอย่างที่ 1", { exact: true }).waitFor();
        assert.ok((await threads()) > 20, `${label}: แสดงเพิ่ม loads older threads`);
        await scroller.evaluate((el) => (el.scrollTop = 0));

        const text = `ทดสอบจากเบราว์เซอร์ ${label}`;
        await panel.getByLabel(/เขียนคอมเมนต์เกี่ยวกับ/).fill(text);
        await panel.getByRole("button", { name: "ส่ง", exact: true }).click();
        await scroller.getByText(text).waitFor();
        await panel.getByText(/แสดงในชื่อ “App Member/).waitFor();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `.qa/interactions-ui-${label}.png` });
        await scroller.getByRole("button", { name: "ลบ" }).first().click();
        await scroller.getByText(text).waitFor({ state: "detached" });
        if (!desktop) {
          await page.keyboard.press("Escape");
          await panel.waitFor({ state: "hidden" });
        }
        await starScope.getByRole("button", { name: "ให้ดาวแล้ว" }).click();
        await starScope.getByRole("button", { name: "ให้ดาว", exact: true }).waitFor();
        // The tool index shows the public count on each card (member b's star).
        await page.goto("http://kubcode-ui.test/tools");
        const remotionStars = page.locator("main article").filter({ has: page.getByRole("heading", { name: "Remotion", exact: true }) }).locator("[data-stars]");
        await remotionStars.waitFor();
        assert.equal(await remotionStars.getAttribute("data-stars"), "1", `${label}: card star count`);
        assert.equal(await page.locator("main article [data-stars]").count(), 7, `${label}: every card shows a count`);
        await page.screenshot({ path: `.qa/tools-stars-${label}.png` });
        assert.deepEqual(errors, [], `console errors at ${label}`);
        await page.close();
        // Keep the 20 s comment interval out of the next run's way.
        await db.pool.query(
          `UPDATE kubcode_accounts.page_comments SET created_at = created_at - interval '1 minute'
            WHERE user_id = (SELECT user_id FROM kubcode_accounts.user_identities WHERE subject = 'g-app-5')`,
        );
      }
    } finally {
      await browser.close();
    }
    step("browser UI (desktop rail and mobile sheet, light + dark): star, 20-thread pages + แสดงเพิ่ม, panel scrolls without moving the page, comment, delete, unstar, card star counts on /tools");

    // Header account control: avatar from the provider host (served locally
    // here), initial fallback, signed-out pill, and the menu's keyboard and
    // pointer behaviour.
    const PIC = "https://lh3.googleusercontent.com/a/fixture-avatar=s96-c";
    const withPic = await member({ picture: PIC });
    const noPic = await member();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMAAABjfAgQfr0nMAAAAAElFTkSuQmCC",
      "base64",
    );
    const navBrowser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: [`--host-resolver-rules=MAP kubcode-ui.test 127.0.0.1:${port}`],
    });
    try {
      const open = async (cookie: string, run: { width: number; theme: string }) => {
        const page = await navBrowser.newPage({ viewport: { width: run.width, height: 760 } });
        await page.addInitScript((t) => {
          try {
            localStorage.setItem("jk-theme", t);
          } catch {}
        }, run.theme);
        const imageRequests: Array<string | undefined> = [];
        await page.route("https://lh3.googleusercontent.com/**", async (route) => {
          imageRequests.push(route.request().headers()["referer"]);
          await route.fulfill({ status: 200, contentType: "image/png", body: png });
        });
        // The browser speaks plain http here, so it would drop the __Host-/
        // __Secure- cookies the server sets (e.g. NextAuth's CSRF cookie).
        // A small jar in the proxy keeps them, as an https browser would.
        const jar = new Map<string, string>();
        for (const part of cookie.split(/;\s*/).filter(Boolean)) {
          const eq = part.indexOf("=");
          jar.set(part.slice(0, eq), part.slice(eq + 1));
        }
        await page.route("http://kubcode-ui.test/**", async (route) => {
          const { pathname, search } = new URL(route.request().url());
          let response;
          try {
            response = await route.fetch({
              url: `http://127.0.0.1:${port}${pathname}${search}`,
              headers: {
                ...route.request().headers(),
                host: "kubcode.dev",
                origin: "https://kubcode.dev",
                "x-forwarded-proto": "https",
                cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
              },
              maxRedirects: 0,
            });
          } catch {
            return; // the page closed while this request was in flight
          }
          for (const h of response.headersArray()) {
            if (h.name.toLowerCase() !== "set-cookie") continue;
            const [pair, ...attrs] = h.value.split(";");
            const eq = pair.indexOf("=");
            const name = pair.slice(0, eq).trim();
            const value = pair.slice(eq + 1).trim();
            const expired = value === "" || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
            if (expired) jar.delete(name);
            else jar.set(name, value);
          }
          await route.fulfill({ response }).catch(() => undefined); // page may be closing
        });
        await page.goto("http://kubcode-ui.test/articles");
        return { page, imageRequests, jar, nav: page.getByRole("navigation", { name: "หลัก" }) };
      };

      // Signed out: a เข้าสู่ระบบ pill, no member link.
      {
        const { page, nav } = await open("", { width: 1280, theme: "dark" });
        await nav.getByRole("link", { name: "เข้าสู่ระบบ", exact: true }).waitFor();
        assert.equal(await nav.getByRole("link", { name: "เข้าสู่ระบบ" }).getAttribute("href"), "/account");
        assert.equal(await nav.getByText("พื้นที่สมาชิก").count(), 0);
        await page.screenshot({ path: ".qa/nav-signed-out-1280-dark.png", clip: { x: 0, y: 0, width: 1280, height: 110 } });
        await page.close();
      }
      // No picture: the initial on purple.
      {
        const { page, nav } = await open(noPic, { width: 1280, theme: "light" });
        const btn = nav.getByRole("button", { name: /^บัญชีของ App Member/ });
        await btn.waitFor();
        assert.equal(await btn.locator("img").count(), 0);
        assert.equal((await btn.innerText()).trim(), "A");
        await page.close();
      }
      for (const run of [
        { width: 1280, theme: "dark" },
        { width: 1280, theme: "light" },
        { width: 390, theme: "dark" },
        { width: 390, theme: "light" },
      ]) {
        const label = `${run.width}-${run.theme}`;
        const { page, nav, imageRequests, jar } = await open(withPic, run);
        const btn = nav.getByRole("button", { name: /^บัญชีของ App Member/ });
        await btn.waitFor();
        await btn.locator("img").waitFor();
        await page.waitForFunction(() => (document.querySelector("nav img") as HTMLImageElement | null)?.complete === true);
        assert.equal(await btn.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth > 0), true, `${label}: avatar loaded`);
        assert.ok(imageRequests.length > 0 && imageRequests.every((r) => r === undefined), `${label}: no Referer to the image host`);
        assert.equal(await btn.getAttribute("aria-expanded"), "false");

        await btn.click();
        assert.equal(await btn.getAttribute("aria-expanded"), "true");
        const panel = page.locator(`#${(await btn.getAttribute("aria-controls"))!.replace(/:/g, "\\:")}`);
        await panel.getByText(/App Member/).waitFor();
        const box = await panel.boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= run.width, `${label}: menu stays on screen`);
        await page.screenshot({ path: `.qa/nav-menu-${label}.png`, clip: { x: 0, y: 0, width: run.width, height: 260 } });

        await page.keyboard.press("Escape");
        assert.equal(await btn.getAttribute("aria-expanded"), "false");
        assert.equal(await btn.evaluate((b) => b === document.activeElement), true, `${label}: Esc returns focus`);

        await page.keyboard.press("Enter");
        assert.equal(await btn.getAttribute("aria-expanded"), "true", `${label}: keyboard opens`);
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.textContent), "ตั้งค่าบัญชี", `${label}: Tab enters the menu`);
        await page.mouse.click(run.width / 2, 600);
        assert.equal(await btn.getAttribute("aria-expanded"), "false", `${label}: outside click closes`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${label}: no horizontal scroll`);
        if (label === "1280-dark") {
          // Sign out without next-auth/react: CSRF token, POST signout, go to /account.
          await btn.click();
          const signout = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/signout");
          await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
          const res = await signout;
          assert.equal(res.status(), 200, "signout accepted (CSRF ok)");
          // Set-Cookie is hidden from page-side responses; the proxy's jar
          // records what the server actually sent.
          assert.equal(jar.has("__Secure-next-auth.session-token"), false, "server cleared the session cookie");
          await page.waitForURL("**/account");
          await page.getByRole("navigation", { name: "หลัก" }).getByRole("link", { name: "เข้าสู่ระบบ", exact: true }).waitFor();
        }
        await page.close();
      }
    } finally {
      await navBrowser.close();
    }
    step("header: signed-out pill; avatar from provider host with no Referer; initial fallback; menu opens by click/Enter, Tab enters, Esc returns focus, outside click closes (desktop + mobile, light + dark); sign out clears the session and shows the pill");

    writeFileSync(".qa/interactions-actual-app.json", JSON.stringify({ status: "passed", fictionalMembers: true, steps }, null, 2));
    console.log(`PASS interactions actual app (${steps.length} steps)\n- ${steps.join("\n- ")}`);
  } finally {
    server?.kill("SIGTERM");
    await db.pool.query("ALTER ROLE kubcode_app NOLOGIN PASSWORD NULL").catch(() => undefined);
    await db.cleanup();
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
