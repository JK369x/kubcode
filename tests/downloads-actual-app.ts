// Skill-package downloads against an actual Next production server and a real
// local PostgreSQL (throwaway database, runtime role kubcode_app). The signer
// Lambda is replaced by a local HTTPS stand-in that checks the HMAC on its own
// (it does not reuse lib/downloads/signer) and answers with an S3-shaped URL;
// the browser never reaches AWS. FICTIONAL members only, fixture secrets.
// Requires a prior `next build` and KUBCODE_TEST_DATABASE_URL.
// Run: npm run test:downloads-app
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const SIGNER_KEY = "FIXTURE-ONLY-signer-key-" + randomBytes(16).toString("hex");
const S3_ORIGIN = "https://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com";

type Res = { status: number; headers: Record<string, string | string[] | undefined>; json: () => any };

function call(port: number, path: string, opts: { method?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method: opts.method ?? "GET", headers: { host: "kubcode.dev", "x-forwarded-proto": "https", ...opts.headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, headers: res.headers, json: () => JSON.parse(text) });
        });
      },
    );
    req.on("error", reject);
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

/** Self-signed loopback certificate, trusted by the Next process via NODE_EXTRA_CA_CERTS. */
function loopbackCert() {
  const dir = mkdtempSync(join(tmpdir(), "kubcode-signer-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
  ], { stdio: "ignore" });
  return { dir, key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) };
}

/** Local stand-in for the signer Lambda, implementing docs/design/package-signer.md. */
function startSigner(tls: { key: Buffer; cert: Buffer }, seen: { user: string; key: string }[]) {
  const server = createHttpsServer(tls, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const reply = (status: number, json: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (req.method !== "POST" || req.url !== "/sign") return reply(404, { error: "not_found" });
      const ts = String(req.headers["x-kubcode-timestamp"] ?? "");
      const nonce = String(req.headers["x-kubcode-nonce"] ?? "");
      const sig = String(req.headers["x-kubcode-signature"] ?? "");
      const toSign = ["KUBCODE-HMAC-V1", "POST", "/sign", ts, nonce, createHash("sha256").update(body).digest("hex")].join("\n");
      const expected = createHmac("sha256", SIGNER_KEY).update(toSign).digest();
      const given = Buffer.from(sig, "hex");
      const fresh = Math.abs(Date.now() / 1000 - Number(ts)) <= 60;
      if (!fresh || given.length !== expected.length || !timingSafeEqual(given, expected)) return reply(401, { error: "unauthorized" });
      const parsed = JSON.parse(body.toString("utf8")) as { key: string; filename: string; user: string };
      seen.push({ user: parsed.user, key: parsed.key });
      reply(200, { url: `${S3_ORIGIN}/${parsed.key}?X-Amz-Expires=60&X-Amz-Signature=fixture`, expires_in: 60 });
    });
  });
  return server;
}

