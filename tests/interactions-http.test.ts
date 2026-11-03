import { test } from "node:test";
import assert from "node:assert/strict";
import { newOpaqueToken } from "../lib/accounts/crypto";
import { CSRF_COOKIE, CSRF_HEADER } from "../lib/accounts/http";
import { guardWrite } from "../lib/interactions/http";

const token = newOpaqueToken();

/** A body stream that records how many chunks the guard pulled. */
function trackedBody(chunks: string[]) {
  const state = { pulled: 0, cancelled: false };
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= chunks.length) return controller.close();
      controller.enqueue(enc.encode(chunks[state.pulled++]));
    },
    cancel() {
      state.cancelled = true;
    },
  }, { highWaterMark: 0 }); // pull only when someone reads
  return { stream, state };
}

function request(opts: {
  origin?: string;
  csrfCookie?: string | null;
  csrfHeader?: string | null;
  type?: string;
  length?: number;
  chunks?: string[];
  method?: string;
}) {
  const { stream, state } = trackedBody(opts.chunks ?? ['{"a":1}']);
  const headers = new Headers({ "content-type": opts.type ?? "application/json" });
  headers.set("origin", opts.origin ?? "https://kubcode.dev");
  headers.set("host", "kubcode.dev");
  if (opts.csrfCookie !== null) headers.set("cookie", `${CSRF_COOKIE}=${opts.csrfCookie ?? token}`);
  if (opts.csrfHeader !== null) headers.set(CSRF_HEADER, opts.csrfHeader ?? token);
  if (opts.length !== undefined) headers.set("content-length", String(opts.length));
  const req = new Request("https://kubcode.dev/api/x", {
    method: opts.method ?? "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit);
  return { req, state };
}

test("a same-origin JSON write with matching CSRF yields the parsed body", async () => {
  const { req } = request({});
  assert.deepEqual(await guardWrite(req, 64), { ok: true, body: { a: 1 } });
});

test("origin and CSRF are rejected before any body byte is read", async () => {
  for (const [opts, code] of [
    [{ origin: "https://evil.example" }, "BAD_ORIGIN"],
    [{ csrfHeader: null }, "CSRF_INVALID"],
    [{ csrfCookie: newOpaqueToken() }, "CSRF_INVALID"],
  ] as const) {
    const { req, state } = request(opts);
    assert.deepEqual(await guardWrite(req, 64), { ok: false, code });
    assert.equal(state.pulled, 0, code);
  }
});

test("wrong media type and an over-large declared length are rejected unread", async () => {
  let r = request({ type: "text/plain" });
  assert.deepEqual(await guardWrite(r.req, 64), { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" });
  assert.equal(r.state.pulled, 0);
  r = request({ length: 65 });
  assert.deepEqual(await guardWrite(r.req, 64), { ok: false, code: "PAYLOAD_TOO_LARGE" });
  assert.equal(r.state.pulled, 0);
});

test("an undeclared body is read only up to the cap, then the stream is cancelled", async () => {
  const chunks = Array.from({ length: 50 }, () => "x".repeat(40));
  const { req, state } = request({ chunks });
  assert.deepEqual(await guardWrite(req, 64), { ok: false, code: "PAYLOAD_TOO_LARGE" });
  assert.ok(state.pulled <= 3, `pulled ${state.pulled}`);
});

test("bodyless writes (DELETE) pass the same guards without JSON", async () => {
  const { req } = request({ method: "DELETE", chunks: [], type: "" });
  assert.deepEqual(await guardWrite(req, 64, { body: false }), { ok: true, body: {} });
  const bad = request({ method: "DELETE", chunks: [], type: "", origin: "https://evil.example" });
  assert.deepEqual(await guardWrite(bad.req, 64, { body: false }), { ok: false, code: "BAD_ORIGIN" });
});
