import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import type { DownloadStore } from "../lib/downloads/store";
import { handleDownload, handleDownloadStatus, type DownloadDeps } from "../lib/downloads/routes";

const AUTH_ENV = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
  KUBCODE_ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test",
});
const ON_ENV = Object.freeze({
  ...AUTH_ENV,
  KUBCODE_DOWNLOADS_ENABLED: "true",
  KUBCODE_PACKAGE_SIGNER_URL: "https://fixture.lambda-url.ap-southeast-1.on.aws/",
  KUBCODE_PACKAGE_SIGNER_KEY: "FIXTURE-ONLY-signer-key-0000000000000001",
});
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CSRF = "C".repeat(43);
const S3_URL = "https://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com/packages/freshstack-what-if/0.2.0.zip?X-Amz-Signature=x";

const untouchableStore = new Proxy({}, { get: (_t, key) => () => assert.fail(`store.${String(key)} must not be called`) }) as DownloadStore;
const untouchableSigner = async () => assert.fail("signer must not be called");

async function sessionCookie() {
  const token = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  return `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
}

async function post(slug: string, opts: { origin?: string; signedIn?: boolean; csrf?: string } = {}) {
  const cookies = [`__Host-kubcode-csrf=${CSRF}`];
  if (opts.signedIn !== false) cookies.push(await sessionCookie());
  return new Request(`https://kubcode.dev/api/download/${slug}`, {
    method: "POST",
    headers: {
      host: "kubcode.dev",
      origin: opts.origin ?? "https://kubcode.dev",
      "sec-fetch-site": "same-origin",
      "x-kubcode-csrf": opts.csrf ?? CSRF,
      cookie: cookies.join("; "),
    },
  });
}
const get = (slug: string) => new Request(`https://kubcode.dev/api/download/${slug}`, { headers: { host: "kubcode.dev" } });

const deps = (over: Partial<DownloadDeps> = {}): DownloadDeps => ({
  env: ON_ENV,
  storeFor: () => untouchableStore,
  sign: untouchableSigner,
  ...over,
});

async function expectError(res: Response, status: number, code: string) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.code, code);
  assert.equal(typeof body.message, "string");
  assert.equal(body.url, undefined);
  return body;
}

test("download: off unless the flag is on, without touching the store or the signer", async () => {
  await expectError(await handleDownload(await post("freshstack-what-if"), "freshstack-what-if", deps({ env: AUTH_ENV })), 503, "DOWNLOADS_DISABLED");
  const broken = { ...ON_ENV, KUBCODE_PACKAGE_SIGNER_KEY: "short" };
  await expectError(await handleDownload(await post("freshstack-what-if"), "freshstack-what-if", deps({ env: broken })), 503, "DOWNLOADS_UNAVAILABLE");
  const noAccounts = { ...ON_ENV, KUBCODE_ACCOUNTS_ENABLED: undefined } as Record<string, string | undefined>;
  await expectError(await handleDownload(await post("freshstack-what-if"), "freshstack-what-if", deps({ env: noAccounts })), 503, "ACCOUNTS_DISABLED");
});

test("download: cross-site requests and missing CSRF are refused first", async () => {
  await expectError(await handleDownload(await post("freshstack-what-if", { origin: "https://evil.example" }), "freshstack-what-if", deps()), 403, "BAD_ORIGIN");
  await expectError(await handleDownload(await post("freshstack-what-if", { csrf: "D".repeat(43) }), "freshstack-what-if", deps()), 403, "CSRF_INVALID");
});

test("download: skills without an approved package are 404 for everyone", async () => {
  for (const slug of ["growkaz-stickman", "thai-survival", "low-poly-urban", "nope", "..%2F..%2Fetc", "constructor"])
    await expectError(await handleDownload(await post(slug), slug, deps()), 404, "PACKAGE_NOT_FOUND");
});

test("download: signed-out visitors are told to sign in", async () => {
  await expectError(await handleDownload(await post("freshstack-what-if", { signedIn: false }), "freshstack-what-if", deps()), 401, "NOT_SIGNED_IN");
});

