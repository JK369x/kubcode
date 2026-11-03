// Write guard for star/comment routes. Unlike the older readGuardedJson, every
// cheap check (Origin, CSRF, media type, declared length) runs before a single
// body byte is read, and the body is streamed with a hard byte cap so an
// undeclared or lying Content-Length cannot make the server buffer more.
import { csrfMatches } from "../accounts/crypto";
import type { AccountErrorCode } from "../accounts/errors";
import { CSRF_COOKIE, CSRF_HEADER, checkSameOrigin, readCookie } from "../accounts/http";

export type GuardResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; code: AccountErrorCode };

async function readCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function guardWrite(
  request: Request,
  maxBytes: number,
  options: { body?: boolean } = {},
): Promise<GuardResult> {
  const origin = checkSameOrigin(request);
  if (origin) return { ok: false, code: origin };
  if (!csrfMatches(readCookie(request, CSRF_COOKIE), request.headers.get(CSRF_HEADER)))
    return { ok: false, code: "CSRF_INVALID" };
  if (options.body === false) return { ok: true, body: {} };

  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" };
  const declared = request.headers.get("content-length");
  if (declared !== null && !(Number(declared) <= maxBytes)) return { ok: false, code: "PAYLOAD_TOO_LARGE" };

  let text: string | null;
  try {
    text = await readCapped(request, maxBytes);
  } catch {
    return { ok: false, code: "BAD_REQUEST" };
  }
  if (text === null) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, code: "BAD_REQUEST" };
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, code: "BAD_REQUEST" };
  }
}
