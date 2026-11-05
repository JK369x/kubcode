// The SPKI SHA-256 fingerprint pins the committed wrap public key
// (docs/design/settings-keys.md §1), and DER from `aws kms get-public-key`
// must round-trip to the PEM the web host loads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pemFromSpkiDer, spkiSha256 } from "../lib/keys/wrap-key-tools";

const PEM = readFileSync(path.join(__dirname, "fixtures/envelope/test-only-wrap-key.pub.pem"), "utf8");
// Computed independently from the fixture with Node's own SPKI export.
const FIXTURE_FINGERPRINT = "1f7b8fb9add1a37a969472fd9704c7c1cdbb0fe2a55d31d1e410c0ccf844ab30";

test("spkiSha256 is the SHA-256 of the SPKI DER, lowercase hex", () => {
  assert.equal(spkiSha256(PEM), FIXTURE_FINGERPRINT);
});

test("DER from KMS GetPublicKey becomes the same key as an SPKI PEM", () => {
  const der = createPublicKey(PEM).export({ type: "spki", format: "der" });
  const pem = pemFromSpkiDer(der);
  assert.match(pem, /^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=]{1,64}\n)+-----END PUBLIC KEY-----\n$/);
  assert.equal(spkiSha256(pem), FIXTURE_FINGERPRINT);
});

test("private keys and non-RSA input are refused", () => {
  const priv = readFileSync(path.join(__dirname, "fixtures/envelope/test-only-wrap-key.pem"), "utf8");
  assert.throws(() => spkiSha256(priv), /PUBLIC KEY/);
  assert.throws(() => pemFromSpkiDer(Buffer.from("not a key")));
});
