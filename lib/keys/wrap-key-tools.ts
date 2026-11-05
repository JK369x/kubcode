// Helpers for pinning the wrap public key (docs/design/settings-keys.md §1).
// The fingerprint is the SHA-256 of the key's SPKI DER: the value the TS test
// and the Rust crate pin, taken from `aws kms get-public-key` at creation.
import { createHash, createPublicKey } from "node:crypto";

/** Lowercase hex SHA-256 of the SPKI DER of an RSA public key PEM. */
export function spkiSha256(pem: string): string {
  if (!/^\s*-----BEGIN PUBLIC KEY-----/.test(pem)) throw new Error("expected an SPKI PEM (BEGIN PUBLIC KEY)");
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "rsa") throw new Error("expected an RSA public key");
  return createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
}

/** SPKI DER (what KMS GetPublicKey returns) to a PEM with 64-character lines. */
export function pemFromSpkiDer(der: Uint8Array): string {
  const key = createPublicKey({ key: Buffer.from(der), format: "der", type: "spki" });
  if (key.asymmetricKeyType !== "rsa") throw new Error("expected an RSA public key");
  const b64 = Buffer.from(key.export({ type: "spki", format: "der" })).toString("base64");
  return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----\n`;
}