async function main() {
  const db = await throwawayDb();
  const steps: string[] = [];
  const step = (name: string) => {
    steps.push(name);
    console.log("ok -", name);
  };
  const appPassword = randomBytes(18).toString("hex");
  const tls = loopbackCert();
  const signed: { user: string; key: string }[] = [];
  const signer = startSigner(tls, signed);
  let server: ReturnType<typeof spawn> | undefined;
  try {
    await db.pool.query(`ALTER ROLE kubcode_app LOGIN PASSWORD '${appPassword}'`);
    const dbName = (await db.pool.query("SELECT current_database() AS d")).rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const appUrl = `postgres://kubcode_app:${appPassword}@${base.host}/${dbName}`;

    const accounts = createPgAccountStore(db.pool);
    let n = 0;
    async function member() {
      const profile = { provider: "google" as const, subject: `g-dl-app-${++n}`, displayName: `DL Member ${n}`, email: `dlapp${n}@example.test` };
      const r = await accounts.resolveLogin(profile);
      if (r.status !== "ok") throw new Error("login");
      const token = accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email });
      return { id: r.userId, cookie: `${SESSION_COOKIE_NAME}=${await encode({ token: token as never, secret: FIXTURE.NEXTAUTH_SECRET })}` };
    }
    const a = await member();
    const b = await member();

    const signerPort = await freePort();
    await new Promise<void>((r) => signer.listen(signerPort, "127.0.0.1", r));
    const port = await freePort();
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      env: {
        ...process.env,
        ...FIXTURE,
        NODE_ENV: "production",
        KUBCODE_ACCOUNTS_ENABLED: "true",
        KUBCODE_DOWNLOADS_ENABLED: "true",
        KUBCODE_PACKAGE_SIGNER_URL: `https://127.0.0.1:${signerPort}/`,
        KUBCODE_PACKAGE_SIGNER_KEY: SIGNER_KEY,
        NODE_EXTRA_CA_CERTS: join(tls.dir, "cert.pem"),
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

    const csrf = (await call(port, "/api/account/csrf")).json().csrfToken as string;
    const download = (slug: string, cookie: string, opts: { origin?: string } = {}) =>
      call(port, `/api/download/${slug}`, {
        method: "POST",
        headers: {
          origin: opts.origin ?? "https://kubcode.dev",
          "sec-fetch-site": "same-origin",
          "x-kubcode-csrf": csrf,
          cookie: `${CSRF_COOKIE}=${csrf}; ${cookie}`,
        },
      });

    assert.deepEqual((await call(port, "/api/download/freshstack-what-if")).json(), { available: true });
    assert.deepEqual((await call(port, "/api/download/growkaz-stickman")).json(), { available: false });
    step("status: What If available, unlicensed skill not");

    assert.equal((await download("freshstack-what-if", "")).status, 401);
    assert.equal((await download("freshstack-what-if", a.cookie, { origin: "https://evil.example" })).status, 403);
    assert.equal((await download("growkaz-stickman", a.cookie)).status, 404);
    assert.equal(signed.length, 0);
    step("signed out 401, cross-site 403, unlicensed 404; signer never called");

    const ok = await download("freshstack-what-if", a.cookie);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers["cache-control"], "no-store");
    const body = ok.json();
    assert.equal(body.filename, "freshstack-what-if-0.2.0.zip");
    assert.ok(body.url.startsWith(`${S3_ORIGIN}/packages/freshstack-what-if/0.2.0.zip?`));
    assert.deepEqual(signed, [{ user: a.id, key: "packages/freshstack-what-if/0.2.0.zip" }]);
    step("member download: HMAC accepted by an independent verifier, S3 URL returned");

    for (let i = 1; i < 20; i++) assert.equal((await download("freshstack-what-if", a.cookie)).status, 200);
    const limited = await download("freshstack-what-if", a.cookie);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers["retry-after"]) > 0);
    assert.equal((await download("freshstack-what-if", b.cookie)).status, 200);
    const logged = await db.pool.query("SELECT count(*)::int AS n FROM kubcode_accounts.download_events WHERE user_id = $1", [a.id]);
    assert.equal(logged.rows[0].n, 20);
    step("21st download in 24 h refused with Retry-After; other member unaffected; 20 rows logged");

    // Browser: the button on the real skill page, signed out and signed in.
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const origin = `http://127.0.0.1:${port}`;
      const anon = await browser.newPage();
      await anon.goto(`${origin}/skills/freshstack-what-if`);
      const signin = anon.locator("#download a", { hasText: "ดาวน์โหลด skill" });
      await signin.waitFor();
      assert.equal(await signin.getAttribute("href"), "/account");
      mkdirSync(".qa", { recursive: true });
      await anon.locator("#download").screenshot({ path: ".qa/downloads-signed-out.png" });
      step("browser signed out: download asks to sign in");

      // Chrome will not store __Secure- cookies over plain http, so the signed-in
      // page's requests are replayed from Node with the session and CSRF
      // cookies and the edge headers injected (same as interactions-actual-app).
      const ctx = await browser.newContext();
      await ctx.route(`${origin}/**`, async (route) => {
        const { pathname, search } = new URL(route.request().url());
        const response = await route.fetch({
          url: `${origin}${pathname}${search}`,
          headers: {
            ...route.request().headers(),
            host: "kubcode.dev",
            origin: "https://kubcode.dev",
            "x-forwarded-proto": "https",
            cookie: `${CSRF_COOKIE}=${csrf}; ${b.cookie}`,
          },
          maxRedirects: 0,
        });
        await route.fulfill({ response });
      });
      let fileRequested = "";
      await ctx.route(`${S3_ORIGIN}/**`, async (route) => {
        fileRequested = route.request().url();
        await route.fulfill({ status: 200, headers: { "content-disposition": 'attachment; filename="x.zip"', "content-type": "application/zip" }, body: "PK" });
      });
      const page = await ctx.newPage();
      await page.goto(`${origin}/skills/freshstack-what-if`);
      const button = page.locator("#download button", { hasText: "ดาวน์โหลด skill" });
      await button.waitFor();
      await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>("#download button")?.disabled);
      await page.locator("#download").screenshot({ path: ".qa/downloads-signed-in.png" });
      await button.click();
      for (let i = 0; i < 50 && !fileRequested; i++) await page.waitForTimeout(100);
      assert.ok(fileRequested.startsWith(`${S3_ORIGIN}/packages/freshstack-what-if/0.2.0.zip?`), fileRequested);
      step("browser signed in: click fetches the presigned package URL");
    } finally {
      await browser.close();
    }
    console.log(`PASS ${steps.length} steps`);
  } finally {
    server?.kill("SIGTERM");
    signer.close();
    await db.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
