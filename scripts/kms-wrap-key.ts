// Owner-run tooling for alias/kubcode-secrets-wrap (docs/design/settings-keys.md §1).
// Uses the aws CLI with the caller's own credentials; refuses any account but
// kubcode's. Prints no key material (the public key is not secret, but the
// test DEK below is random and never shown).
//
//   npm run keys:wrap-key -- export
//     After the admin `pulumi up` created the key: fetches the public key,
//     checks RSA_4096 / ENCRYPT_DECRYPT / RSAES_OAEP_SHA_256, writes
//     lib/keys/secrets-wrap-v1.pub.pem and prints the SPKI SHA-256 fingerprint
//     to pin in the TS test and the Rust crate.
//
//   npm run keys:wrap-key -- interop --expect-denied
//     Seals a random DEK with Node (RSA-OAEP, SHA-256 + MGF1-SHA-256) using
//     the committed PEM and asks KMS to Decrypt it. As the admin this must be
//     AccessDenied (only kubcode-lambda-* roles may decrypt).
//
//   npm run keys:wrap-key -- interop
//     Same, expecting KMS to return the DEK. Run it with the step-5 Lambda
//     role's credentials (or inside that Lambda): the end-to-end interop check.
import { execFileSync } from "node:child_process";
import { constants, publicEncrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pemFromSpkiDer, spkiSha256 } from "../lib/keys/wrap-key-tools";

const ACCOUNT = "955758449820";
const REGION = "ap-southeast-1";
const ALIAS = "alias/kubcode-secrets-wrap";
const PEM_PATH = path.join(__dirname, "..", "lib", "keys", "secrets-wrap-v1.pub.pem");

function aws(args: string[]): string {
  return execFileSync("aws", [...args, "--region", REGION, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function checkAccount(): void {
  const id = JSON.parse(aws(["sts", "get-caller-identity"])) as { Account: string; Arn: string };
  if (id.Account !== ACCOUNT) throw new Error(`wrong AWS account ${id.Account}; expected ${ACCOUNT}`);
  console.log(`[wrap-key] caller ${id.Arn}`);
}

function kmsPublicPem(): { pem: string; keyId: string } {
  const r = JSON.parse(aws(["kms", "get-public-key", "--key-id", ALIAS])) as {
    KeyId: string;
    PublicKey: string;
    KeySpec: string;
    KeyUsage: string;
    EncryptionAlgorithms?: string[];
  };
  if (r.KeySpec !== "RSA_4096") throw new Error(`KeySpec ${r.KeySpec}, expected RSA_4096`);
  if (r.KeyUsage !== "ENCRYPT_DECRYPT") throw new Error(`KeyUsage ${r.KeyUsage}, expected ENCRYPT_DECRYPT`);
  if (!r.EncryptionAlgorithms?.includes("RSAES_OAEP_SHA_256")) throw new Error("key does not offer RSAES_OAEP_SHA_256");
  return { pem: pemFromSpkiDer(Buffer.from(r.PublicKey, "base64")), keyId: r.KeyId };
}

function exportKey(): void {
  checkAccount();
  const { pem, keyId } = kmsPublicPem();
  const fp = spkiSha256(pem);
  if (existsSync(PEM_PATH)) {
    const existing = spkiSha256(readFileSync(PEM_PATH, "utf8"));
    if (existing !== fp) throw new Error(`${PEM_PATH} holds a different key (${existing}); not overwriting`);
    console.log("[wrap-key] committed PEM already matches KMS");
  } else {
    writeFileSync(PEM_PATH, pem);
    console.log(`[wrap-key] wrote ${path.relative(process.cwd(), PEM_PATH)}`);
  }
  console.log(`[wrap-key] key ${keyId}`);
  console.log(`[wrap-key] SPKI SHA-256 ${fp}`);
}

function interop(expectDenied: boolean): void {
  checkAccount();
  if (!existsSync(PEM_PATH)) throw new Error(`${PEM_PATH} missing: run export first`);
  const pem = readFileSync(PEM_PATH, "utf8");
  if (spkiSha256(pem) !== spkiSha256(kmsPublicPem().pem)) throw new Error("committed PEM does not match the KMS key");
  const dek = randomBytes(32);
  const wrapped = publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, dek);
  const dir = mkdtempSync(path.join(tmpdir(), "kubcode-wrap-"));
  try {
    const blob = path.join(dir, "wrapped.bin");
    writeFileSync(blob, wrapped, { mode: 0o600 });
    let out: string;
    try {
      out = aws(["kms", "decrypt", "--key-id", ALIAS, "--encryption-algorithm", "RSAES_OAEP_SHA_256", "--ciphertext-blob", `fileb://${blob}`]);
    } catch (error) {
      const stderr = String((error as { stderr?: unknown }).stderr ?? "");
      if (expectDenied && /AccessDenied/.test(stderr)) {
        console.log("[wrap-key] PASS: Decrypt is AccessDenied for this caller, as expected");
        return;
      }
      throw new Error(`kms decrypt failed: ${stderr.split("\n").find((l) => l.trim()) ?? "unknown error"}`);
    }
    if (expectDenied) throw new Error("FAIL: this caller CAN decrypt with the wrap key; only kubcode-lambda-* roles should");
    const plaintext = Buffer.from((JSON.parse(out) as { Plaintext: string }).Plaintext, "base64");
    if (plaintext.length !== dek.length || !timingSafeEqual(plaintext, dek)) throw new Error("FAIL: KMS returned a different DEK");
    console.log("[wrap-key] PASS: Node RSA-OAEP-SHA256 ciphertext decrypts in KMS (RSAES_OAEP_SHA_256)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    dek.fill(0);
  }
}

function main(): number {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === "export") exportKey();
    else if (cmd === "interop") interop(rest.includes("--expect-denied"));
    else {
      console.error("usage: npm run keys:wrap-key -- export | interop [--expect-denied]");
      return 2;
    }
    return 0;
  } catch (error) {
    console.error(`[wrap-key] ${(error as Error).message}`);
    return 1;
  }
}

process.exit(main());
