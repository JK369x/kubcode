// Request guards and cookies for account write routes.
import { CANONICAL_ORIGIN, SESSION_COOKIE_NAME, canonicalHostRedirect } from "../auth-policy";
import { csrfMatches, isOpaqueToken } from "./crypto";
import type { AccountErrorCode } from "./errors";
import { INTENT_TTL_SECONDS } from "./rules";

export const CSRF_COOKIE = "__Host-kubcode-csrf";
export const LINK_COOKIE = "__Host-kubcode-link";
export const CSRF_HEADER = "x-kubcode-csrf";
export const MAX_BODY_BYTES = 1024;
const CSRF_MAX_AGE_SECONDS = 2 * 60 * 60;

export const NO_STORE = Object.freeze({ "Cache-Control": "no-store" });

export function parseCookieHeader(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    // First occurrence wins; values are opaque tokens, never URI-decoded.
    if (!out.has(name)) out.set(name, part.slice(eq + 1).trim());
  }
  return out;
}

export function readCookie(request: Request, name: string): string | null {
  return parseCookieHeader(request.headers.get("cookie")).get(name) ?? null;
}

export function readOpaqueCookie(request: Request, name: string): string | null {
  const value = readCookie(request, name);
  return isOpaqueToken(value) ? value : null;
}

// Canonical host + exact Origin + same-origin fetch metadata. Returns an
// error code or null.
export function checkSameOrigin(request: Request): AccountErrorCode | null {
  if (canonicalHostRedirect(request.headers)) return "BAD_ORIGIN";
  if (request.headers.get("origin") !== CANONICAL_ORIGIN) return "BAD_ORIGIN";
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return "BAD_ORIGIN";
  return null;
}

export type GuardedBody = { ok: true; body: Record<string, unknown> } | { ok: false; code: AccountErrorCode };

export async function readGuardedJson(request: Request): Promise<GuardedBody> {
  const origin = checkSameOrigin(request);
  if (origin) return { ok: false, code: origin };
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, code: "BAD_REQUEST" };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, code: "BAD_REQUEST" };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, code: "BAD_REQUEST" };
  if (!csrfMatches(readCookie(request, CSRF_COOKIE), request.headers.get(CSRF_HEADER)))
    return { ok: false, code: "CSRF_INVALID" };
  return { ok: true, body: body as Record<string, unknown> };
}

const strict = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

// OAuth returns via a cross-site top-level GET: the intent must be Lax.
// Writes still require exact Origin and the separate Strict double-submit CSRF.
const link = (value: string, age: number) =>
  `${LINK_COOKIE}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
export const linkCookie = (token: string) => link(token, INTENT_TTL_SECONDS);
export const clearLinkCookie = () => link("", 0);
export const csrfCookie = (token: string) => strict(CSRF_COOKIE, token, CSRF_MAX_AGE_SECONDS);
// Mirrors the next-auth session cookie attributes so the browser drops it.
export const clearSessionCookie = () =>
  `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function jsonNoStore(body: unknown, setCookies: string[] = [], status = 200): Response {
  const headers = new Headers(NO_STORE);
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}
