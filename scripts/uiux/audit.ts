// UI/UX audit harness (docs/design/uiux-audit-2026-11-11.md): every page type
// at 390/768/1280 in dark + light, against the production build and a
// throwaway local database (fixture owner with channels, for /account/*).
// Records screenshots, axe-core (WCAG 2.2 AA) violations, horizontal overflow,
// visible text < 12px, pointer targets < 24px, and a keyboard focus walk
// (focus ring visible and not under the sticky header).
//
//   KUBCODE_TEST_DATABASE_URL=... AXE_PATH=/path/to/axe.min.js npm run build && npx tsx scripts/uiux/audit.ts [label]
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { encode } from "next-auth/jwt";
import { chromium, type Page } from "@playwright/test";
import { createPgAccountStore } from "../../lib/accounts/store";
import { accountToken } from "../../lib/accounts/session";
import { SESSION_COOKIE_NAME } from "../../lib/auth-policy";
import { throwawayDb } from "../../tests/accounts-db/harness";

const SECRET = "FIXTURE-ONLY-session-secret-uiux-audit-000001";
const LABEL = process.argv[2] ?? "audit";
const OUT = `.qa/uiux/${LABEL}`;
const AXE = readFileSync(process.env.AXE_PATH!, "utf8");

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise((r) => s.close(r));
  return port;
}

async function probe(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== "hidden" &&
        cs.display !== "none" &&
        Number(cs.opacity) > 0.05
      );
    };
    const small: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent ?? "").trim()) continue;
      seen.add(el);
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (
        fs < 12 &&
        visible(el) &&
        !el.closest("[aria-hidden=true], .skip, script, style")
      )
        small.push(
          `${fs}px ${el.tagName.toLowerCase()}.${(el.className && typeof el.className === "string" ? el.className : "").split(" ")[0]} "${(n.textContent ?? "").trim().slice(0, 30)}"`,
        );
    }
    const targets: string[] = [];
    for (const el of document.querySelectorAll(
      "a[href], button, input, select, textarea, summary, [role=button]",
    )) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      // inline links in running text are exempt (WCAG 2.5.8 inline exception)
      if (
        el.tagName === "A" &&
        el.closest("p, li.prose, .prose, article .mdx, td") &&
        getComputedStyle(el).display === "inline"
      )
        continue;
      if (r.width < 24 || r.height < 24)
        targets.push(
          `${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName.toLowerCase()}.${(typeof el.className === "string" ? el.className : "").split(" ")[0]} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)}"`,
        );
    }
    return {
      overflow,
      small: [...new Set(small)],
      targets: [...new Set(targets)],
    };
  });
}

async function focusWalk(page: Page, steps = 25) {
  const issues: string[] = [];
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const ring =
        (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) ||
        cs.boxShadow !== "none";
      // what is painted at the element centre?
      const cx = Math.min(
        Math.max(rect.left + rect.width / 2, 0),
        innerWidth - 1,
      );
      const cy = Math.min(
        Math.max(rect.top + rect.height / 2, 0),
        innerHeight - 1,
      );
      const top = document.elementFromPoint(cx, cy);
      const covered =
        rect.height > 0 &&
        top !== null &&
        top !== el &&
        !el.contains(top) &&
        !top.contains(el);
      const offscreen = rect.bottom < 0 || rect.top > innerHeight;
      return {
        name: `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)}"`,
        ring,
        covered: covered
          ? `${top?.tagName.toLowerCase()}.${String(top?.className).split(" ")[0]}`
          : "",
        offscreen,
      };
    });
    if (!r) continue;
    if (!r.ring) issues.push(`no ring: ${r.name}`);
    if (r.covered) issues.push(`covered by ${r.covered}: ${r.name}`);
    if (r.offscreen) issues.push(`offscreen: ${r.name}`);
  }
  return [...new Set(issues)];
}

