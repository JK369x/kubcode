// TEST ONLY: opens a v1 envelope with a local RSA private key, the way the
// Rust Lambda does after KMS unwraps the DEK. Production TypeScript never
// decrypts; this exists so the TS tests can check what sealSecret writes.
import { constants, createDecipheriv, privateDecrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const FIXTURE_DIR = path.join(__dirname);
export const TEST_PRIVATE_KEY = readFileSync(path.join(FIXTURE_DIR, "test-only-wrap-key.pem"), "utf8");
export const TEST_PUBLIC_KEY = readFileSync(path.join(FIXTURE_DIR, "test-only-wrap-key.pub.pem"), "utf8");

export function openForTest(envelope: Buffer, aad: Buffer, privateKeyPem = TEST_PRIVATE_KEY): { slot: number; plaintext: Buffer } {
  if (envelope.subarray(0, 4).toString("latin1") !== "KCE1") throw new Error("bad magic");
  const slot = envelope.readUInt8(4);
  const wrappedLen = envelope.readUInt16BE(5);
  let at = 7;
  const wrapped = envelope.subarray(at, (at += wrappedLen));
  const nonce = envelope.subarray(at, (at += 12));
  const body = envelope.subarray(at);
  const dek = privateDecrypt({ key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, wrapped);
  const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(body.subarray(body.length - 16));
  const plaintext = Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]);
  return { slot, plaintext };
}
