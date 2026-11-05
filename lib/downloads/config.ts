// Downloads stay off until KUBCODE_DOWNLOADS_ENABLED is exactly "true". When
// on, the signer Lambda's URL and shared HMAC key must be usable, else the
// feature reports itself broken instead of guessing.
import type { AuthEnv } from "../auth-policy";

export const DOWNLOADS_FLAG = "KUBCODE_DOWNLOADS_ENABLED";
export const MIN_SIGNER_KEY_BYTES = 32;

export type SignerConfig = { url: string; key: string };
export type DownloadsConfig = { mode: "off" } | { mode: "broken" } | { mode: "on"; signer: SignerConfig };

function signerUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

export function readDownloadsConfig(env: AuthEnv): DownloadsConfig {
  if (env[DOWNLOADS_FLAG] !== "true") return { mode: "off" };
  const url = signerUrl(env.KUBCODE_PACKAGE_SIGNER_URL);
  const key = env.KUBCODE_PACKAGE_SIGNER_KEY ?? "";
  if (!url || Buffer.byteLength(key, "utf8") < MIN_SIGNER_KEY_BYTES) return { mode: "broken" };
  return { mode: "on", signer: { url, key } };
}
