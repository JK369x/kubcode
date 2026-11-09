// Local end-to-end for channel connect (docs/dev/local-e2e.md). Run it
// through scripts/local-e2e/run.sh, which pipes the Zernio key on stdin.
//
// Production code, local wiring:
// - a throwaway database on the local test Postgres (all migrations, a
//   fictional owner member, session minted with a fixture secret);
// - the publishing runner (services/.../examples/publishing_local.rs): the
//   Lambda's own http::handle, the real Zernio API, the loopback database;
// - `next start` with the production build; scripts/local-e2e/lambda-route.cjs
//   sends the (fake, well-formed) Function URL to the runner;
// - a headed Chromium where https://kubcode.dev/** is served by the local Next
//   server, so Zernio's real redirect to the production callback URL lands
//   here. Nothing leaves this machine except the calls to Zernio and the
//   platform's consent page.
//
// Then: the owner connects, the script checks the database and the page,
// disconnects through the page, and deletes what it created at Zernio.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { chromium, type BrowserContext, type Route } from "@playwright/test";
import { createPgAccountStore } from "../../lib/accounts/store";
import { accountToken } from "../../lib/accounts/session";
import { SESSION_COOKIE_NAME } from "../../lib/auth-policy";
import { throwawayDb } from "../../tests/accounts-db/harness";

const PLATFORM = process.argv[2] ?? "youtube";
const FIXTURE = {
  NEXTAUTH_URL: "https://kubcode.dev",
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-local-e2e-0000001",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
};
// Passes the web host's Function URL check; lambda-route.cjs points it at the runner.
const FAKE_LAMBDA = "https://localrunner0000000000000.lambda-url.ap-southeast-1.on.aws/";
const ZERNIO = "https://zernio.com/api/v1";
const OUT = ".qa/local-e2e";
const WAIT_MINUTES = 15;
// Wiring check without consent: headless, clicks connect itself and stops at
// Zernio's first answer (any key; a dummy one gets 401 from Zernio).
const SMOKE = process.env.KUBCODE_LOCAL_E2E_SMOKE === "1";

const log = (msg: string) => console.log(`[local-e2e] ${msg}`);

async function readKey(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const key = Buffer.concat(chunks).toString("utf8").trim();
  if (!/^(sk|zrk)_[A-Za-z0-9_]+$/.test(key)) throw new Error("stdin does not carry a Zernio key (run through run.sh)");
  return key;
}

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

