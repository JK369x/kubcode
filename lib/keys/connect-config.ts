// Web-host settings for the OAuth connect Lambda (docs/design/settings-keys.md
// §2, §5): its Function URL, the shared HMAC key, and kubcode's shared YouTube
// client id (§2a). All live in web.env on the box; the secrets the Lambda needs
// live in SSM and never reach the web host.
import { createHash, createHmac } from "node:crypto";
import type { AuthEnv } from "../auth-policy";

export const MIN_CONNECT_KEY_BYTES = 32;
const GOOGLE_CLIENT_ID = /^[0-9]{6,30}-[a-z0-9]{8,64}\.apps\.googleusercontent\.com$/;

export type ConnectConfig =
  | { mode: "off" }
  | { mode: "broken" }
  | { mode: "on"; url: string; key: string; youtubeClientId: string | null };

function lambdaUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
  return url.href;
}

/** Off when neither URL nor key is set; broken when only one is, or either is unusable. */
export function readConnectConfig(env: AuthEnv): ConnectConfig {
  const rawUrl = env.KUBCODE_CONNECT_URL ?? "";
  const key = env.KUBCODE_CONNECT_HMAC_KEY ?? "";
  if (!rawUrl && !key) return { mode: "off" };
  const url = lambdaUrl(rawUrl);
  if (!url || Buffer.byteLength(key, "utf8") < MIN_CONNECT_KEY_BYTES) return { mode: "broken" };
  const clientId = env.KUBCODE_YOUTUBE_CLIENT_ID ?? "";
  if (clientId && !GOOGLE_CLIENT_ID.test(clientId)) return { mode: "broken" };
  return { mode: "on", url, key, youtubeClientId: clientId || null };
}

/**
 * KUBCODE-HMAC-V1, the package signer's scheme with the path signed as well:
 * the connect Lambda serves several routes. The Lambda also rejects a reused
 * nonce (design §2).
 */
export function connectHeaders(key: string, path: string, body: string, timestamp: number, nonce: string): Record<string, string> {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const toSign = ["KUBCODE-HMAC-V1", "POST", path, String(timestamp), nonce, bodyHash].join("\n");
  return {
    "content-type": "application/json",
    "x-kubcode-timestamp": String(timestamp),
    "x-kubcode-nonce": nonce,
    "x-kubcode-signature": createHmac("sha256", key).update(toSign, "utf8").digest("hex"),
  };
}
