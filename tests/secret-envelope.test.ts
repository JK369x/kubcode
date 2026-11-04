import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MAX_SECRET_BYTES, sealSecret, secretAad, type SecretContext } from "../lib/keys/envelope";
import { FIXTURE_DIR, TEST_PRIVATE_KEY, TEST_PUBLIC_KEY, openForTest } from "./fixtures/envelope/open";

const ctx: SecretContext = {
  table: "user_secrets",
  rowId: "6f1c2a8e-4b9d-4e3a-9c1f-2d7e8a9b0c11",
  userId: "0b6e4f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  kind: "elevenlabs_api_key",
  version: 1,
};
const key = { slot: 1, publicKeyPem: TEST_PUBLIC_KEY };

test("a sealed secret opens with the wrap private key and the same row context", () => {
  const envelope = sealSecret(ctx, "sk_fixture_value_1234", key);
  const opened = openForTest(envelope, secretAad(ctx));
  assert.equal(opened.plaintext.toString("utf8"), "sk_fixture_value_1234");
  assert.equal(opened.slot, 1);
});

test("a sealed secret does not open under any other row, owner, kind, version or table", () => {
  const envelope = sealSecret(ctx, "sk_fixture_value_1234", key);
  for (const other of [
    { ...ctx, userId: "1b6e4f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
    { ...ctx, rowId: "7f1c2a8e-4b9d-4e3a-9c1f-2d7e8a9b0c11" },
    { ...ctx, kind: "instagram_app" },
    { ...ctx, version: 2 },
    { ...ctx, table: "oauth_connections" as const },
  ])
    assert.throws(() => openForTest(envelope, secretAad(other)), /unable to authenticate/i, JSON.stringify(other));
});

test("sealing refuses a malformed row context", () => {
  for (const bad of [
    { ...ctx, rowId: "not-a-uuid" },
    { ...ctx, userId: "0B6E4F3A-1C2D-4E5F-8A9B-0C1D2E3F4A5B" },
    { ...ctx, kind: "Bad|Kind" },
    { ...ctx, kind: "" },
    { ...ctx, version: 0 },
    { ...ctx, version: 1.5 },
    { ...ctx, table: "users" },
  ])
    assert.throws(() => sealSecret(bad as SecretContext, "x", key), /ENVELOPE_BAD_CONTEXT/, JSON.stringify(bad));
});

test("sealing refuses empty or oversized secrets (4 KiB limit)", () => {
  assert.equal(openForTest(sealSecret(ctx, "a".repeat(MAX_SECRET_BYTES), key), secretAad(ctx)).plaintext.length, MAX_SECRET_BYTES);
  for (const bad of ["", "a".repeat(MAX_SECRET_BYTES + 1), "ก".repeat(1366)])
    assert.throws(() => sealSecret(ctx, bad, key), /ENVELOPE_BAD_PLAINTEXT/, `${bad.length} chars`);
});

test("sealing refuses a wrap key that is not an RSA-4096 public key or has no valid slot", () => {
  const rsa2048 = readFileSync(path.join(FIXTURE_DIR, "test-only-rsa2048.pub.pem"), "utf8");
  for (const bad of [
    { slot: 1, publicKeyPem: rsa2048 },
    { slot: 1, publicKeyPem: TEST_PRIVATE_KEY },
    { slot: 0, publicKeyPem: TEST_PUBLIC_KEY },
    { slot: 256, publicKeyPem: TEST_PUBLIC_KEY },
    { slot: 1, publicKeyPem: "not a key" },
  ])
    assert.throws(() => sealSecret(ctx, "x", bad), /ENVELOPE_BAD_KEY/, `slot ${bad.slot}`);
});

test("every seal uses a fresh data key and nonce", () => {
  const a = sealSecret(ctx, "same", key);
  const b = sealSecret(ctx, "same", key);
  assert.notDeepEqual(a, b);
  assert.notDeepEqual(a.subarray(7 + 512, 7 + 512 + 12), b.subarray(7 + 512, 7 + 512 + 12));
});

test("the committed cross-language vectors open (valid) or fail (tampered) under their contexts", () => {
  const vectors = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "vectors-v1.json"), "utf8"));
  for (const v of vectors.valid) {
    assert.equal(secretAad(v.ctx).toString("utf8"), v.aad, v.name);
    assert.equal(openForTest(Buffer.from(v.envelopeHex, "hex"), secretAad(v.ctx)).plaintext.toString("utf8"), v.plaintext, v.name);
  }
  for (const v of vectors.tampered) {
    const opened = (() => {
      try {
        const r = openForTest(Buffer.from(v.envelopeHex, "hex"), secretAad(v.ctx));
        return r.slot === vectors.slot ? r : null;
      } catch {
        return null;
      }
    })();
    assert.equal(opened, null, v.name);
  }
});
