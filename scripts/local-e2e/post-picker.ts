// Local end-to-end for the automation page's post picker (docs/dev/local-e2e.md,
// "Post picker"). Run it through scripts/local-e2e/run-post-picker.sh, which
// pipes the Zernio key on stdin.
//
// READ ONLY. The production Instagram and TikTok accounts are found with GET
// calls (scripts/local-e2e/zernio-guard.ts refuses anything else) and seeded
// into a throwaway database; the protected local runner (no connect,
// complete or disconnect) serves the Lambda's real http::handle; the
// production web build serves the page. The only Zernio call the page makes
// is GET /v1/accounts/{id}/posts. Nothing is posted, replied, sent or deleted.
//
// KUBCODE_LOCAL_E2E_FIXTURE=1 runs the same page against a stub Lambda that
// answers with the OpenAPI-shaped fixture (no key, no Zernio), for screenshots
// on a machine without the vault.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { chromium, type Page } from "@playwright/test";
import { createPgAccountStore } from "../../lib/accounts/store";
import { accountToken } from "../../lib/accounts/session";
import { SESSION_COOKIE_NAME } from "../../lib/auth-policy";
import { throwawayDb } from "../../tests/accounts-db/harness";
import { guardedZernio } from "./zernio-guard";

const FIXTURE_MODE = process.env.KUBCODE_LOCAL_E2E_FIXTURE === "1";
const SECRET = "FIXTURE-ONLY-session-secret-local-e2e-0000001";
const FAKE_LAMBDA = "https://localrunner0000000000000.lambda-url.ap-southeast-1.on.aws/";
const OUT = ".qa/local-e2e/post-picker";
const log = (msg: string) => console.log(`[local-e2e:post-picker] ${msg}`);

async function readKey(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const key = Buffer.concat(chunks).toString("utf8").trim();
  if (!/^(sk|zrk)_[A-Za-z0-9_]+$/.test(key)) throw new Error("stdin does not carry a Zernio key (run through run-post-picker.sh)");
  return key;
}

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

type Account = { _id: string; platform: string; username?: string; displayName?: string; platformUserId?: string; profileId: string; firstPost?: string };

/** The production Instagram and TikTok accounts, read-only. */
async function realAccounts(key: string): Promise<Account[]> {
  const zernio = guardedZernio(key, { cancelPosts: false });
  const listed = await zernio("GET", "/accounts");
  assert.equal(listed.status, 200, `GET /accounts: ${listed.status}`);
  const out: Account[] = [];
  for (const platform of ["instagram", "tiktok"]) {
    const found = (listed.body?.accounts ?? []).filter((a: any) => a.platform === platform && a.isActive !== false);
    if (found.length !== 1) {
      log(`${platform}: ${found.length} active accounts at Zernio, skipped`);
      continue;
    }
    const a = found[0];
    assert.match(String(a._id), /^[A-Za-z0-9]{1,64}$/);
    // The same read the Lambda makes, to see the raw shape once.
    const posts = await zernio("GET", `/accounts/${a._id}/posts`);
    const rows: any[] = posts.body?.posts ?? [];
    log(
      `${platform} @${a.username ?? "?"}: GET /accounts/{id}/posts ${posts.status}, ${rows.length} posts; ` +
        `numeric ids ${rows.filter((p) => /^[0-9]+$/.test(String(p.id))).length}, ` +
        `with picture ${rows.filter((p) => typeof p.picture === "string").length}, ` +
        `with permalink ${rows.filter((p) => typeof p.permalink === "string").length}`,
    );
    const first = rows.find((p) => /^[0-9]{1,64}$/.test(String(p.id)));
    out.push({ ...a, profileId: typeof a.profileId === "string" ? a.profileId : a.profileId?._id, firstPost: first ? String(first.id) : undefined });
  }
  return out;
}

