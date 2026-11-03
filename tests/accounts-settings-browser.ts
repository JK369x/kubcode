// Browser fixture check for /account/settings states (no server, no DB).
// Renders AccountSettings for every phase with the real global + module CSS
// (module class names left unhashed), then uses Playwright Chromium to check
// mobile overflow, light/dark themes, keyboard focus and accessible names.
//   npx tsx tests/accounts-settings-browser.ts
// Output: .qa/account-settings-browser/*.png and results.json. Fixture data only.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
  _load: (request: string, ...rest: unknown[]) => unknown;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const originalLoad = NodeModule._load;
NodeModule._load = function (request: string, ...rest: unknown[]) {
  if (request === "next-auth/react") return { signIn: async () => {}, signOut: async () => {} };
  return originalLoad.call(this, request, ...rest);
};

async function main() {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { AccountSettings } = await import("../components/AccountSettings");
  const { chromium } = await import("@playwright/test");
  const css = [
    readFileSync(join(root, "app/globals.css"), "utf8").replace(/@import[^;]+;/g, ""),
    readFileSync(join(root, "components/AccountSettings.module.css"), "utf8"),
  ].join("\n");
  const g = { provider: "google", displayName: "Fixture Person", email: "fixture.person@example.test", linkedAt: "2026-11-01T00:00:00.000Z", current: true } as const;
  const l = { provider: "line", displayName: "Fixture LINE ชื่อยาวมากสำหรับทดสอบการตัดบรรทัด", email: null, linkedAt: "2026-11-02T00:00:00.000Z", current: false } as const;
  const base = { kind: "link", sourceProvider: "google", targetProvider: "line", pendingTargetName: null, expiresAt: "2026-11-03T10:10:00.000Z" } as const;
  const ready = (over: Record<string, unknown>) => ({ state: "ready", providers: { google: true, line: true }, identities: [g], intent: null, staleIntentCookie: false, ...over });
  const states: Record<string, Record<string, unknown>> = {
    "google-only": ready({}),
    "line-disabled": ready({ providers: { google: true, line: false }, identities: [g, l] }),
    "both-linked": ready({ identities: [g, l] }),
    "link-source": ready({ intent: { ...base, phase: "await_source" } }),
    "link-target": ready({ intent: { ...base, phase: "await_target" } }),
    "link-confirm": ready({ intent: { ...base, phase: "await_confirm", pendingTargetName: l.displayName } }),
    "unlink-confirm": ready({ identities: [g, l], intent: { ...base, kind: "unlink", phase: "await_confirm" } }),
    stale: ready({ staleIntentCookie: true }),
  };
  const out = join(root, ".qa/account-settings-browser");
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const [name, view] of Object.entries(states))
      for (const theme of ["light", "dark"])
        for (const width of [390, 1280]) {
          const body = renderToStaticMarkup(createElement(AccountSettings as never, { view, notice: "ยืนยันบัญชีเดิมแล้ว ทำขั้นถัดไปต่อได้เลย" } as never));
          const html = `<!doctype html><html lang="th" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style></head><body><main id="main" class="account-page"><div><h1>ตั้งค่าการเข้าสู่ระบบ</h1>${body}</div></main></body></html>`;
          const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme as "light" | "dark" });
          await page.setContent(html);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          await page.keyboard.press("Tab");
          const focused = await page.evaluate(() => document.activeElement?.tagName ?? null);
          const names = await page.getByRole("button").allInnerTexts();
          const status = await page.getByRole("status").count();
          await page.screenshot({ path: join(out, `${name}-${theme}-${width}.png`), fullPage: true });
          results.push({ name, theme, width, overflow, focused, buttons: names, status, ok: overflow <= 0 && status === 1 && names.every((n) => n.trim().length > 0) });
          await page.close();
        }
  } finally {
    await browser.close();
  }
  writeFileSync(join(out, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  const failed = results.filter((r) => !r.ok);
  console.log(`[accounts-browser] ${results.length - failed.length}/${results.length} fixture renders OK`);
  if (failed.length) {
    console.error(JSON.stringify(failed, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  // This harness contains fictional fixtures only: retain actionable diagnostics.
  console.error("[accounts-browser] FAILED", String(error));
  process.exit(1);
});
