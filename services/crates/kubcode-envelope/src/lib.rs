//! Envelope v1 for kubcode per-user secrets (docs/design/settings-keys.md §1).
//!
//! Layout: `"KCE1" | slot u8 | wrapped len u16 BE | RSA-OAEP-SHA256(DEK) | nonce(12) | ciphertext | tag(16)`.
//!
//! The DEK is unwrapped by a [`DekUnwrapper`]: KMS (`kms:Decrypt`,
//! `RSAES_OAEP_SHA_256`) in the Lambdas, or a local private key in tests
//! (feature `local-unwrap`). The AAD is always rebuilt from row columns via
//! [`SecretContext`], never read from the envelope, so a ciphertext copied to
//! another row, owner, kind or version does not open.

use std::future::Future;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use zeroize::Zeroizing;

mod context;
pub mod keys;
mod seal;
pub use context::{SecretContext, SecretTable};
pub use seal::{seal, WrapPublicKey};

#[cfg(feature = "local-unwrap")]
mod local;
#[cfg(feature = "local-unwrap")]
pub use local::LocalRsaUnwrapper;

/// Largest plaintext accepted by the sealers (same limit as the TypeScript side).
pub const MAX_SECRET_BYTES: usize = 4096;
/// RSA-4096 wraps to exactly 512 bytes.
pub const WRAPPED_DEK_BYTES: usize = 512;

const MAGIC: &[u8; 4] = b"KCE1";
const NONCE_BYTES: usize = 12;
const TAG_BYTES: usize = 16;
const HEADER_BYTES: usize = 4 + 1 + 2;

/// Fixed error codes: never carry key material, plaintext or provider text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum EnvelopeError {
    #[error("ENVELOPE_BAD_CONTEXT")]
    BadContext,
    #[error("ENVELOPE_BAD_PLAINTEXT")]
    BadPlaintext,
    #[error("ENVELOPE_BAD_KEY")]
    BadKey,
    #[error("ENVELOPE_MALFORMED")]
    Malformed,
    #[error("ENVELOPE_UNKNOWN_SLOT")]
    UnknownSlot,
    #[error("ENVELOPE_UNWRAP_FAILED")]
    UnwrapFailed,
    #[error("ENVELOPE_DECRYPT_FAILED")]
    DecryptFailed,
}

/// Unwraps a 32-byte DEK for an allowlisted key slot.
pub trait DekUnwrapper {
    fn unwrap_dek(
        &self,
        slot: u8,
        wrapped: &[u8],
    ) -> impl Future<Output = Result<Zeroizing<[u8; 32]>, EnvelopeError>> + Send;
}

struct Parsed<'a> {
    slot: u8,
    wrapped: &'a [u8],
    nonce: &'a [u8],
    body: &'a [u8],
}

fn parse(envelope: &[u8]) -> Result<Parsed<'_>, EnvelopeError> {
    if envelope.len() < HEADER_BYTES || &envelope[..4] != MAGIC {
        return Err(EnvelopeError::Malformed);
    }
    let slot = envelope[4];
    let wrapped_len = u16::from_be_bytes([envelope[5], envelope[6]]) as usize;
    if wrapped_len != WRAPPED_DEK_BYTES {
        return Err(EnvelopeError::Malformed);
    }
    let rest = &envelope[HEADER_BYTES..];
    if rest.len() < wrapped_len + NONCE_BYTES + TAG_BYTES + 1 {
        return Err(EnvelopeError::Malformed);
    }
    let (wrapped, rest) = rest.split_at(wrapped_len);
    let (nonce, body) = rest.split_at(NONCE_BYTES);
    Ok(Parsed {
        slot,
        wrapped,
        nonce,
        body,
    })
}

/// Opens an envelope for the row described by `ctx`.
pub async fn open<U: DekUnwrapper>(
    envelope: &[u8],
    ctx: &SecretContext,
    unwrapper: &U,
) -> Result<Zeroizing<Vec<u8>>, EnvelopeError> {
    let p = parse(envelope)?;
    let dek = unwrapper.unwrap_dek(p.slot, p.wrapped).await?;
    let cipher =
        Aes256Gcm::new_from_slice(dek.as_ref()).map_err(|_| EnvelopeError::UnwrapFailed)?;
    let aad = ctx.aad();
    let plain = cipher
        .decrypt(
            Nonce::from_slice(p.nonce),
            Payload {
                msg: p.body,
                aad: &aad,
            },
        )
        .map_err(|_| EnvelopeError::DecryptFailed)?;
    Ok(Zeroizing::new(plain))
}
