// Before/after screenshots for the site-wide redesign (owner, 2026-11-15),
// against a production build and a throwaway database. Signed-out pages need
// no session; signed-in pages get a fixture user with an active Social pass
// (2 slots) and three channels. No provider or Stripe call: every page here
// only reads our database.
//
//   KUBCODE_TEST_DATABASE_URL=... npm run build && \
//   KUBCODE_SCREENS_OUT=<dir> KUBCODE_SCREENS_LABEL=after \
//   KUBCODE_SCREENS_PATHS=/account,/account/billing npx tsx scripts/local-e2e/redesign-screens.ts
//
// KUBCODE_SCREENS_SERVE=1 keeps the server and database up (prints the URL and
// a session cookie for a browser) until the process is stopped.
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { encode } from "next-auth/jwt";
import { chromium } from "@playwright/test";
import { createPgAccountStore } from "../../lib/accounts/store";
import { accountToken } from "../../lib/accounts/session";
import { SESSION_COOKIE_NAME } from "../../lib/auth-policy";
import { CSRF_COOKIE } from "../../lib/accounts/http";
import { throwawayDb } from "../../tests/accounts-db/harness";

const SECRET = "FIXTURE-ONLY-session-secret-local-e2e-0000001";
const FAKE_LAMBDA = "https://localrunner0000000000000.lambda-url.ap-southeast-1.on.aws/";
const OUT = process.env.KUBCODE_SCREENS_OUT ?? ".qa/local-e2e/redesign";
const LABEL = process.env.KUBCODE_SCREENS_LABEL ?? "after";
const PATHS = (process.env.KUBCODE_SCREENS_PATHS ?? "/account").split(",").filter(Boolean);
const AXE = process.env.KUBCODE_AXE_PATH;

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise((r) => s.close(r));
  return port;
}