test("download: a member gets a short-lived URL for the approved package", async () => {
  const recorded: unknown[] = [];
  const signed: unknown[] = [];
  const res = await handleDownload(
    await post("freshstack-what-if"),
    "freshstack-what-if",
    deps({
      storeFor: () => ({
        recordDownload: async (viewer, pkg) => {
          recorded.push({ uid: viewer.uid, ...pkg });
          return { ok: true };
        },
      }),
      sign: async (_config, req) => {
        signed.push(req);
        return { ok: true, url: S3_URL };
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { ok: true, url: S3_URL, filename: "freshstack-what-if-0.2.0.zip" });
  assert.deepEqual(recorded, [{ uid: UID, slug: "freshstack-what-if", version: "0.2.0" }]);
  assert.deepEqual(signed, [{ key: "packages/freshstack-what-if/0.2.0.zip", filename: "freshstack-what-if-0.2.0.zip", user: UID }]);
});

test("download: over the limit answers 429 with when to retry, and never signs", async () => {
  const retryAt = new Date(Date.now() + 90 * 60_000).toISOString();
  const res = await handleDownload(
    await post("freshstack-what-if"),
    "freshstack-what-if",
    deps({ storeFor: () => ({ recordDownload: async () => ({ ok: false, code: "DOWNLOAD_LIMIT", retryAt }) }) }),
  );
  const retryAfter = Number(res.headers.get("retry-after"));
  const body = await expectError(res, 429, "DOWNLOAD_LIMIT");
  assert.equal(body.retryAt, retryAt);
  assert.ok(retryAfter > 85 * 60 && retryAfter <= 90 * 60, String(retryAfter));
});

test("download: a session the database rejects is not signed in", async () => {
  const res = await handleDownload(
    await post("freshstack-what-if"),
    "freshstack-what-if",
    deps({ storeFor: () => ({ recordDownload: async () => ({ ok: false, code: "NOT_SIGNED_IN" }) }) }),
  );
  await expectError(res, 401, "NOT_SIGNED_IN");
});

test("download: signer and database failures fail closed", async () => {
  const ok = () => ({ recordDownload: async () => ({ ok: true }) as const });
  await expectError(
    await handleDownload(await post("freshstack-what-if"), "freshstack-what-if", deps({ storeFor: ok, sign: async () => ({ ok: false }) })),
    502,
    "DOWNLOAD_UNAVAILABLE",
  );
  const original = console.error;
  console.error = () => undefined;
  try {
    const throwing = () => ({ recordDownload: async () => Promise.reject(new Error("db down")) });
    await expectError(await handleDownload(await post("freshstack-what-if"), "freshstack-what-if", deps({ storeFor: throwing })), 503, "ACCOUNTS_UNAVAILABLE");
  } finally {
    console.error = original;
  }
});

test("status: available only for an approved package while downloads are on", async () => {
  const status = async (slug: string, env: Record<string, string | undefined>) => {
    const res = await handleDownloadStatus(get(slug), slug, { env });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    return res.json();
  };
  assert.deepEqual(await status("freshstack-what-if", ON_ENV), { available: true });
  assert.deepEqual(await status("low-poly-urban", ON_ENV), { available: false });
  assert.deepEqual(await status("growkaz-stickman", ON_ENV), { available: false });
  assert.deepEqual(await status("freshstack-what-if", AUTH_ENV), { available: false });
  assert.deepEqual(await status("freshstack-what-if", { ...ON_ENV, KUBCODE_PACKAGE_SIGNER_URL: "http://x/" }), { available: false });
});

test("download: a members-only package whose object is missing answers 404, not a dead link", async () => {
  const okStore = () => ({ recordDownload: async () => ({ ok: true as const }) });
  const url = "https://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com/packages/deep-sea-docs/0.1.0.zip?X-Amz-Signature=x";
  const sign = async () => ({ ok: true as const, url });
  const probed: string[] = [];
  const missing = await handleDownload(
    await post("deep-sea-docs"),
    "deep-sea-docs",
    deps({ storeFor: okStore, sign, probe: async (u) => (probed.push(u), "missing") }),
  );
  await expectError(missing, 404, "PACKAGE_NOT_FOUND");
  assert.deepEqual(probed, [url]);
  const broken = await handleDownload(await post("deep-sea-docs"), "deep-sea-docs", deps({ storeFor: okStore, sign, probe: async () => "error" }));
  await expectError(broken, 502, "DOWNLOAD_UNAVAILABLE");
  const present = await handleDownload(await post("deep-sea-docs"), "deep-sea-docs", deps({ storeFor: okStore, sign, probe: async () => "present" }));
  assert.equal(present.status, 200);
  assert.deepEqual(await present.json(), { ok: true, url, filename: "deep-sea-docs-0.1.0.zip" });
  // Repo-built packages are uploaded by the stack: no probe.
  const repo = await handleDownload(
    await post("freshstack-what-if"),
    "freshstack-what-if",
    deps({ storeFor: okStore, sign: async () => ({ ok: true as const, url: S3_URL }), probe: async () => { throw new Error("must not probe"); } }),
  );
  assert.equal(repo.status, 200);
});
