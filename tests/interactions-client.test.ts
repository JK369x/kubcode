// lib/interactions/client.ts send(): a stale CSRF token (the 2 h cookie
// expired while the page stayed open) is refreshed and the write retried once.
import { test } from "node:test";
import assert from "node:assert/strict";

type Call = { url: string; token: string | null };

async function withFetch(answers: Array<(c: Call) => Response>, run: () => Promise<unknown>) {
  const calls: Call[] = [];
  let tokenN = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/account/csrf") return Response.json({ csrfToken: `T${++tokenN}` });
    const call = { url, token: new Headers(init?.headers).get("x-kubcode-csrf") };
    calls.push(call);
    return answers[calls.length - 1](call);
  }) as typeof fetch;
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

const csrfInvalid = () => Response.json({ code: "CSRF_INVALID", message: "x" }, { status: 403 });

test("send: a stale CSRF token is refreshed and the write retried once", async () => {
  const { send } = await import(`../lib/interactions/client.ts?a=${Date.now()}`);
  const { result, calls } = await withFetch([csrfInvalid, () => Response.json({ url: "u" })], () => send("/api/billing/checkout", "POST", { kind: "new", slots: 1 }));
  assert.deepEqual(result, { ok: true, url: "u" });
  assert.deepEqual(calls.map((c) => c.token), ["T1", "T2"], "the retry carries a fresh token");
});

test("send: a second CSRF refusal is returned, not retried forever", async () => {
  const { send } = await import(`../lib/interactions/client.ts?b=${Date.now()}`);
  const { result, calls } = await withFetch([csrfInvalid, csrfInvalid, csrfInvalid], () => send("/api/x", "POST", {}));
  assert.equal((result as { code: string }).code, "CSRF_INVALID");
  assert.equal(calls.length, 2);
});

test("send: other errors are not retried", async () => {
  const { send } = await import(`../lib/interactions/client.ts?c=${Date.now()}`);
  const { result, calls } = await withFetch([() => Response.json({ code: "SLOTS_FULL", message: "m" }, { status: 402 })], () => send("/api/x", "POST", {}));
  assert.equal((result as { code: string }).code, "SLOTS_FULL");
  assert.equal(calls.length, 1);
});