const FIXTURE_POSTS = [
  ["17900000000000002", "ทำ AI วิดีโอใน 5 นาที ไม่ต้องตัดต่อเอง", "2026-11-10T09:14:03Z", "#7c3aed", false],
  ["17900000000000003", "รีวิวเครื่องมือ AI ทำปกคลิปอัตโนมัติ", "2026-11-08T12:00:00Z", "#0ea5e9", true],
  ["17900000000000004", "", "2026-11-05T08:30:00Z", null, false],
  ["17900000000000005", "สรุปข่าว AI ประจำสัปดาห์ ตอนที่ 12 พร้อมลิงก์ในไบโอ ใครอยากได้คอมเมนต์คำว่า ขอลิงก์ ได้เลย", "2026-11-01T10:00:00Z", "#f59e0b", false],
  ["17900000000000006", "เบื้องหลังการทำคลิป kubcode", "2026-10-28T10:00:00Z", null, false],
] as const;

/** A stub Lambda for fixture mode: the picker's list, shaped as the Lambda answers. */
async function stubLambda(): Promise<{ port: number; close: () => void }> {
  const server = createHttpServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url !== "/api/channels/posts") return res.end(JSON.stringify({ ok: false, code: "not_found" }));
      res.end(
        JSON.stringify({
          ok: true,
          complete: true,
          posts: FIXTURE_POSTS.map(([id, caption, at, color, kubcode]) => ({
            platformPostId: id,
            permalink: `https://www.instagram.com/reel/${id}/`,
            thumbnailUrl: color ? `https://cdn.fixture.test/${id}.svg?c=${encodeURIComponent(color)}` : null,
            caption,
            createdAt: at,
            kubcode,
          })),
        }),
      );
    });
  });
  const port = await freePort();
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { port, close: () => server.close() };
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  log(`screenshot ${OUT}/${name}.png`);
}

