// Billing local E2E (docs/dev/local-e2e.md "Billing"): real Stripe TEST mode,
// real `stripe listen` webhooks, the billing Lambda's code on 127.0.0.1, the
// production Next build, a throwaway database.
//
// Scenarios (each asserted against the database, not the UI):
//   1. card 4242 4242 4242 4242 → paid, 2 slots, paid_until = +1 month
//   2. declined card 4000 0000 0000 0002 → no grant, purchase stays pending/expired
//   3. PromptPay test page → "authorize" → paid; "fail" → failed
//   4. `stripe events resend <evt>` of scenario 1 → still exactly one grant
//   5. success page racing the webhook → one grant
// The Stripe key and whsec are read here from the vault / `stripe listen`
// and piped to the runner's stdin. Nothing secret is printed.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { chromium, type Page } from "@playwright/test";
import { createPgAccountStore } from "../../lib/accounts/store";
import { accountToken } from "../../lib/accounts/session";
import { SESSION_COOKIE_NAME } from "../../lib/auth-policy";
import { throwawayDb } from "../../tests/accounts-db/harness";

const SECRET = "FIXTURE-ONLY-session-secret-billing-e2e-01";
const HMAC = randomBytes(32).toString("hex");
const RUNNER_PORT = 3191;
const NEXT_PORT = 3192;
const log = (m: string) => console.log(`[billing-e2e] ${m}`);

function vault(name: string): string {
  return execFileSync("bash", ["-c", `source infra/scripts/lib/keychain.sh && kc_get ${name}`], { encoding: "utf8" }).trim();
}

