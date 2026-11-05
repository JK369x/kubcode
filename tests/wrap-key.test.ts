// Pins the production wrap public key (docs/design/settings-keys.md §1). The
// fingerprint below was taken from `aws kms get-public-key` for
// alias/kubcode-secrets-wrap at creation (2026-11-05) and is pinned again in
// services/crates/kubcode-envelope (keys.rs). A key swapped in the repo fails
// here; changing it needs review and a deploy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sealSecret } from "../lib/keys/envelope";
import { CURRENT_WRAP_KEY } from "../lib/keys/wrap-key";
import { spkiSha256 } from "../lib/keys/wrap-key-tools";

const PINNED_SPKI_SHA256 = "3e1ff570c6db6682616c623cffbcfd84a572291462d4b564f30efd65d9268ac5";
const PEM_FILE = readFileSync(path.join(__dirname, "..", "lib", "keys", "secrets-wrap-v1.pub.pem"), "utf8");

test("the web host seals with wrap key v1 in slot 1", () => {
  assert.ok(CURRENT_WRAP_KEY, "CURRENT_WRAP_KEY is set once the KMS key exists");
  assert.equal(CURRENT_WRAP_KEY.slot, 1);
});

test("the committed public key matches the pinned SPKI SHA-256", () => {
  assert.equal(spkiSha256(PEM_FILE), PINNED_SPKI_SHA256);
  assert.equal(spkiSha256(CURRENT_WRAP_KEY!.publicKeyPem), PINNED_SPKI_SHA256);
  assert.equal(CURRENT_WRAP_KEY!.publicKeyPem, PEM_FILE, "the TS copy is the committed file, byte for byte");
});

test("the pinned key is accepted by the sealer (RSA-4096 SPKI)", () => {
  const envelope = sealSecret(
    { table: "user_secrets", rowId: "6f0f5e1c-0000-4000-8000-00000000f1a1", userId: "6f0f5e1c-0000-4000-8000-00000000f1a2", kind: "elevenlabs_api_key", version: 1 },
    '{"api_key":"FIXTURE-ONLY-0000000000000000"}',
    CURRENT_WRAP_KEY!,
  );
  assert.equal(envelope.subarray(0, 4).toString("latin1"), "KCE1");
  assert.equal(envelope.readUInt8(4), 1);
});
