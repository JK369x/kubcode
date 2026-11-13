// Web-host settings for the billing Lambda (ADR 0008): the flag, its Function
// URL and the HMAC key shared with it. The Stripe key never reaches the web host.
import type { AuthEnv } from "../auth-policy";

/** Paid sign-up is open only when this is exactly "true" (stays off in production for now). */
export const BILLING_FLAG = "KUBCODE_BILLING_ENABLED";
export const MIN_BILLING_KEY_BYTES = 32;
const LAMBDA_URL = /^https:\/\/[a-z0-9]{20,64}\.lambda-url\.ap-southeast-1\.on\.aws\/$/;
/** Local runner only (docs/dev/local-e2e.md): loopback http, never in production. */
const LOCAL_URL = /^http:\/\/127\.0\.0\.1:\d{2,5}\/$/;

export type BillingConfig = { mode: "off" } | { mode: "broken" } | { mode: "on"; url: string; key: string };

export function readBillingConfig(env: AuthEnv): BillingConfig {
  if (env[BILLING_FLAG] !== "true") return { mode: "off" };
  const url = env.KUBCODE_BILLING_URL ?? "";
  const key = env.KUBCODE_BILLING_HMAC_KEY ?? "";
  const urlOk = LAMBDA_URL.test(url) || (env.NODE_ENV !== "production" && LOCAL_URL.test(url)) || (env.KUBCODE_BILLING_LOCAL === "true" && LOCAL_URL.test(url));
  if (!urlOk || Buffer.byteLength(key, "utf8") < MIN_BILLING_KEY_BYTES) return { mode: "broken" };
  return { mode: "on", url, key };
}

/** ฿289 per channel per month, in satang (must match the Rust crate). */
export const PRICE_PER_CHANNEL_SATANG = 28_900;
export const MAX_SLOTS = 50;
export const GRACE_DAYS = 3;