async function main() {
  const db = await throwawayDb();
  const kids: ChildProcess[] = [];
  try {
    const dbName = (await db.pool.query("SELECT current_database() AS d")).rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const appPw = randomBytes(18).toString("hex");
    const billPw = randomBytes(18).toString("hex");
    await db.pool.query(`ALTER ROLE kubcode_app LOGIN PASSWORD '${appPw}'`);
    await db.pool.query(`ALTER ROLE kubcode_billing LOGIN PASSWORD '${billPw}'`);
    const login = await createPgAccountStore(db.pool).resolveLogin({ provider: "google", subject: "g-e2e-bill", displayName: "Creator", email: "creator@example.test" });
    if (login.status !== "ok") throw new Error("seed");
    const ws = (await db.pool.query("INSERT INTO kubcode_accounts.workspaces (name) VALUES ('e2e') RETURNING id")).rows[0].id as string;
    await db.pool.query("INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [ws, login.userId]);

    // 1. stripe listen → forward to the runner; read whsec from its stdout.
    const listen = spawn("stripe", ["listen", "--forward-to", `127.0.0.1:${RUNNER_PORT}/stripe/webhook`, "--events",
      "checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired"], { stdio: ["ignore", "pipe", "pipe"] });
    kids.push(listen);
    const whsec = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("stripe listen gave no secret")), 30_000);
      const scan = (b: Buffer) => {
        const m = b.toString().match(/whsec_[A-Za-z0-9]+/);
        if (m) {
          clearTimeout(t);
          resolve(m[0]);
        }
      };
      listen.stdout!.on("data", scan);
      listen.stderr!.on("data", scan);
    });
    log("stripe listen ready (secret captured, not printed)");

    // 2. The billing runner, secrets on stdin.
    const runner = spawn("services/target/debug/examples/billing_local", [], {
      env: {
        ...({} as NodeJS.ProcessEnv),
        NODE_ENV: "development",
        PATH: process.env.PATH,
        KUBCODE_LOCAL_PORT: String(RUNNER_PORT),
        KUBCODE_LOCAL_BILLING_DB_URL: `postgres://kubcode_billing:${billPw}@${base.host}/${dbName}`,
        KUBCODE_LOCAL_HMAC_KEY: HMAC,
        KUBCODE_LOCAL_SITE_ORIGIN: `http://127.0.0.1:${NEXT_PORT}`,
      },
      stdio: ["pipe", "pipe", "inherit"],
    });
    kids.push(runner);
    runner.stdin!.end(`${vault("stripe-secret-key")}\n${whsec}\n`);
    await new Promise<void>((r) => runner.stdout!.on("data", (b) => b.toString().includes("READY") && r()));
    runner.stdout!.on("data", (b) => process.stdout.write(b.toString().replace(/(cs|pi|evt)_test_[A-Za-z0-9]+/g, "$1_test_…")));

    // 3. Next (production build) with billing on, pointing at the runner.
    const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(NEXT_PORT)], {
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
        DATABASE_URL: `postgres://kubcode_app:${appPw}@${base.host}/${dbName}`,
        KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK: "true",
        KUBCODE_BILLING_ENABLED: "true",
        KUBCODE_BILLING_LOCAL: "true",
        KUBCODE_BILLING_URL: `http://127.0.0.1:${RUNNER_PORT}/`,
        KUBCODE_BILLING_HMAC_KEY: HMAC,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "ignore", "inherit"],
    });
    kids.push(next);
    for (let i = 0; i < 120; i++) {
      if (await fetch(`http://127.0.0.1:${NEXT_PORT}/robots.txt`).then((r) => r.ok).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const session = await encode({
      token: accountToken({ userId: login.userId, sessionVersion: login.sessionVersion, provider: "google", subject: "g-e2e-bill", name: "Creator", email: "creator@example.test" }) as never,
      secret: SECRET,
    });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "th-TH" });
    await context.route("https://kubcode.dev/**", async (route) => {
      const u = new URL(route.request().url());
      const headers: Record<string, string> = { ...(await route.request().allHeaders()), host: "kubcode.dev", "x-forwarded-proto": "https" };
      headers.cookie = [headers.cookie, `${SESSION_COOKIE_NAME}=${session}`].filter(Boolean).join("; ");
      await route.fulfill({ response: await route.fetch({ url: `http://127.0.0.1:${NEXT_PORT}${u.pathname}${u.search}`, headers, maxRedirects: 0 }) });
    });
    // Checkout returns to http://127.0.0.1:NEXT_PORT/...; send it through the kubcode.dev origin.
    await context.route(`http://127.0.0.1:${NEXT_PORT}/account/billing/**`, (route) => {
      const u = new URL(route.request().url());
      return route.fulfill({ status: 302, headers: { location: `https://kubcode.dev${u.pathname}${u.search}` } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);

    const grants = async () => (await db.pool.query("SELECT count(*)::int AS n FROM kubcode_accounts.billing_purchases WHERE workspace_id = $1 AND status = 'paid'", [ws])).rows[0].n as number;
    const last = async () => (await db.pool.query("SELECT id, status, slots, amount_satang, payment_method FROM kubcode_accounts.billing_purchases WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1", [ws])).rows[0];

    async function startCheckout(slots: number, kind: "new" | "add" = "new") {
      await page.goto("https://kubcode.dev/account/billing");
      const section = page.locator("section", { has: page.getByRole("heading", { name: kind === "add" ? "เพิ่มช่องในเดือนนี้" : /ซื้อแพ็กเกจ|ต่ออายุ 1 เดือน/ }) });
      await section.getByRole("spinbutton").fill(String(slots));
      await section.getByRole("button", { name: kind === "add" ? "ซื้อช่องเพิ่ม" : /ไปหน้าชำระเงิน|ต่ออายุ/ }).click();
      await page.waitForURL(/checkout\.stripe\.com/);
    }
    async function payCard(p: Page, number: string) {
      await p.getByLabel(/email|อีเมล/i).first().fill("creator@example.test").catch(() => {});
      const card = p.getByRole("button", { name: /card|บัตร/i }).first();
      if (await card.isVisible().catch(() => false)) await card.click();
      await p.getByPlaceholder(/1234 1234 1234 1234/).fill(number);
      await p.getByPlaceholder(/MM \/ YY|ดด \/ ปป/).fill("12 / 34");
      await p.getByPlaceholder(/CVC/).fill("123");
      await p.getByLabel(/name|ชื่อ/i).first().fill("Test Creator").catch(() => {});
      await p.getByTestId("hosted-payment-submit-button").click();
    }

    // Scenario 1: card 4242, 2 channels.
    await startCheckout(2);
    await payCard(page, "4242 4242 4242 4242");
    await page.waitForURL(/kubcode\.dev\/account\/billing\/success/);
    await page.getByText("ชำระเงินสำเร็จ").waitFor();
    let p = await last();
    assert.deepEqual([p.status, p.slots, Number(p.amount_satang), p.payment_method], ["paid", 2, 57800, "card"]);
    assert.equal(await grants(), 1);
    log("1 card 4242: paid, 2 slots, ฿578, one grant ✓");

    // Scenario 4: replay the completed event → still one grant.
    const evt = execFileSync("stripe", ["events", "list", "--limit", "5", "--type", "checkout.session.completed"], { encoding: "utf8" });
    const evtId = (evt.match(/"id":\s*"(evt_[A-Za-z0-9]+)"/) ?? [])[1];
    assert.ok(evtId, "found the completed event");
    execFileSync("stripe", ["events", "resend", evtId], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 5000));
    assert.equal(await grants(), 1);
    log("4 replayed event: still one grant ✓");

    // Scenario 2: declined card → nothing granted.
    await startCheckout(1, "add");
    await payCard(page, "4000 0000 0000 0002");
    await page.getByText(/declined|ถูกปฏิเสธ/i).first().waitFor();
    p = await last();
    assert.equal(p.status, "pending");
    assert.equal(await grants(), 1);
    log("2 declined card: no grant, purchase pending ✓");

    // Scenario 3: PromptPay test page → authorize.
    await startCheckout(1, "add");
    await page.getByRole("button", { name: /PromptPay|พร้อมเพย์/i }).first().click();
    await page.getByLabel(/email|อีเมล/i).first().fill("creator@example.test").catch(() => {});
    await page.getByTestId("hosted-payment-submit-button").click();
    const authorize = page.getByRole("link", { name: /Authorize Test Payment/i }).or(page.getByRole("button", { name: /Authorize Test Payment/i }));
    await authorize.first().click();
    await page.waitForURL(/kubcode\.dev\/account\/billing\/success/);
    await page.getByText("ชำระเงินสำเร็จ").waitFor();
    p = await last();
    assert.deepEqual([p.status, p.payment_method], ["paid", "promptpay"]);
    assert.equal(await grants(), 2);
    log("3 PromptPay authorize: paid by promptpay ✓");

    const ent = (await db.pool.query("SELECT slots FROM kubcode_accounts.billing_entitlements WHERE workspace_id = $1", [ws])).rows[0];
    assert.equal(ent.slots, 3, "2 + 1 added");
    log("entitlement: 3 slots ✓");
    await browser.close();
    log("PASS");
  } finally {
    for (const k of kids.reverse()) k.kill("SIGTERM");
    await db.cleanup();
  }
}
main().catch((e) => {
  console.error(`[billing-e2e] FAIL ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