async function main() {
  const db = await throwawayDb();
  let next: ChildProcess | undefined;
  try {
    const appPassword = randomBytes(18).toString("hex");
    await db.pool.query(`ALTER ROLE kubcode_app LOGIN PASSWORD '${appPassword}'`);
    const dbName = (await db.pool.query("SELECT current_database() AS d")).rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const profile = { provider: "google" as const, subject: "g-redesign", displayName: "Ploy Maker", email: "ploy@example.test" };
    const login = await createPgAccountStore(db.pool).resolveLogin(profile);
    if (login.status !== "ok") throw new Error("seed login");
    const uid = login.userId;
    // Publishing is owner-only today (lib/channels/access.ts): KUBCODE_SCREENS_OWNER=1
    // shows the owner's view with channels; otherwise a paying creator's view.
    if (process.env.KUBCODE_SCREENS_OWNER === "1") await db.pool.query("UPDATE kubcode_accounts.users SET is_owner = true WHERE id = $1", [uid]);
    const ws = (await db.pool.query("INSERT INTO kubcode_accounts.workspaces (name) VALUES ('ploy') RETURNING id")).rows[0].id;
    await db.pool.query("INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [ws, uid]);
    const ch = async (platform: string, name: string, handle: string, status: "active" | "needs_reconnect") => {
      const id = (
        await db.pool.query("INSERT INTO kubcode_accounts.channels (workspace_id, platform, display_name, handle) VALUES ($1, $2, $3, $4) RETURNING id", [ws, platform, name, handle])
      ).rows[0].id as string;
      const conn = (
        await db.pool.query("INSERT INTO kubcode_accounts.channel_connections (channel_id, provider, provider_ref, status) VALUES ($1, 'zernio', $2, $3) RETURNING id", [id, `acct-${randomBytes(6).toString("hex")}`, status])
      ).rows[0].id as string;
      return { id, conn };
    };
    // KUBCODE_SCREENS_EMPTY=1: a paid member with no channels and no posts yet (empty states).
    const EMPTY = process.env.KUBCODE_SCREENS_EMPTY === "1";
    if (EMPTY) {
      /* channels and posts stay empty */
    } else {
    const ig = await ch("instagram", "Ploy Makes", "ploy.makes", "active");
    const tt = await ch("tiktok", "Ploy Makes", "ploymakes", "active");
    await ch("youtube", "Ploy Makes", "ploymakes", "needs_reconnect");
    // Two confirmed posts: one scheduled to IG + TikTok, one published on IG and rejected on TikTok.
    const asset = async (clip: string, kind: "video" | "cover") =>
      (
        await db.pool.query(
          `INSERT INTO kubcode_accounts.media_assets (workspace_id, clip_ref, kind, s3_key, sha256, bytes, content_type, width, height, seconds)
           VALUES ($1, $2, $3, $4, $5, 1000, $6, 1080, 1920, $7) RETURNING id`,
          [ws, clip, kind, `clips/${ws}/${clip}/${randomBytes(32).toString("hex")}.${kind === "video" ? "mp4" : "jpg"}`, randomBytes(32), kind === "video" ? "video/mp4" : "image/jpeg", kind === "video" ? 30 : null],
        )
      ).rows[0].id as string;
    const post = async (clip: string, text: string, deliveries: { c: { id: string; conn: string }; platform: string; status: string; at: string; error?: string }[]) => {
      const pid = (
        await db.pool.query(
          `INSERT INTO kubcode_accounts.posts (workspace_id, clip_ref, video_asset_id, cover_asset_id, title, description, status, confirm_digest, confirmed_at)
           VALUES ($1, $2, $3, $4, '', $5, 'confirmed', $6, now()) RETURNING id`,
          [ws, clip, await asset(clip, "video"), await asset(clip, "cover"), text, randomBytes(32)],
        )
      ).rows[0].id as string;
      for (const d of deliveries)
        await db.pool.query(
          `INSERT INTO kubcode_accounts.deliveries (post_id, channel_id, connection_id, provider, platform, publish_at, visibility, status, idempotency_key, last_error_code)
           VALUES ($1, $2, $3, 'zernio', $4, now() + $5::interval, 'public', $6, gen_random_uuid(), $7)`,
          [pid, d.c.id, d.c.conn, d.platform, d.at, d.status, d.error ?? null],
        );
    };
    await post("web-fixture-1", "ลองทำคลิปแนว What If ด้วย AI ใน 3 นาที\nคอมเมนต์คำว่า ลิงก์ รับไฟล์ skill", [
      { c: ig, platform: "instagram", status: "published", at: "-2 days" },
      { c: tt, platform: "tiktok", status: "rejected", at: "-2 days", error: "cover_missing" },
    ]);
    await post("web-fixture-2", "เบื้องหลังการทำ Podcast Shorts ตอนใหม่", [
      { c: ig, platform: "instagram", status: "scheduled", at: "1 day" },
      { c: tt, platform: "tiktok", status: "scheduled", at: "1 day" },
    ]);
    }
    await db.pool.query(
      `INSERT INTO kubcode_accounts.billing_purchases (workspace_id, kind, slots, amount_satang, period_start, period_end, status, paid_at)
       VALUES ($1, 'new', 2, 57800, now() - interval '10 days', now() + interval '20 days', 'paid', now() - interval '10 days')`,
      [ws],
    );
    await db.pool.query(
      "INSERT INTO kubcode_accounts.billing_entitlements (workspace_id, slots, period_start, paid_until) VALUES ($1, 2, now() - interval '10 days', now() + interval '20 days')",
      [ws],
    );
    const token = accountToken({ userId: uid, sessionVersion: login.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email });
    const session = await encode({ token: token as never, secret: SECRET });
    const csrf = randomBytes(16).toString("hex");

    const port = Number(process.env.KUBCODE_SCREENS_PORT ?? (await freePort()));
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXTAUTH_URL: "https://kubcode.dev",
        NEXTAUTH_SECRET: SECRET,
        GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
        LINE_CLIENT_ID: "2000000001",
        LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
        KUBCODE_ACCOUNTS_ENABLED: "true",
        KUBCODE_PUBLISHING_ENABLED: "true",
        KUBCODE_AUTOMATIONS_ENABLED: "true",
        KUBCODE_PUBLISHING_URL: FAKE_LAMBDA,
        KUBCODE_PUBLISHING_HMAC_KEY: randomBytes(32).toString("hex"),
        KUBCODE_BILLING_ENABLED: "true",
        KUBCODE_BILLING_LOCAL: "true",
        KUBCODE_BILLING_URL: "http://127.0.0.1:19999/",
        KUBCODE_BILLING_HMAC_KEY: randomBytes(32).toString("hex"),
        DATABASE_URL: `postgres://kubcode_app:${appPassword}@${base.host}/${dbName}`,
        KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK: "true",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "ignore", "inherit"],
    });
    for (let i = 0; i < 120; i++) {
      if (await fetch(`http://127.0.0.1:${port}/robots.txt`).then((r) => r.ok).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    const browser = await chromium.launch({ channel: "chrome" });
    const shoot = async (signedIn: boolean, path: string, w: number, theme: "dark" | "light") => {
      const context = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 1000 }, deviceScaleFactor: w < 600 ? 2 : 1 });
      await context.addInitScript((t) => localStorage.setItem("jk-theme", t), theme);
      await context.route("https://kubcode.dev/**", async (route) => {
        const u = new URL(route.request().url());
        const headers: Record<string, string> = { ...(await route.request().allHeaders()), host: "kubcode.dev", origin: "https://kubcode.dev", "x-forwarded-proto": "https" };
        headers.cookie = signedIn ? `${SESSION_COOKIE_NAME}=${session}; ${CSRF_COOKIE}=${csrf}` : `${CSRF_COOKIE}=${csrf}`;
        try {
          await route.fulfill({ response: await route.fetch({ url: `http://127.0.0.1:${port}${u.pathname}${u.search}`, headers, maxRedirects: 0 }) });
        } catch {
          /* page closed */
        }
      });
      // Composer screenshots only: answer the upload presign and the S3 PUT
      // locally, so the live preview can show a picked cover and caption.
      if (path === "/account/posts/new") {
        await context.route("https://kubcode.dev/api/posts/upload", (route) =>
          route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assetId: crypto.randomUUID(), upload: { url: "https://upload.fixture.invalid/put", headers: {} } }) }),
        );
        await context.route("https://upload.fixture.invalid/**", (route) => route.fulfill({ status: 200, body: "" }));
      }
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const r = await page.goto(`https://kubcode.dev${path}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);
      if (path === "/account/posts/new" && process.env.KUBCODE_SCREENS_PROBLEMS === "1") {
        // Send with nothing filled in: the error summary shows and focus moves to the first field.
        await page.getByRole("button", { name: /เลือกช่องก่อนโพสต์|โพสต์ลง/ }).click();
        await page.waitForTimeout(800);
      } else if (path === "/account/posts/new" && process.env.KUBCODE_SCREENS_COVER) {
        await page.locator('input[type="file"][accept^="image"]').setInputFiles(process.env.KUBCODE_SCREENS_COVER);
        await page.getByLabel("แคปชัน", { exact: true }).fill("ลองทำคลิปแนว What If ด้วย AI ใน 3 นาที 🎬\nคอมเมนต์คำว่า ลิงก์ รับไฟล์ skill ทาง DM");
        for (const box of await page.locator('#channels input[type="checkbox"]:not([disabled])').all()) await box.check();
        // Step 4: open TikTok and send it as a draft, so one row shows a changed summary.
        if (process.env.KUBCODE_SCREENS_OPEN_STEP4 === "1") {
          await page.locator("#platform-options").getByRole("button", { name: /@ploymakes/ }).click();
          await page.getByLabel(/ส่งเป็นร่างไปที่แอป TikTok/).check();
        }
        await page.waitForTimeout(1500);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      let axe: string[] = [];
      if (AXE) {
        await page.addScriptTag({ content: readFileSync(AXE, "utf8") });
        axe = await page.evaluate(async () => {
          const w = window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } };
          const res = await w.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] });
          return res.violations.map((v) => `${v.id}:${v.nodes.length}`);
        });
      }
      const slug = path.replace(/^\//, "").replace(/[/?=&#]+/g, "_") || "home";
      const who = signedIn ? (process.env.KUBCODE_SCREENS_OWNER === "1" ? "owner" : process.env.KUBCODE_SCREENS_EMPTY === "1" ? "empty" : "in") : "out";
      const file = `${OUT}/${LABEL}-${who}-${slug}-${w}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(JSON.stringify({ file, status: r?.status(), overflow, axe, errors: errors.slice(0, 2) }));
      await context.close();
    };
    mkdirSync(OUT, { recursive: true });
    if (process.env.KUBCODE_SCREENS_SERVE === "1") {
      console.log(`READY http://127.0.0.1:${port} (send Host: kubcode.dev, x-forwarded-proto: https)`);
      console.log(`SESSION ${SESSION_COOKIE_NAME}=${session}`);
      await new Promise(() => undefined);
    }
    for (const path of PATHS) {
      // "/account?out" or any path ending in "#out": signed-out only.
      const signedOutOnly = path === "/account?out" || path.endsWith("#out");
      const real = path === "/account?out" ? "/account" : path.replace(/#out$/, "");
      for (const signedIn of signedOutOnly ? [false] : path === "/account" ? [false, true] : [true]) {
        for (const [w, t] of [[1440, "dark"], [1440, "light"], [390, "dark"]] as const) await shoot(signedIn, real, w, t);
      }
    }
    await browser.close();
  } finally {
    next?.kill();
    await db.cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