async function main() {
  const key = FIXTURE_MODE ? null : await readKey();
  const accounts: Account[] = key
    ? await realAccounts(key)
    : [{ _id: "fixtureacct01", platform: "instagram", username: "kube.code", displayName: "kube.code", profileId: "fixtureprofile01", firstPost: FIXTURE_POSTS[0][0] }];
  assert.ok(accounts.length > 0, "no account to show");

  const db = await throwawayDb();
  const kids: ChildProcess[] = [];
  let stub: { close: () => void } | undefined;
  let failure: unknown;
  try {
    const appPassword = randomBytes(18).toString("hex");
    await db.pool.query(`ALTER ROLE kubcode_app LOGIN PASSWORD '${appPassword}'`);
    const dbName = (await db.pool.query("SELECT current_database() AS d")).rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const profile = { provider: "google" as const, subject: "g-post-picker", displayName: "Owner", email: "post-picker@example.test" };
    const login = await createPgAccountStore(db.pool).resolveLogin(profile);
    if (login.status !== "ok") throw new Error("seed login");
    await db.pool.query("UPDATE kubcode_accounts.users SET is_owner = true WHERE id = $1", [login.userId]);
    const ws = (await db.pool.query("INSERT INTO kubcode_accounts.workspaces (name) VALUES ('kubcode') RETURNING id")).rows[0].id;
    await db.pool.query("INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [ws, login.userId]);
    await db.pool.query("INSERT INTO kubcode_accounts.provider_profiles (workspace_id, provider, provider_ref) VALUES ($1, 'zernio', $2)", [ws, accounts[0].profileId]);
    const channels: { platform: string; id: string; firstPost?: string }[] = [];
    for (const a of accounts) {
      const id = (
        await db.pool.query(
          "INSERT INTO kubcode_accounts.channels (workspace_id, platform, display_name, handle, platform_account_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [ws, a.platform, a.displayName ?? a.username ?? a.platform, a.username ?? null, a.platformUserId ?? null],
        )
      ).rows[0].id as string;
      await db.pool.query("INSERT INTO kubcode_accounts.channel_connections (channel_id, provider, provider_ref, status) VALUES ($1, 'zernio', $2, 'active')", [id, a._id]);
      // An all-posts rule so the page has something in its list.
      await db.pool.query("INSERT INTO kubcode_accounts.automation_rules (channel_id, keywords, public_reply, dm_text) VALUES ($1, $2, $3, $4)", [
        id,
        ["ขอลิงก์"],
        "ส่งให้ใน DM แล้วนะ",
        "ขอบคุณที่สนใจนะ https://kubcode.dev/",
      ]);
      if (a.firstPost) {
        // A rule on one post: the rule list must show that post, not its id.
        await db.pool.query("INSERT INTO kubcode_accounts.automation_rules (channel_id, keywords, platform_post_id, public_reply, dm_text, position) VALUES ($1, $2, $3, $4, $5, 1)", [
          id,
          ["สนใจ"],
          a.firstPost,
          "ส่งให้แล้วนะ",
          "ลิงก์ของคลิปนี้ https://kubcode.dev/",
        ]);
      }
      channels.push({ platform: a.platform, id, firstPost: a.firstPost });
    }

    // ---- the Lambda: the protected local runner (real Zernio) or the stub
    const hmac = randomBytes(32).toString("hex");
    let lambdaPort: number;
    if (key) {
      lambdaPort = await freePort();
      const workerUrl = `postgres://${base.username}:${base.password}@${base.host}/${dbName}?options=${encodeURIComponent("-c role=kubcode_worker")}`;
      log("building the publishing runner (protected)");
      const runner = spawn(
        "cargo",
        ["run", "-q", "--manifest-path", "services/Cargo.toml", "-p", "kubcode-publishing-lambda", "--example", "publishing_local"],
        {
          env: {
            ...process.env,
            KUBCODE_LOCAL_PORT: String(lambdaPort),
            KUBCODE_LOCAL_WORKER_DB_URL: workerUrl,
            KUBCODE_LOCAL_HMAC_KEY: hmac,
            KUBCODE_LOCAL_PROTECT_ACCOUNTS: "1",
          },
          stdio: ["pipe", "pipe", "inherit"],
        },
      );
      kids.push(runner);
      runner.stdin!.end(`${key}\n`);
      let ready = false;
      runner.stdout!.on("data", (d: Buffer) => {
        for (const line of d.toString("utf8").split("\n").filter(Boolean)) {
          if (line.includes("accounts protected")) ready = true;
          console.log(`  ${line}`);
        }
      });
      for (let i = 0; !ready; i++) {
        if (i > 1200) throw new Error("runner did not start in protected mode");
        await new Promise((r) => setTimeout(r, 500));
      }
    } else {
      const s = await stubLambda();
      stub = s;
      lambdaPort = s.port;
    }

    // ---- Next (production build)
    const nextPort = await freePort();
    const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(nextPort)], {
      env: {
        ...process.env,
        NEXTAUTH_URL: "https://kubcode.dev",
        NEXTAUTH_SECRET: SECRET,
        GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
        LINE_CLIENT_ID: "2000000001",
        LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
        NODE_ENV: "production",
        NODE_OPTIONS: `--require ${path.resolve("scripts/local-e2e/lambda-route.cjs")}`,
        KUBCODE_LOCAL_LAMBDA_FROM: FAKE_LAMBDA,
        KUBCODE_LOCAL_LAMBDA_TO: `http://127.0.0.1:${lambdaPort}`,
        KUBCODE_ACCOUNTS_ENABLED: "true",
        KUBCODE_PUBLISHING_ENABLED: "true",
        KUBCODE_AUTOMATIONS_ENABLED: "true",
        KUBCODE_PUBLISHING_URL: FAKE_LAMBDA,
        KUBCODE_PUBLISHING_HMAC_KEY: hmac,
        DATABASE_URL: `postgres://kubcode_app:${appPassword}@${base.host}/${dbName}`,
        KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK: "true",
        NEXT_PUBLIC_MEDIA_MODE: "licensed-only",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "ignore", "inherit"],
    });
    kids.push(next);
    for (let i = 0; i < 120; i++) {
      if (await fetch(`http://127.0.0.1:${nextPort}/robots.txt`).then((r) => r.ok).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    // ---- browser
    mkdirSync(OUT, { recursive: true });
    const token = accountToken({ userId: login.userId, sessionVersion: login.sessionVersion, provider: "google", subject: profile.subject, name: "Owner", email: profile.email });
    const session = await encode({ token: token as never, secret: SECRET });
    const browser = await chromium.launch({ headless: true });
    for (const [vp, viewport] of [
      ["desktop", { width: 1280, height: 900 }],
      ["mobile-390", { width: 390, height: 844 }],
    ] as const) {
      const context = await browser.newContext({ viewport });
      await context.route("https://kubcode.dev/**", async (route) => {
        const u = new URL(route.request().url());
        const headers = { ...(await route.request().allHeaders()), host: "kubcode.dev", "x-forwarded-proto": "https", cookie: `${SESSION_COOKIE_NAME}=${session}` };
        await route.fulfill({ response: await route.fetch({ url: `http://127.0.0.1:${nextPort}${u.pathname}${u.search}`, headers, maxRedirects: 0 }) });
      });
      if (!key) {
        await context.route("https://cdn.fixture.test/**", (route) => {
          const c = new URL(route.request().url()).searchParams.get("c") ?? "#999";
          return route.fulfill({
            contentType: "image/svg+xml",
            body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${c}"/><circle cx="200" cy="250" r="60" fill="#fff" opacity=".5"/></svg>`,
          });
        });
      }
      const page = await context.newPage();
      const referers: string[] = [];
      page.on("request", (r) => {
        if (r.resourceType() === "image" && !r.url().startsWith("https://kubcode.dev")) referers.push(r.headers()["referer"] ?? "");
      });
      for (const ch of channels) {
        await page.goto(`https://kubcode.dev/account/channels/${ch.id}/automations`);
        await page.getByRole("heading", { name: "ตอบคอมเมนต์อัตโนมัติ" }).waitFor();
        if (ch.firstPost) {
          // The single-post rule shows the post's thumbnail and caption once the list loads.
          await page.locator("dd").filter({ has: page.locator("img") }).first().waitFor({ timeout: 60_000 });
          assert.equal(await page.getByText(`ID ${ch.firstPost}`).count(), 0, "the rule list shows the post, not a bare id");
          await shoot(page, `${ch.platform}-${vp}-rules`);
        }
        await page.getByRole("radio", { name: /เฉพาะ(โพสต์|วิดีโอ)เดียว/ }).check();
        const group = page.getByRole("radiogroup");
        const loaded = await Promise.race([
          group.waitFor({ timeout: 60_000 }).then(() => "list"),
          page.getByText(/ยังไม่พบ|โหลดโพสต์ของช่องนี้ไม่ได้/).waitFor({ timeout: 60_000 }).then(() => "empty-or-failed"),
        ]);
        const cards = loaded === "list" ? await group.getByRole("radio").count() : 0;
        log(`${ch.platform} ${vp}: picker shows ${cards} posts (${loaded})`);
        await page.waitForLoadState("networkidle");
        await shoot(page, `${ch.platform}-${vp}-picker`);
        if (cards > 0) {
          // Keyboard: focus the first post, arrow to the next, and it is chosen.
          await group.getByRole("radio").first().focus();
          await page.keyboard.press("Space");
          if (cards > 1) await page.keyboard.press("ArrowRight");
          const checked = await group.getByRole("radio", { checked: true }).count();
          assert.equal(checked, 1, "one post chosen by keyboard");
          await page.getByRole("form").or(page.locator("form")).first().scrollIntoViewIfNeeded();
          await shoot(page, `${ch.platform}-${vp}-chosen`);
        }
        await page.getByRole("button", { name: "ใส่ ID เอง" }).click();
        await page.getByLabel(/ID ของ(โพสต์ใน Instagram|วิดีโอใน TikTok)/).waitFor();
        if (vp === "desktop") await shoot(page, `${ch.platform}-${vp}-manual`);
      }
      assert.ok(referers.every((r) => r === ""), "thumbnails are fetched without a referrer");
      await context.close();
    }
    await browser.close();
    log(`PASS (${key ? "real Zernio, read only" : "fixture"}): screenshots in ${OUT}`);
  } catch (error) {
    failure = error;
  } finally {
    for (const k of kids) k.kill("SIGTERM");
    stub?.close();
    await db.cleanup().catch(() => undefined);
  }
  if (failure) {
    console.error(`[local-e2e:post-picker] FAIL: ${failure instanceof Error ? failure.stack : String(failure)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[local-e2e:post-picker] FAIL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
