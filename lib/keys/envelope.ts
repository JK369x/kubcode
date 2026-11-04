// Envelope v1 for per-user secrets (docs/design/settings-keys.md §1).
// The server only ever SEALS: a random AES-256-GCM key (DEK) per write,
// wrapped with the KMS RSA public key (RSA-OAEP-SHA256). Only the Rust
// Lambdas can unwrap it, through kms:Decrypt. The AAD binds the ciphertext
// to its row, owner, kind and version; decryptors rebuild it from row
// columns, never from the envelope.
//
// Layout: "KCE1" | slot u8 | wrapped length u16 BE | wrapped DEK | nonce(12) | ciphertext | tag(16)
import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes, type KeyObject } from "node:crypto";

export type SecretTable = "user_secrets" | "oauth_connections" | "oauth_connect_intents";

export type SecretContext = {
  table: SecretTable;
  rowId: string;
  userId: string;
  kind: string;
  version: number;
};

export type WrapKey = { slot: number; publicKeyPem: string };

export const MAX_SECRET_BYTES = 4096;
const WRAP_KEY_BITS = 4096;
const MAGIC = Buffer.from("KCE1", "latin1");
const TABLES: readonly SecretTable[] = ["user_secrets", "oauth_connections", "oauth_connect_intents"];
// Lowercase canonical UUIDs only, so TS and Rust build byte-identical AAD.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Same rule as the DB CHECK on user_secrets.kind.
const KIND = /^[a-z][a-z0-9_]{1,39}$/;

export class EnvelopeError extends Error {
  constructor(code: "ENVELOPE_BAD_CONTEXT" | "ENVELOPE_BAD_PLAINTEXT" | "ENVELOPE_BAD_KEY") {
    super(code);
    this.name = "EnvelopeError";
  }
}

function checkContext(ctx: SecretContext): void {
  const ok =
    TABLES.includes(ctx.table) &&
    UUID.test(ctx.rowId) &&
    UUID.test(ctx.userId) &&
    KIND.test(ctx.kind) &&
    Number.isSafeInteger(ctx.version) &&
    ctx.version >= 1;
  if (!ok) throw new EnvelopeError("ENVELOPE_BAD_CONTEXT");
}

// Only an SPKI PEM is accepted: createPublicKey would silently derive the
// public half from a private key, and no private key belongs on this side.
function wrapPublicKey(key: WrapKey): KeyObject {
  if (!Number.isInteger(key.slot) || key.slot < 1 || key.slot > 255) throw new EnvelopeError("ENVELOPE_BAD_KEY");
  if (!/^\s*-----BEGIN PUBLIC KEY-----/.test(key.publicKeyPem)) throw new EnvelopeError("ENVELOPE_BAD_KEY");
  let pub: KeyObject;
  try {
    pub = createPublicKey(key.publicKeyPem);
  } catch {
    throw new EnvelopeError("ENVELOPE_BAD_KEY");
  }
  if (pub.asymmetricKeyType !== "rsa" || pub.asymmetricKeyDetails?.modulusLength !== WRAP_KEY_BITS)
    throw new EnvelopeError("ENVELOPE_BAD_KEY");
  return pub;
}

export function secretAad(ctx: SecretContext): Buffer {
  checkContext(ctx);
  return Buffer.from(`kubcode:v1|${ctx.table}|${ctx.rowId}|${ctx.userId}|${ctx.kind}|${ctx.version}`, "utf8");
}

export function sealSecret(ctx: SecretContext, plaintext: string | Uint8Array, key: WrapKey): Buffer {
  const aad = secretAad(ctx);
  const pub = wrapPublicKey(key);
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : Buffer.from(plaintext);
  if (data.length === 0 || data.length > MAX_SECRET_BYTES) throw new EnvelopeError("ENVELOPE_BAD_PLAINTEXT");
  const dek = randomBytes(32);
  const nonce = randomBytes(12);
  const wrapped = publicEncrypt(
    { key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    dek,
  );
  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  dek.fill(0);
  const header = Buffer.alloc(3);
  header.writeUInt8(key.slot, 0);
  header.writeUInt16BE(wrapped.length, 1);
  return Buffer.concat([MAGIC, header, wrapped, nonce, body]);
}
