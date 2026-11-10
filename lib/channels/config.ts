// Web-host settings for the publishing Lambda (docs/design/publishing-core.md
// §4, §5.2): the flag, its Function URL and the HMAC key shared with it. All
// live in web.env on the box; Zernio's key never reaches the web host.
import type { AuthEnv } from "../auth-policy";

export const PUBLISHING_FLAG = "KUBCODE_PUBLISHING_ENABLED";
export const MIN_PUBLISHING_KEY_BYTES = 32;
const LAMBDA_URL = /^https:\/\/[a-z0-9]{20,64}\.lambda-url\.ap-southeast-1\.on\.aws\/$/;

export type PublishingConfig = { mode: "off" } | { mode: "broken" } | { mode: "on"; url: string; key: string };

/** Off unless the flag is exactly "true"; broken when the URL or key is unusable. */
export function readPublishingConfig(env: AuthEnv): PublishingConfig {
  if (env[PUBLISHING_FLAG] !== "true") return { mode: "off" };
  const url = env.KUBCODE_PUBLISHING_URL ?? "";
  const key = env.KUBCODE_PUBLISHING_HMAC_KEY ?? "";
  if (!LAMBDA_URL.test(url) || Buffer.byteLength(key, "utf8") < MIN_PUBLISHING_KEY_BYTES) return { mode: "broken" };
  return { mode: "on", url, key };
}

/** Platforms creators can connect (TikTok: docs/design/tiktok-channel.md). */
export const CONNECTABLE = ["youtube", "instagram", "tiktok"] as const;
export type Connectable = (typeof CONNECTABLE)[number];
export const isConnectable = (v: unknown): v is Connectable => CONNECTABLE.includes(v as Connectable);