async function waitFor<T>(what: string, ms: number, probe: () => Promise<T | undefined>): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await probe().catch(() => undefined);
    if (v !== undefined) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function zernio(key: string, method: string, p: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${ZERNIO}${p}`, { method, headers: { authorization: `Bearer ${key}` }, redirect: "error" });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** A tiny cookie jar for the routed browser: the edge's view of kubcode.dev. */
function jar(initial: Record<string, string>) {
  const cookies = new Map(Object.entries(initial));
  return {
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    take(setCookies: string[]) {
      for (const sc of setCookies) {
        const [pair, ...attrs] = sc.split(";");
        const i = pair.indexOf("=");
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        const gone = value === "" || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
        if (gone) cookies.delete(name);
        else cookies.set(name, value);
      }
    },
  };
}

async function main() {
  const key = await readKey();
  const db = await throwawayDb();
  const kids: ChildProcess[] = [];
  let context: BrowserContext | undefined;
  let profileId: string | undefined;
  let failure: unknown;
  try {
    // ---- database: roles that can log in, one fictional owner
    const appPassword = randomBytes(18).toString("hex");
    await db.pool.query(`ALTER ROLE kubcode_app LOGIN PASSWORD '${appPassword}'`);
    const dbName = (await db.pool.query("SELECT current_database() AS d")).rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const appUrl = `postgres://kubcode_app:${appPassword}@${base.host}/${dbName}`;
    const workerUrl = `postgres://${base.username}:${base.password}@${base.host}/${dbName}?options=${encodeURIComponent("-c role=kubcode_worker")}`;
    const accounts = createPgAccountStore(db.pool);
    const profile = { provider: "google" as const, subject: "g-local-e2e-owner", displayName: "Local E2E Owner", email: "local-e2e@example.test" };
    const login = await accounts.resolveLogin(profile);
    if (login.status !== "ok") throw new Error("seed login");
    await db.pool.query("UPDATE kubcode_accounts.users SET is_owner = true WHERE id = $1", [login.userId]);
    const token = accountToken({ userId: login.userId, sessionVersion: login.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email });
    const session = await encode({ token: token as never, secret: FIXTURE.NEXTAUTH_SECRET });

    // ---- publishing runner (real Zernio)
    const hmac = randomBytes(32).toString("hex");
    const runnerPort = await freePort();
    log("building the publishing runner");
    const runner = spawn(
      "cargo",
      // KUBCODE_LOCAL_SERVICES_DIR runs another checkout's runner, e.g. main
      // to reproduce a bug before the fix.
      ["run", "-q", "--manifest-path", path.join(process.env.KUBCODE_LOCAL_SERVICES_DIR ?? "services", "Cargo.toml"), "-p", "kubcode-publishing-lambda", "--example", "publishing_local"],
      {
        env: { ...process.env, KUBCODE_LOCAL_PORT: String(runnerPort), KUBCODE_LOCAL_WORKER_DB_URL: workerUrl, KUBCODE_LOCAL_HMAC_KEY: hmac },
        stdio: ["pipe", "pipe", "inherit"],
      },
    );
    kids.push(runner);
    runner.stdin!.end(`${key}\n`);
    const runnerLines: string[] = [];
    runner.stdout!.on("data", (d: Buffer) => {
      for (const line of d.toString("utf8").split("\n").filter(Boolean)) {
        runnerLines.push(line);
        console.log(`  ${line}`);
      }
    });
    await waitFor("the runner", 300_000, async () => (runnerLines.some((l) => l.includes("listening")) ? true : undefined));

    // ---- Next (production build)
    const nextPort = await freePort();
    const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(nextPort)], {
      env: {
        ...process.env,
        ...FIXTURE,
        NODE_ENV: "production",
        NODE_OPTIONS: `--require ${path.resolve("scripts/local-e2e/lambda-route.cjs")}`,
        KUBCODE_LOCAL_LAMBDA_FROM: FAKE_LAMBDA,
        KUBCODE_LOCAL_LAMBDA_TO: `http://127.0.0.1:${runnerPort}`,
        KUBCODE_ACCOUNTS_ENABLED: "true",
        KUBCODE_PUBLISHING_ENABLED: "true",
        KUBCODE_PUBLISHING_URL: FAKE_LAMBDA,
        KUBCODE_PUBLISHING_HMAC_KEY: hmac,
        DATABASE_URL: appUrl,
        KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK: "true",
        NEXT_PUBLIC_MEDIA_MODE: "licensed-only",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "ignore", "inherit"],
    });
    kids.push(next);
    await waitFor("next start", 60_000, async () => ((await fetch(`http://127.0.0.1:${nextPort}/robots.txt`)).ok ? true : undefined));

    // ---- browser: kubcode.dev is served by the local Next server
    mkdirSync(OUT, { recursive: true });
    // A kept profile holds the owner's platform login between runs; it lives
    // under .qa/ (gitignored) and `run.sh --forget` deletes it.
    context = SMOKE
      ? await (await chromium.launch({ headless: true })).newContext({ viewport: { width: 1180, height: 900 } })
      : await chromium.launchPersistentContext(`${OUT}/browser`, { headless: false, viewport: { width: 1180, height: 900 } });
    const cookies = jar({ [SESSION_COOKIE_NAME]: session });
    await context.route("https://kubcode.dev/**", async (route: Route) => {
      const req = route.request();
      const { pathname, search } = new URL(req.url());
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(await req.allHeaders())) if (!k.startsWith(":") && k !== "cookie") headers[k] = v;
      headers.host = "kubcode.dev";
      headers["x-forwarded-proto"] = "https";
      headers.cookie = cookies.header();
      const res = await route.fetch({ url: `http://127.0.0.1:${nextPort}${pathname}${search}`, headers, maxRedirects: 0 });
      cookies.take(res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value));
      await route.fulfill({ response: res });
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://kubcode.dev/account/channels");
    await page.getByRole("heading", { name: "ช่องที่เชื่อมไว้" }).waitFor();

    const label = PLATFORM === "instagram" ? "Instagram" : "YouTube";
    if (SMOKE) {
      await page.getByRole("button", { name: `เชื่อม ${label}` }).click();
      const line = await waitFor("the runner's connect/start line", 30_000, async () =>
        runnerLines.find((l) => l.includes("path=/api/connect/start")),
      );
      log(`SMOKE: browser → Next → runner → Zernio wired: ${line}`);
      await page.screenshot({ path: `${OUT}/smoke.png`, fullPage: true });
      return;
    }
    log(`READY: in the Chromium window, click "เชื่อม ${label}" and finish the consent (${WAIT_MINUTES} min max)`);

    // ---- wait for the outcome in the database (the intent closes either way)
    const closed = await waitFor("the connect to finish", WAIT_MINUTES * 60_000, async () => {
      const { rows } = await db.pool.query(
        "SELECT status, error_code FROM kubcode_accounts.channel_connect_intents WHERE status IN ('consumed', 'failed') ORDER BY created_at DESC LIMIT 1",
      );
      return rows[0] as { status: string; error_code: string | null } | undefined;
    });
    profileId = (await db.pool.query("SELECT provider_ref FROM kubcode_accounts.provider_profiles WHERE provider = 'zernio'")).rows[0]?.provider_ref;
    for (const l of runnerLines.filter((l) => l.includes("api path="))) log(`runner: ${l}`);
    assert.equal(closed.status, "consumed", `connect failed with ${closed.error_code}`);

    const conn = (
      await db.pool.query(
        `SELECT c.platform, cc.status FROM kubcode_accounts.channel_connections cc
           JOIN kubcode_accounts.channels c ON c.id = cc.channel_id`,
      )
    ).rows;
    assert.deepEqual(conn, [{ platform: PLATFORM, status: "active" }], "one active connection on the channel");
    await page.waitForURL(/\/account\/channels\?notice=connected$/);
    await page.getByText("เชื่อมอยู่").waitFor();
    assert.equal(await page.getByText("ยังไม่มีช่องที่เชื่อมไว้").count(), 0, "the page lists the channel");
    await page.screenshot({ path: `${OUT}/connected-${PLATFORM}.png`, fullPage: true });
    log(`PASS: ${PLATFORM} connected; the page shows it (${OUT}/connected-${PLATFORM}.png)`);

    // ---- disconnect through the page (Zernio DELETE /v1/accounts/{id})
    await page.getByRole("button", { name: "ยกเลิกการเชื่อม" }).click();
    await page.getByText("ยกเลิกการเชื่อมช่องแล้ว").waitFor();
    const left = (await db.pool.query("SELECT status FROM kubcode_accounts.channel_connections")).rows.map((r) => r.status);
    assert.deepEqual(left, ["revoked"], "disconnect revokes the connection");
    log("PASS: disconnected through the page");
  } catch (error) {
    failure = error;
  } finally {
    // ---- leave nothing at Zernio: accounts of this run's profile, then the profile
    if (profileId) {
      const list = await zernio(key, "GET", `/accounts?profileId=${encodeURIComponent(profileId)}`).catch(() => null);
      for (const a of list?.body?.accounts ?? []) {
        const r = await zernio(key, "DELETE", `/accounts/${encodeURIComponent(a._id)}`);
        log(`cleanup: deleted leftover ${a.platform} account at Zernio (${r.status})`);
      }
      const p = await zernio(key, "DELETE", `/profiles/${encodeURIComponent(profileId)}`).catch(() => null);
      log(`cleanup: deleted this run's Zernio profile (${p?.status ?? "error"})`);
    }
    await context?.close().catch(() => undefined);
    await context?.browser()?.close().catch(() => undefined);
    for (const k of kids) k.kill("SIGTERM");
    await db.cleanup().catch(() => undefined);
  }
  if (failure) {
    console.error(`[local-e2e] FAIL: ${failure instanceof Error ? failure.message : String(failure)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[local-e2e] FAIL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
