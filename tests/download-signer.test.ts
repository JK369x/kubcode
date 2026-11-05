import test from "node:test";
import assert from "node:assert/strict";
import { readDownloadsConfig } from "../lib/downloads/config";
import { requestSignedUrl, signerHeaders } from "../lib/downloads/signer";

// Shared vector from docs/design/package-signer.md; the Rust Lambda tests the same one.
const KEY = "test-key-0123456789abcdef0123456789abcdef";
const BODY =
  '{"key":"packages/freshstack-what-if/0.1.0.zip","filename":"freshstack-what-if-0.1.0.zip","user":"11111111-2222-4333-8444-555555555555"}';
const REQ = {
  key: "packages/freshstack-what-if/0.1.0.zip",
  filename: "freshstack-what-if-0.1.0.zip",
  user: "11111111-2222-4333-8444-555555555555",
};
const SIGNER = { url: "https://abc.lambda-url.ap-southeast-1.on.aws/", key: KEY };
const S3_URL =
  "https://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com/packages/freshstack-what-if/0.1.0.zip?X-Amz-Signature=x";

test("signer: headers match the shared test vector", () => {
  assert.deepEqual(signerHeaders(KEY, BODY, 1700000000, "00112233445566778899aabbccddeeff"), {
    "content-type": "application/json",
    "x-kubcode-timestamp": "1700000000",
    "x-kubcode-nonce": "00112233445566778899aabbccddeeff",
    "x-kubcode-signature": "67bf738902a1cb865dec0c72499ffe52b4d30fe4247afc2399677eaa9db8f9be",
  });
});

type Call = { url: string; init: RequestInit };
const fakeFetch = (calls: Call[], respond: () => Response | Promise<Response>) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;

const deps = (calls: Call[], respond: () => Response | Promise<Response>) => ({
  fetch: fakeFetch(calls, respond),
  now: () => 1700000000_000,
  nonce: () => "00112233445566778899aabbccddeeff",
});

test("signer: posts the signed body to <url>sign and returns the S3 URL", async () => {
  const calls: Call[] = [];
  const result = await requestSignedUrl(SIGNER, REQ, deps(calls, () => Response.json({ url: S3_URL, expires_in: 60 })));
  assert.deepEqual(result, { ok: true, url: S3_URL });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://abc.lambda-url.ap-southeast-1.on.aws/sign");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, BODY);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(
    (calls[0].init.headers as Record<string, string>)["x-kubcode-signature"],
    "67bf738902a1cb865dec0c72499ffe52b4d30fe4247afc2399677eaa9db8f9be",
  );
});

test("signer: refuses anything but an https S3 URL for the requested key", async () => {
  const bad = [
    "http://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com/packages/freshstack-what-if/0.1.0.zip",
    "https://evil.example/packages/freshstack-what-if/0.1.0.zip",
    "https://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com.evil.example/packages/freshstack-what-if/0.1.0.zip",
    "https://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com/packages/low-poly-urban/0.1.0.zip",
    "javascript:alert(1)",
    "not a url",
  ];
  for (const url of bad) {
    const result = await requestSignedUrl(SIGNER, REQ, deps([], () => Response.json({ url })));
    assert.deepEqual(result, { ok: false }, url);
  }
});

test("signer: non-200, bad JSON, network errors and timeouts are failures", async () => {
  const cases: (() => Response | Promise<Response>)[] = [
    () => Response.json({ error: "unauthorized" }, { status: 401 }),
    () => new Response("oops", { status: 200 }),
    () => Response.json({ nope: true }),
    () => Promise.reject(new Error("ECONNRESET")),
  ];
  for (const respond of cases) assert.deepEqual(await requestSignedUrl(SIGNER, REQ, deps([], respond)), { ok: false });

  const hang = (async (_u: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      // Like an open socket, keep the event loop alive until aborted.
      const pending = setTimeout(() => reject(new Error("never aborted")), 10_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(pending);
        reject(new Error("aborted"));
      });
    })) as typeof fetch;
  const started = Date.now();
  const result = await requestSignedUrl(SIGNER, REQ, { ...deps([], () => new Response()), fetch: hang, timeoutMs: 50 });
  assert.deepEqual(result, { ok: false });
  assert.ok(Date.now() - started < 2000);
});

test("config: off unless the flag is exactly true", () => {
  for (const v of [undefined, "", "1", "TRUE", "yes"])
    assert.deepEqual(readDownloadsConfig({ KUBCODE_DOWNLOADS_ENABLED: v }), { mode: "off" });
});

test("config: on with an https signer URL and a long enough key", () => {
  const env = {
    KUBCODE_DOWNLOADS_ENABLED: "true",
    KUBCODE_PACKAGE_SIGNER_URL: "https://abc.lambda-url.ap-southeast-1.on.aws",
    KUBCODE_PACKAGE_SIGNER_KEY: KEY,
  };
  assert.deepEqual(readDownloadsConfig(env), {
    mode: "on",
    signer: { url: "https://abc.lambda-url.ap-southeast-1.on.aws/", key: KEY },
  });
});

test("config: broken when enabled but the signer settings are unusable", () => {
  const base = { KUBCODE_DOWNLOADS_ENABLED: "true", KUBCODE_PACKAGE_SIGNER_URL: SIGNER.url, KUBCODE_PACKAGE_SIGNER_KEY: KEY };
  const broken = [
    { KUBCODE_PACKAGE_SIGNER_URL: undefined },
    { KUBCODE_PACKAGE_SIGNER_URL: "http://abc.lambda-url.ap-southeast-1.on.aws/" },
    { KUBCODE_PACKAGE_SIGNER_URL: "https://user:pw@abc.example/" },
    { KUBCODE_PACKAGE_SIGNER_URL: "https://abc.example/?x=1" },
    { KUBCODE_PACKAGE_SIGNER_URL: "nope" },
    { KUBCODE_PACKAGE_SIGNER_KEY: undefined },
    { KUBCODE_PACKAGE_SIGNER_KEY: "short" },
  ];
  for (const change of broken) assert.equal(readDownloadsConfig({ ...base, ...change }).mode, "broken", JSON.stringify(change));
});
