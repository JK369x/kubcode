// Client for the kubcode-package-signer Lambda (docs/design/package-signer.md).
// The request is HMAC-signed so only this app can ask for presigned URLs; the
// answer is accepted only if it is an https S3 URL for exactly the asked key.
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { SignerConfig } from "./config";

export type SignRequest = { key: string; filename: string; user: string };
export type SignerDeps = {
  fetch?: typeof fetch;
  /** Milliseconds since the epoch. */
  now?: () => number;
  nonce?: () => string;
  timeoutMs?: number;
};

const PATH = "/sign";
const DEFAULT_TIMEOUT_MS = 4000;

export function signerHeaders(key: string, body: string, timestamp: number, nonce: string): Record<string, string> {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const toSign = ["KUBCODE-HMAC-V1", "POST", PATH, String(timestamp), nonce, bodyHash].join("\n");
  return {
    "content-type": "application/json",
    "x-kubcode-timestamp": String(timestamp),
    "x-kubcode-nonce": nonce,
    "x-kubcode-signature": createHmac("sha256", key).update(toSign, "utf8").digest("hex"),
  };
}

function isS3UrlFor(raw: unknown, key: string): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname.endsWith(".amazonaws.com") && url.pathname === `/${key}`;
  } catch {
    return false;
  }
}

export async function requestSignedUrl(
  config: SignerConfig,
  req: SignRequest,
  deps: SignerDeps = {},
): Promise<{ ok: true; url: string } | { ok: false }> {
  const body = JSON.stringify({ key: req.key, filename: req.filename, user: req.user });
  const timestamp = Math.floor((deps.now ?? Date.now)() / 1000);
  const nonce = (deps.nonce ?? (() => randomBytes(16).toString("hex")))();
  const signal = AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await (deps.fetch ?? fetch)(new URL(PATH.slice(1), config.url).href, {
      method: "POST",
      headers: signerHeaders(config.key, body, timestamp, nonce),
      body,
      redirect: "error",
      cache: "no-store",
      signal,
    });
    if (res.status !== 200) return { ok: false };
    const json = (await res.json()) as { url?: unknown };
    return isS3UrlFor(json?.url, req.key) ? { ok: true, url: json.url as string } : { ok: false };
  } catch {
    return { ok: false };
  }
}
