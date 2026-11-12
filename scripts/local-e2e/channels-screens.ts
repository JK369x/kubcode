// Screenshots of /account/channels and a TikTok automations page with
// fixture data (desktop and 390 px), against the production build and a
// throwaway database. No provider call: these pages only read our database.
//
//   KUBCODE_TEST_DATABASE_URL=... npm run build && npx tsx scripts/local-e2e/channels-screens.ts
// KUBCODE_SCREENS_OUT=<dir> writes elsewhere; KUBCODE_SCREENS_ALL=1 adds light
// theme, 1440 px and the Instagram automations form (with a field error).
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
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
const OUT = process.env.KUBCODE_SCREENS_OUT ?? ".qa/local-e2e/channels";

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
    const profile = { provider: "google" as const, subject: "g-screens", displayName: "Owner", email: "screens@example.test" };
    const login = await createPgAccountStore(db.pool).resolveLogin(profile);
    if (login.status !== "ok") throw new Error("seed login");
    const uid = login.userId;
    await db.pool.query("UPDATE kubcode_accounts.users SET is_owner = true WHERE id = $1", [uid]);
    const ws = (await db.pool.query("INSERT INTO kubcode_accounts.workspaces (name) VALUES ('kubcode') RETURNING id")).rows[0].id;
    await db.pool.query("INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [ws, uid]);
    const ch = async (platform: string, name: string, handle: string, status: "active" | "needs_reconnect" | "revoked") => {
      const id = (
        await db.pool.query(
          "INSERT INTO kubcode_accounts.channels (workspace_id, platform, display_name, handle) VALUES ($1, $2, $3, $4) RETURNING id",
          [ws, platform, name, handle],
        )
      ).rows[0].id as string;
      await db.pool.query(
        `INSERT INTO kubcode_accounts.channel_connections (channel_id, provider, provider_ref, status, revoked_at)
         VALUES ($1, 'zernio', $2, $3, CASE WHEN $3 = 'revoked' THEN now() END)`,
        [id, `acct-${randomBytes(6).toString("hex")}`, status],
      );
      return id;
    };
    await ch("youtube", "โลกอีกแบบ", "โลกอกแบบ", "revoked");
    await ch("youtube", "โลกอีกแบบ", "โลกอกแบบ", "revoked");
    const ig = await ch("instagram", "kube.code", "kube.code", "active");
    const tt = await ch("tiktok", "kubcode", "kubcode", "active");
    await ch("youtube", "kubcode", "kubcode", "needs_reconnect");

    const token = accountToken({ userId: uid, sessionVersion: login.sessionVersion, provider: "google", subject: profile.subject, name: "Owner", email: profile.email });
    const session = await encode({ token: token as never, secret: SECRET });
    const csrf = randomBytes(32).toString("base64url");
    const port = await freePort();
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      env: {
        ...process.env,
        NEXTAUTH_URL: "https://kubcode.dev",
        NEXTAUTH_SECRET: SECRET,
        GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
        LINE_CLIENT_ID: "2000000001",
        LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
        NODE_ENV: "production",
        KUBCODE_ACCOUNTS_ENABLED: "true",
        KUBCODE_PUBLISHING_ENABLED: "true",
        KUBCODE_AUTOMATIONS_ENABLED: "true",
        KUBCODE_PUBLISHING_URL: FAKE_LAMBDA,
        KUBCODE_PUBLISHING_HMAC_KEY: randomBytes(32).toString("hex"),
        DATABASE_URL: `postgres://kubcode_app:${appPassword}@${base.host}/${dbName}`,
        KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK: "true",
        NEXT_PUBLIC_MEDIA_MODE: "licensed-only",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "ignore", "inherit"],
    });
    for (let i = 0; i < 120; i++) {
      if (await fetch(`http://127.0.0.1:${port}/robots.txt`).then((r) => r.ok).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const all = process.env.KUBCODE_SCREENS_ALL === "1";
    const runs = all
      ? (["dark", "light"] as const).flatMap((theme) =>
          ([["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844 }]] as const).map(
            ([w, viewport]) => [`${w}-${theme}`, viewport, theme] as const,
          ),
        )
      : ([["desktop", { width: 1280, height: 900 }, "dark"], ["mobile-390", { width: 390, height: 844 }, "dark"]] as const);
    for (const [name, viewport, theme] of runs) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript((t) => localStorage.setItem("jk-theme", t), theme);
      await context.route("https://kubcode.dev/**", async (route) => {
        const u = new URL(route.request().url());
        // Plain-http browser: Secure cookies (session, CSRF double-submit) are injected per request.
        const headers = { ...(await route.request().allHeaders()), host: "kubcode.dev", origin: "https://kubcode.dev", "x-forwarded-proto": "https", cookie: `${SESSION_COOKIE_NAME}=${session}; ${CSRF_COOKIE}=${csrf}` };
        await route.fulfill({ response: await route.fetch({ url: `http://127.0.0.1:${port}${u.pathname}${u.search}`, headers, maxRedirects: 0 }) });
      });
      const page = await context.newPage();
      await page.goto("https://kubcode.dev/account/channels?notice=connected");
      await page.getByRole("heading", { name: "ช่องที่เชื่อมไว้" }).waitFor();
      assert.equal(await page.getByRole("button", { name: /เชื่อม TikTok/ }).count(), 1);
      assert.equal(await page.getByText("ยกเลิกการเชื่อมแล้ว").count(), 0, "disconnected rows are not in the main list");
      await page.getByText("ช่องที่ยกเลิกแล้ว (2)").waitFor();
      await page.screenshot({ path: `${OUT}/channels-${name}.png`, fullPage: true });
      // The confirm names the channel and warns about scheduled posts; dismissed.
      let question = "";
      page.once("dialog", (d) => {
        question = d.message();
        void d.dismiss();
      });
      await page.getByRole("listitem").filter({ hasText: "@kubcode" }).filter({ hasText: "TikTok" }).getByRole("button", { name: "ยกเลิกการเชื่อม" }).click();
      assert.match(question, /ยกเลิกการเชื่อม TikTok @kubcode/);
      assert.match(question, /โพสต์ที่ตั้งเวลาไว้กับช่องนี้จะไม่ถูกโพสต์/);
      await page.goto(`https://kubcode.dev/account/channels/${tt}/automations`);
      await page.getByText("TikTok ตอบได้แค่ในคอมเมนต์ ส่ง DM ไม่ได้").first().waitFor();
      assert.equal(await page.getByLabel("ข้อความ DM").count(), 0, "no DM field on TikTok");
      await page.screenshot({ path: `${OUT}/automations-tiktok-${name}.png`, fullPage: true });
      if (all) {
        await page.goto(`https://kubcode.dev/account/channels/${ig}/automations`);
        await page.getByLabel("ข้อความ DM").waitFor();
        await page.screenshot({ path: `${OUT}/automations-instagram-${name}.png`, fullPage: true });
        // Submit with a keyword list the server rejects (21 words): the error
        // shows under the field and focus moves there.
        await page.getByLabel("คีย์เวิร์ด").fill(Array.from({ length: 21 }, (_, i) => `k${i}`).join(", "));
        await page.getByLabel("ข้อความ DM").fill("ขอบคุณนะ https://kubcode.dev/go/x");
        await page.getByRole("button", { name: "เพิ่มกฎ" }).click();
        await page.waitForTimeout(800);
        const focused = await page.evaluate(() => document.activeElement?.id ?? "");
        const invalid = await page.getByLabel("คีย์เวิร์ด").getAttribute("aria-invalid");
        console.log(`[channels-screens] ${name}: field error focus=${focused} aria-invalid=${invalid}`);
        await page.getByLabel("คีย์เวิร์ด").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${OUT}/automations-instagram-error-${name}.png` });
      }
      await context.close();
    }
    await browser.close();
    console.log(`[channels-screens] PASS: screenshots in ${OUT}`);
  } finally {
    next?.kill("SIGTERM");
    await db.cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
