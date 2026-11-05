// /account/keys and /api/keys/* against an actual Next production server and
// a real local PostgreSQL (throwaway database, runtime role kubcode_app).
// FICTIONAL members only; sessions are minted with a fixture secret. Saves are
// sealed with the committed production wrap public key (slot 1); nothing here
// can decrypt them, so only the envelope shape is checked. Requires a prior
// `next build` and
// KUBCODE_TEST_DATABASE_URL (loopback, database name containing "test").
// Run: npm run test:keys-app
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
const OUT = ".qa/keys-actual-app";

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
    await db.pool.query(`ALTER ROLE kubcode_app LOGIN PASSWORD '${appPassword}'`);
    const dbName = (await db.pool.query("SELECT current_database() AS d")).rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const appUrl = `postgres://kubcode_app:${appPassword}@${base.host}/${dbName}`;

    const accounts = createPgAccountStore(db.pool);
    let n = 0;
    async function member(owner: boolean) {
      const profile = { provider: "google" as const, subject: `g-keys-app-${++n}`, displayName: `Keys Member ${n}`, email: `keys${n}@example.test` };
      const r = await accounts.resolveLogin(profile);
      if (r.status !== "ok") throw new Error("login");
      await db.pool.query("UPDATE kubcode_accounts.users SET is_owner = $2 WHERE id = $1", [r.userId, owner]);
      const token = accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email });
      return { id: r.userId, cookie: `${SESSION_COOKIE_NAME}=${await encode({ token: token as never, secret: FIXTURE.NEXTAUTH_SECRET })}` };
    }
    const owner = await member(true);
    const guest = await member(false);
    // Seed what step 5 will create later: a saved Google client and one channel.
    await db.pool.query(
      `INSERT INTO kubcode_accounts.user_secrets (user_id, kind, public_value, envelope, key_slot, hint)
       VALUES ($1, 'youtube_oauth_client', '123456789012-fixtureonlyabc.apps.googleusercontent.com', $2, 1, 'ab12'),
              ($1, 'elevenlabs_api_key', NULL, $2, 1, 'wxyz')`,
      [owner.id, randomBytes(600)],
    );
    await db.pool.query(
      `INSERT INTO kubcode_accounts.oauth_connections (user_id, provider, external_account_id, account_label, app_secret_version, envelope, key_slot, last_checked_at)
       VALUES ($1, 'youtube', 'UC-fixture', 'Fixture Channel ช่องทดสอบ', 1, $2, 1, now())`,
      [owner.id, randomBytes(600)],
    );

    const port = await freePort();
    mkdirSync(OUT, { recursive: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      env: {
        ...process.env,
        ...FIXTURE,
        NODE_ENV: "production",
        KUBCODE_ACCOUNTS_ENABLED: "true",
        KUBCODE_KEYS_ENABLED: "true",
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

    // ---- HTTP: gates and wiring
    const signedOut = await call(port, "/account/keys");
    assert.ok([303, 307, 308].includes(signedOut.status), `signed out redirects (${signedOut.status})`);
    assert.match(String(signedOut.headers.location), /\/account$/);
    assert.equal((await call(port, "/account/keys", { headers: { cookie: guest.cookie } })).status, 404);
    const ownerPage = await call(port, "/account/keys", { headers: { cookie: owner.cookie } });
    assert.equal(ownerPage.status, 200);
    for (const text of ["ตั้งค่าคีย์และบัญชีโพสต์", "••••", "ab12", "wxyz", "Fixture Channel ช่องทดสอบ"])
      assert.ok(ownerPage.text.includes(text), `owner page shows ${text}`);
    assert.ok(!ownerPage.text.includes("ยังบันทึกคีย์ไม่ได้"), "no not-ready notice once the wrap key is set");
    assert.match(String(ownerPage.headers["x-robots-tag"] ?? "") + ownerPage.text, /noindex/);
    step("page: signed out → /account, non-owner 404, owner 200 with hints and channel, no not-ready notice; noindex");

    const csrf = (await call(port, "/api/account/csrf")).json().csrfToken as string;
    const write = (path: string, cookie: string, body: unknown, opts: { method?: string; origin?: string } = {}) =>
      call(port, path, {
        method: opts.method ?? "POST",
        body: JSON.stringify(body),
        headers: {
          origin: opts.origin ?? "https://kubcode.dev",
          "sec-fetch-site": "same-origin",
          "x-kubcode-csrf": csrf,
          "content-type": "application/json",
          cookie: `${CSRF_COOKIE}=${csrf}; ${cookie}`,
        },
      });
    const SAVE = { kind: "elevenlabs_api_key", publicValue: null, secret: "FIXTURE-ONLY-eleven-key-0000000009z8y" };
    assert.equal((await write("/api/keys/secrets", owner.cookie, SAVE, { origin: "https://evil.example" })).status, 403);
    assert.equal((await write("/api/keys/secrets", "", SAVE)).status, 401);
    assert.equal((await write("/api/keys/secrets", guest.cookie, SAVE)).json().code, "FORBIDDEN");
    const saved = await write("/api/keys/secrets", owner.cookie, SAVE);
    assert.equal(saved.status, 200, saved.text);
    assert.doesNotMatch(saved.text, /FIXTURE-ONLY-eleven/, "the secret never comes back");
    assert.deepEqual(
      (({ replaced, secret }) => ({ replaced, kind: secret.kind, hint: secret.hint, version: secret.version }))(saved.json()),
      { replaced: true, kind: "elevenlabs_api_key", hint: "9z8y", version: 2 },
    );
    const row = (await db.pool.query("SELECT envelope, key_slot FROM kubcode_accounts.user_secrets WHERE user_id = $1 AND kind = 'elevenlabs_api_key'", [owner.id])).rows[0];
    assert.equal(row.key_slot, 1);
    assert.equal(row.envelope.subarray(0, 4).toString("latin1"), "KCE1");
    assert.equal(row.envelope.readUInt8(4), 1, "sealed with wrap key v1");
    assert.equal(row.envelope.readUInt16BE(5), 512, "RSA-4096 wrapped DEK");
    assert.ok(!row.envelope.includes(Buffer.from("FIXTURE-ONLY-eleven")), "no plaintext in the envelope");
    step("API: bad origin 403, signed out 401, non-owner FORBIDDEN, owner save seals with wrap key v1 (KCE1, slot 1, 512-byte wrapped DEK), secret never echoed");

    // ---- Browser: layout, themes, and the delete flow through the real UI.
    const csrfFixture = randomBytes(32).toString("base64url");
    const browser = await chromium.launch({ headless: true, channel: "chrome" });
    try {
      const open = async (width: number, height: number, theme: "light" | "dark") => {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.addInitScript((t) => {
          try {
            localStorage.setItem("jk-theme", t);
          } catch {}
        }, theme);
        const errors: string[] = [];
        page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
        // Requests are replayed from Node with the headers the HTTPS edge adds
        // and this fixture owner's cookies (Secure cookies need https).
        await page.route("http://kubcode-ui.test/**", async (route) => {
          const { pathname, search } = new URL(route.request().url());
          const response = await route.fetch({
            url: `http://127.0.0.1:${port}${pathname}${search}`,
            headers: {
              ...route.request().headers(),
              host: "kubcode.dev",
              origin: "https://kubcode.dev",
              "x-forwarded-proto": "https",
              cookie: `${CSRF_COOKIE}=${csrfFixture}; ${owner.cookie}`,
            },
            maxRedirects: 0,
          });
          await route.fulfill({ response });
        });
        await page.goto("http://kubcode-ui.test/account/keys");
        await page.getByRole("heading", { name: "ตั้งค่าคีย์และบัญชีโพสต์" }).waitFor();
        return { page, errors };
      };

      for (const [width, height, theme] of [
        [1280, 900, "dark"],
        [1280, 900, "light"],
        [390, 844, "dark"],
        [390, 844, "light"],
      ] as const) {
        const label = `${width}-${theme}`;
        const { page, errors } = await open(width, height, theme);
        for (const name of ["YouTube", "Instagram", "คีย์อื่น", "ประวัติ"])
          await page.getByRole("heading", { name, level: 2 }).waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 0, `${label}: no horizontal scroll (${overflow}px)`);
        assert.equal(await page.getByRole("button", { name: "แทนที่คีย์" }).first().isDisabled(), true, `${label}: save waits for a typed secret`);
        assert.equal(await page.getByLabel("Client secret").isDisabled(), false, `${label}: secret field open once the wrap key is set`);
        assert.equal(await page.getByRole("button", { name: "เชื่อมช่อง" }).isDisabled(), true, `${label}: connect waits for step 5`);
        assert.equal(await page.getByLabel("Client secret").getAttribute("type"), "password");
        assert.equal(await page.getByLabel("Client ID").inputValue(), "123456789012-fixtureonlyabc.apps.googleusercontent.com");
        await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true });
        assert.deepEqual(errors, [], `${label}: no console errors`);
        await page.close();
      }
      step("browser: four sections, no horizontal scroll, connect disabled, save waits for input, secret field is a password input (1280/390 × dark/light)");

      const { page, errors } = await open(1280, 900, "dark");
      const youtube = page.getByRole("region", { name: "YouTube" });
      await youtube.getByRole("button", { name: "ลบคีย์" }).click();
      await youtube.getByRole("button", { name: "ยืนยันลบและยกเลิกการเชื่อม" }).waitFor();
      await youtube.getByRole("status").getByText(/บัญชีที่เชื่อมอยู่/).waitFor();
      await youtube.getByRole("button", { name: "ยืนยันลบและยกเลิกการเชื่อม" }).click();
      await youtube.getByText("ลบคีย์และยกเลิกการเชื่อม 1 บัญชีแล้ว").waitFor();
      await youtube.getByText("ยังไม่ได้ตั้งค่า").waitFor();
      await youtube.getByText("ยังไม่มีบัญชีที่เชื่อม").waitFor();
      const history = page.getByRole("region", { name: "ประวัติ" });
      await history.getByText("ลบคีย์ · Google OAuth client").waitFor();
      await history.getByText("ยกเลิกการเชื่อมบัญชี · YouTube").waitFor();
      await page.screenshot({ path: `${OUT}/after-delete.png`, fullPage: true });
      assert.deepEqual(errors, [], "delete flow: no console errors");
      await page.close();
      const left = await db.pool.query("SELECT kind FROM kubcode_accounts.user_secrets WHERE user_id = $1 ORDER BY kind", [owner.id]);
      assert.deepEqual(left.rows.map((r) => r.kind), ["elevenlabs_api_key"]);
      step("browser: delete in-use YouTube client → confirm → key and channel gone, history updated, DB agrees");

      // Save through the UI: Instagram app ID + secret.
      const ui = await open(390, 844, "light");
      const ig = ui.page.getByRole("region", { name: "Instagram" });
      await ig.getByLabel("Instagram app ID").fill("1234567890123456");
      await ig.getByLabel("Instagram app secret").fill("fixtureonly0000000000000000003c4d");
      await ig.getByRole("button", { name: "บันทึกคีย์" }).click();
      await ig.getByText("บันทึกคีย์แล้ว").waitFor();
      await ig.getByText("3c4d").waitFor();
      assert.equal(await ig.getByLabel("Instagram app secret").inputValue(), "", "secret field is cleared after saving");
      await ui.page.getByRole("region", { name: "ประวัติ" }).getByText("บันทึกคีย์ · Instagram app").waitFor();
      await ui.page.screenshot({ path: `${OUT}/after-save.png`, fullPage: true });
      assert.deepEqual(ui.errors, [], "save flow: no console errors");
      await ui.page.close();
      const igRow = (await db.pool.query("SELECT public_value, hint, key_slot FROM kubcode_accounts.user_secrets WHERE user_id = $1 AND kind = 'instagram_app'", [owner.id])).rows[0];
      assert.deepEqual(igRow, { public_value: "1234567890123456", hint: "3c4d", key_slot: 1 });
      step("browser: save Instagram app ID + secret on mobile → status, ••••3c4d, field cleared, history updated, DB row sealed in slot 1");
    } finally {
      await browser.close();
    }

    writeFileSync(`${OUT}/results.json`, JSON.stringify({ status: "passed", fictionalMembers: true, steps }, null, 2));
    console.log(`PASS keys actual app (${steps.length} steps)\n- ${steps.join("\n- ")}`);
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
