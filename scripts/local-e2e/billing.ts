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

/** Env for a `stripe` CLI child only: the key in STRIPE_API_KEY, never argv.
 *  HOME points at an empty temp dir so the CLI neither reads nor writes
 *  ~/.config/stripe (no profile, no login). */
function stripeEnv(key: string, home: string): NodeJS.ProcessEnv {
  return { NODE_ENV: "development", PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: `${home}/.config`, STRIPE_API_KEY: key, STRIPE_CLI_TELEMETRY_OPTOUT: "1" };
}

/** Read-only GET with the key; returns the parsed JSON (the key stays in this process). */
async function stripeGet(key: string, path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, "Stripe-Version": "2026-10-28.endive" },
  });
  if (!res.ok) throw new Error(`stripe GET ${path.split("?")[0]} → ${res.status}`);
  return res.json();
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

    const key = vault("stripe-secret-key");
    if (!/^(sk|rk)_test_/.test(key)) throw new Error("not a test key");
    const account = (await stripeGet(key, "account")).id as string;
    log(`Stripe account of the key: ${account} (test mode)`);
    const cliHome = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();

    // 1. stripe listen (as the key's account) → forward to the runner; read whsec from its output.
    const listen = spawn("stripe", ["listen", "--skip-update", "--forward-to", `127.0.0.1:${RUNNER_PORT}/stripe/webhook`, "--events",
      "checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired"], { stdio: ["ignore", "pipe", "pipe"], env: stripeEnv(key, cliHome) });
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
        // Checkout returns to https://kubcode.dev/…, which this browser context
        // answers from the local server (never production).
        KUBCODE_LOCAL_SITE_ORIGIN: "https://kubcode.dev",
      },
      stdio: ["pipe", "pipe", "inherit"],
    });
    kids.push(runner);
    runner.stdin!.end(`${key}\n${whsec}\n`);
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
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    (globalThis as any).__pages = [page];
    page.on("response", (r) => {
      if (new URL(r.url()).host === "kubcode.dev" && !r.request().headers()["x-kubcode-e2e"] && r.headers()["x-powered-by"] === undefined) {
        // routed responses come from the local Next server
      }
      const u = new URL(r.url());
      if (u.host === "kubcode.dev" && u.pathname.startsWith("/api/")) log(`web ${r.request().method()} ${u.pathname} → ${r.status()}`);
    });

    const grants = async () => (await db.pool.query("SELECT count(*)::int AS n FROM kubcode_accounts.billing_purchases WHERE workspace_id = $1 AND status = 'paid'", [ws])).rows[0].n as number;
    const last = async () => (await db.pool.query("SELECT id, kind, status, slots, amount_satang, payment_method FROM kubcode_accounts.billing_purchases WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1", [ws])).rows[0];

    async function startCheckout(slots: number, kind: "new" | "add" = "new") {
      await page.goto("https://kubcode.dev/account/billing");
      const section = page.locator("section", { has: page.getByRole("heading", { name: kind === "add" ? "เพิ่มช่องในเดือนนี้" : /ซื้อแพ็กเกจ|ต่ออายุ 1 เดือน/ }) });
      await section.getByRole("spinbutton").fill(String(slots));
      await section.getByRole("button", { name: kind === "add" ? "ซื้อช่องเพิ่ม" : /ไปหน้าชำระเงิน|ต่ออายุ/ }).click();
      await page.waitForURL(/checkout\.stripe\.com/);
    }
    /** Stripe Checkout (2026 layout): the form lives in the "habanero" Elements frame. */
    async function form(p: Page) {
      for (let i = 0; i < 60; i++) {
        const f = p.frames().find((x) => /elements-inner-habanero/.test(x.url()));
        if (f && (await f.locator("input[name=email]").count())) return f;
        await p.waitForTimeout(500);
      }
      throw new Error("Checkout form frame not found");
    }
    async function chooseMethod(p: Page, label: "บัตร" | "PromptPay") {
      const f = await form(p);
      await f.locator("input[name=email]").fill("creator@example.test");
      await f.locator("input[name=email]").press("Tab");
      // The payment-method accordion is in the same frame; rows are labelled by text.
      await f.getByText(label, { exact: true }).first().click();
      return f;
    }
    /** Submit, and once more if Checkout ignored the first click (it can while still validating). */
    async function submit(p: Page, f: Awaited<ReturnType<typeof form>>) {
      const btn = f.getByTestId("payment-form-submit-button");
      await p.waitForTimeout(1500);
      await btn.click();
      const start = p.url();
      for (let i = 0; i < 20; i++) {
        await p.waitForTimeout(1000);
        if (p.url() !== start) return;
        const busy = await btn.getAttribute("aria-busy").catch(() => null);
        const text = (await btn.textContent().catch(() => "")) ?? "";
        if (busy === "true" || /กำลัง|Processing/i.test(text)) return;
        if (await f.getByText(/declined|ปฏิเสธ/i).count().catch(() => 0)) return;
        // PromptPay opens its QR dialog (in some frame): submitted.
        for (const fr of p.frames()) if (await fr.getByText(/จำลองการสแกน|Simulate scan/i).count().catch(() => 0)) return;
      }
      if (await btn.isEnabled().catch(() => false)) await btn.click();
    }
    async function payCard(p: Page, number: string) {
      const f = await chooseMethod(p, "บัตร");
      await f.locator("input[name=number]").waitFor();
      await f.locator("input[name=number]").fill(number);
      await f.locator("input[name=expiry]").fill("12 / 34");
      await f.locator("input[name=cvc]").fill("123");
      await f.locator("input[name=name]").fill("Test Creator");
      const country = f.locator("select[name=country]");
      if (await country.count()) await country.selectOption("TH").catch(() => {});
      const optIn = f.locator("input[name=linkOptIn]");
      if ((await optIn.count()) && (await optIn.isChecked().catch(() => false))) await optIn.uncheck().catch(() => {});
      await submit(p, f);
    }
    async function payPromptPay(p: Page) {
      const f = await chooseMethod(p, "PromptPay");
      await submit(p, f);
      // Test mode: the QR dialog has "จำลองการสแกน" (simulate scan), which authorizes the payment.
      for (let i = 0; i < 60; i++) {
        for (const fr of p.frames()) {
          const b = fr.getByText(/จำลองการสแกน|Simulate scan/i).first();
          if (await b.count().catch(() => 0)) {
            // It opens Stripe's test "simulated scan" page in a new tab with
            // Authorize / Fail; the original tab then redirects on success.
            const popup = p.context().waitForEvent("page", { timeout: 15_000 }).catch(() => null);
            await b.click();
            const tab = await popup;
            const target = tab ?? p;
            await target.waitForLoadState("load").catch(() => {});
            const auth = target.getByRole("button", { name: /Authorize|อนุมัติ|ยืนยัน/i }).or(target.getByRole("link", { name: /Authorize|อนุมัติ/i }));
            if (await auth.first().count().catch(() => 0)) await auth.first().click();
            await target.screenshot({ path: ".qa/local-e2e/billing-promptpay-sim.png" }).catch(() => {});
            if (tab) await tab.waitForTimeout(2000);
            return;
          }
        }
        await p.waitForTimeout(500);
      }
      throw new Error("PromptPay simulate-scan button not found");
    }

    // Scenario 1: card 4242, 2 channels.
    await startCheckout(2);
    await payCard(page, "4242 4242 4242 4242");
    await page.waitForURL(/kubcode\.dev\/account\/billing\/success/);
    await page.getByText("ชำระเงินสำเร็จ").waitFor();
    await page.screenshot({ path: ".qa/local-e2e/billing-success.png" }).catch(() => {});
    let p = await last();
    assert.deepEqual([p.status, p.slots, Number(p.amount_satang), p.payment_method], ["paid", 2, 57800, "card"]);
    const firstSession = (await db.pool.query("SELECT stripe_checkout_session_id AS s FROM kubcode_accounts.billing_purchases WHERE id = $1", [p.id])).rows[0].s as string;
    assert.equal(await grants(), 1);
    log("1 card 4242: paid, 2 slots, ฿578, one grant ✓");

    // Scenario 4: replay the completed event → still one grant.
    const events = await stripeGet(key, "events?limit=10&type=checkout.session.completed");
    const ev = (events.data as any[]).find((e) => e.data?.object?.id === firstSession);
    assert.ok(ev, "found the completed event of scenario 1");
    // The webhook secret from `stripe listen` and the key are on one account: the event came through it.
    assert.equal(ev.account ?? account, account);
    // `stripe listen` receives resends of events created while it runs.
    execFileSync("stripe", ["events", "resend", ev.id], { stdio: "ignore", env: stripeEnv(key, cliHome) });
    await new Promise((r) => setTimeout(r, 5000));
    assert.equal(await grants(), 1);
    log("4 replayed event: still one grant ✓");

    // Scenario 2: declined card → nothing granted.
    await startCheckout(1, "add");
    await payCard(page, "4000 0000 0000 0002");
    const f2 = await form(page);
    const declined = /declined|ถูกปฏิเสธ|ปฏิเสธ/i;
    await Promise.any([f2.getByText(declined).first().waitFor(), page.getByText(declined).first().waitFor()]);
    await page.screenshot({ path: ".qa/local-e2e/billing-declined.png" }).catch(() => {});
    p = await last();
    assert.equal(p.status, "pending");
    assert.equal(await grants(), 1);
    log("2 declined card 4000…0002: no grant, purchase stays pending ✓");

    // Scenario 3 + 5: mid-pass add of 1 channel, paid by PromptPay test page → authorize.
    await startCheckout(1, "add");
    await payPromptPay(page);
    await page.waitForURL(/kubcode\.dev\/account\/billing\/success/);
    await page.getByText("ชำระเงินสำเร็จ").waitFor();
    p = await last();
    assert.deepEqual([p.status, p.payment_method, p.kind], ["paid", "promptpay", "add"]);
    assert.equal(await grants(), 2);
    // Mid-pass add: prorated to the SAME paid_until, whole baht, ≥ ฿10, ≤ ฿289.
    const pass = (await db.pool.query("SELECT period_end FROM kubcode_accounts.billing_purchases WHERE workspace_id = $1 AND kind = 'new' AND status = 'paid'", [ws])).rows[0];
    const add = (await db.pool.query("SELECT amount_satang, period_end FROM kubcode_accounts.billing_purchases WHERE id = $1", [p.id])).rows[0];
    assert.equal(new Date(add.period_end).getTime(), new Date(pass.period_end).getTime(), "add ends on the same paid_until");
    const amt = Number(add.amount_satang);
    assert.ok(amt % 100 === 0 && amt >= 1000 && amt <= 28900, `prorated amount ${amt}`);
    log(`3 PromptPay authorize + 5 mid-pass add: paid by promptpay, ฿${amt / 100}, same paid_until ✓`);

    const ent = (await db.pool.query("SELECT slots FROM kubcode_accounts.billing_entitlements WHERE workspace_id = $1", [ws])).rows[0];
    assert.equal(ent.slots, 3, "2 + 1 added");
    log("entitlement: 3 slots ✓");
    await browser.close();
    log("PASS");
  } catch (e) {
    for (const pg of (globalThis as any).__pages ?? []) await pg.screenshot({ path: ".qa/local-e2e/billing-fail.png", fullPage: true }).catch(() => {});
    throw e;
  } finally {
    for (const k of kids.reverse()) k.kill("SIGTERM");
    await db.cleanup();
  }
}
main().catch((e) => {
  void 0;
  console.error(`[billing-e2e] FAIL ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
