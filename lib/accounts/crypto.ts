// Opaque random tokens (link intents, CSRF, session binding). Only SHA-256
// hashes of link/session tokens are persisted; raw values live in cookies or
// the encrypted session JWT.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const OPAQUE = /^[A-Za-z0-9_-]{43}$/;

export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isOpaqueToken(value: unknown): value is string {
  return typeof value === "string" && OPAQUE.test(value);
}

export function hashOpaqueToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

// Double-submit CSRF check: both values must be well-formed and identical.
export function csrfMatches(cookieValue: unknown, submitted: unknown): boolean {
  if (!isOpaqueToken(cookieValue) || !isOpaqueToken(submitted)) return false;
  return timingSafeEqual(Buffer.from(cookieValue), Buffer.from(submitted));
}