async function main() {
  const db = await throwawayDb();
  let next: ChildProcess | undefined;
  try {
    const appPassword = randomBytes(18).toString("hex");
    await db.pool.query(
      `ALTER ROLE kubcode_app LOGIN PASSWORD '${appPassword}'`,
    );
    const dbName = (await db.pool.query("SELECT current_database() AS d"))
      .rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const profile = {
      provider: "google" as const,
      subject: "g-uiux",
      displayName: "Owner",
      email: "uiux@example.test",
    };
    const login = await createPgAccountStore(db.pool).resolveLogin(profile);
    if (login.status !== "ok") throw new Error("seed login");
    const uid = login.userId;
    await db.pool.query(
      "UPDATE kubcode_accounts.users SET is_owner = true WHERE id = $1",
      [uid],
    );
    const ws = (
      await db.pool.query(
        "INSERT INTO kubcode_accounts.workspaces (name) VALUES ('kubcode') RETURNING id",
      )
    ).rows[0].id;
    await db.pool.query(
      "INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
      [ws, uid],
    );
    const ch = async (
      platform: string,
      name: string,
      status: "active" | "needs_reconnect",
    ) => {
      const id = (
        await db.pool.query(
          "INSERT INTO kubcode_accounts.channels (workspace_id, platform, display_name, handle) VALUES ($1, $2, $3, $3) RETURNING id",
          [ws, platform, name],
        )
      ).rows[0].id as string;
      await db.pool.query(
        "INSERT INTO kubcode_accounts.channel_connections (channel_id, provider, provider_ref, status) VALUES ($1, 'zernio', $2, $3)",
        [id, `acct-${randomBytes(6).toString("hex")}`, status],
      );
      return id;
    };
    const ig = await ch("instagram", "kube.code", "active");
    await ch("youtube", "kubcode", "needs_reconnect");
    const token = accountToken({
      userId: uid,
      sessionVersion: login.sessionVersion,
      provider: "google",
      subject: profile.subject,
      name: "Owner",
      email: profile.email,
    });
    const session = await encode({ token: token as never, secret: SECRET });
    const port = await freePort();
    next = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        env: {
          ...process.env,
          NEXTAUTH_URL: "https://kubcode.dev",
          NEXTAUTH_SECRET: SECRET,
          GOOGLE_CLIENT_ID:
            "123456789012-fixtureonly0abc.apps.googleusercontent.com",
          GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
          LINE_CLIENT_ID: "2000000001",
          LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
          NODE_ENV: "production",
          KUBCODE_ACCOUNTS_ENABLED: "true",
          KUBCODE_PUBLISHING_ENABLED: "true",
          KUBCODE_AUTOMATIONS_ENABLED: "true",
          KUBCODE_PUBLISHING_URL:
            "https://localrunner0000000000000.lambda-url.ap-southeast-1.on.aws/",
          KUBCODE_PUBLISHING_HMAC_KEY: randomBytes(32).toString("hex"),
          DATABASE_URL: `postgres://kubcode_app:${appPassword}@${base.host}/${dbName}`,
          KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK: "true",
          NEXT_PUBLIC_MEDIA_MODE: "licensed-only",
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
    for (let i = 0; i < 120; i++) {
      if (
        await fetch(`http://127.0.0.1:${port}/robots.txt`)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await new Promise((r) => setTimeout(r, 500));
    }
    mkdirSync(`${OUT}/shots`, { recursive: true });
    const pages: Array<[string, string, boolean]> = [
      ["home", "/", false],
      ["articles", "/articles", false],
      ["article", "/articles/free-ai-animation-opencode", false],
      ["tools", "/tools", false],
      ["tool", "/tools/blender", false],
      ["skill", "/skills/growkaz-stickman", false],
      ["community", "/community", false],
      ["account-signed-out", "/account", false],
      ["account-channels", "/account/channels", true],
      ["account-automations", `/account/channels/${ig}/automations`, true],
    ];
    const results: Record<string, unknown> = {};
    const browser = await chromium.launch({ headless: true });
    for (const width of [390, 768, 1280]) {
      for (const theme of ["dark", "light"] as const) {
        for (const signedIn of [false, true]) {
          const list = pages.filter((p) => p[2] === signedIn);
          const context = await browser.newContext({
            viewport: { width, height: 900 },
          });
          // tsx/esbuild wraps nested functions in __name(); define it in the page.
          await context.addInitScript("window.__name = (f) => f");
          await context.addInitScript(
            (t) => localStorage.setItem("jk-theme", t),
            theme,
          );
          await context.route("https://kubcode.dev/**", async (route) => {
            const u = new URL(route.request().url());
            const headers: Record<string, string> = {
              ...(await route.request().allHeaders()),
              host: "kubcode.dev",
              "x-forwarded-proto": "https",
            };
            if (signedIn) headers.cookie = `${SESSION_COOKIE_NAME}=${session}`;
            await route.fulfill({
              response: await route.fetch({
                url: `http://127.0.0.1:${port}${u.pathname}${u.search}`,
                headers,
                maxRedirects: 0,
              }),
            });
          });
          const page = await context.newPage();
          page.setDefaultTimeout(60_000);
          for (const [name, path] of list) {
            const key = `${name}-${width}-${theme}`;
            await page.goto(`https://kubcode.dev${path}`, {
              waitUntil: "load",
            });
            await page.waitForTimeout(900);
            const shot = `${OUT}/shots/${key}.png`;
            await page.screenshot({
              path: shot,
              fullPage: width !== 1280 || name !== "home" ? true : false,
            });
            const p = await probe(page);
            // evaluate, not addScriptTag: the site's CSP rightly blocks injected inline scripts.
            await page.evaluate(AXE);
            const axe = await page.evaluate(async () => {
              const r = await (window as any).axe.run(document, {
                runOnly: {
                  type: "tag",
                  values: [
                    "wcag2a",
                    "wcag2aa",
                    "wcag21a",
                    "wcag21aa",
                    "wcag22aa",
                    "best-practice",
                  ],
                },
              });
              return r.violations.map((v: any) => ({
                id: v.id,
                impact: v.impact,
                n: v.nodes.length,
                sample: v.nodes.slice(0, 3).map((x: any) => x.target.join(" ")),
              }));
            });
            await page.evaluate(() => scrollTo(0, 0));
            const focus =
              width === 390 || width === 1280 ? await focusWalk(page) : [];
            results[key] = { path, shot, ...p, axe, focus };
            console.log(
              key,
              `overflow=${p.overflow} small=${p.small.length} targets=${p.targets.length} axe=${axe.map((a: any) => a.id).join(",")} focus=${focus.length}`,
            );
          }
          await context.close();
        }
      }
    }
    await browser.close();
    writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
  } finally {
    next?.kill("SIGTERM");
    await db.cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
