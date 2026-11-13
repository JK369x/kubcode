// Server view model for /account/billing and the /account banner.
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig, type AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims } from "../accounts/session";
import type { CookieSource } from "../accounts/view";
import { readBillingConfig } from "./config";
import { getBillingStore, type BillingStore, type BillingView } from "./store";

export type BillingPage =
  | { state: "off" }
  | { state: "unavailable" }
  | { state: "signed-out" }
  | { state: "ready"; view: BillingView };

export async function getBillingPage(
  env: AuthEnv,
  getCookies: () => Promise<CookieSource>,
  now: Date = new Date(),
  storeFor: (url: string) => BillingStore = getBillingStore,
): Promise<BillingPage> {
  const billing = readBillingConfig(env);
  if (billing.mode === "off") return { state: "off" };
  const accounts = readAccountsConfig(env);
  const auth = readAuthConfig(env);
  if (billing.mode !== "on" || accounts.mode !== "on" || !auth.ok) return { state: "unavailable" };
  const token = await decodeAccountSession((await getCookies()).get(SESSION_COOKIE_NAME)?.value, auth.config.secret);
  if (!token || !providerReadiness(auth)[token.provider]) return { state: "signed-out" };
  try {
    const view = await storeFor(accounts.databaseUrl).view(sessionClaims(token), now);
    return view ? { state: "ready", view } : { state: "signed-out" };
  } catch (error) {
    logDbFailure("BILLING_PAGE", error);
    return { state: "unavailable" };
  }
}

/** Thai date "13 ธ.ค. 2569" in Bangkok time. */
export function thaiDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

export const REMINDER_TEXT: Record<Exclude<BillingView["reminder"], null>, { tone: "info" | "warn"; text: (until: string) => string }> = {
  t7: { tone: "info", text: (u) => `แพ็กเกจโซเชียลจะหมดอายุ ${u} เหลือไม่เกิน 7 วัน ต่ออายุได้ทุกเมื่อ วันที่เหลือไม่หาย` },
  t3: { tone: "warn", text: (u) => `แพ็กเกจโซเชียลจะหมดอายุ ${u} เหลือไม่เกิน 3 วัน` },
  t0: { tone: "warn", text: (u) => `แพ็กเกจโซเชียลหมดอายุวันนี้ (${u}) ต่ออายุเพื่อให้โพสต์ที่ตั้งเวลาไว้ยังทำงาน` },
  grace: { tone: "warn", text: (u) => `แพ็กเกจหมดอายุแล้วเมื่อ ${u} ทุกอย่างยังทำงานอีก 3 วัน หลังจากนั้นช่องจะถูกพักไว้` },
  paused: { tone: "warn", text: () => "แพ็กเกจหมดอายุแล้ว ช่องถูกพักไว้ (ข้อมูลยังอยู่ครบ) ต่ออายุเพื่อใช้ต่อ" },
};
