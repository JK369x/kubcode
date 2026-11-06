//! Sealing with the wrap key's PUBLIC half (no KMS call), used by the
//! Lambdas when they store tokens they obtained. Same format as the
//! TypeScript sealer in lib/keys/envelope.ts.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use rand_core::{OsRng, RngCore};
use rsa::pkcs8::DecodePublicKey;
use rsa::traits::PublicKeyParts;
use rsa::{Oaep, RsaPublicKey};
use sha2::Sha256;
use zeroize::Zeroizing;

use crate::{
    EnvelopeError, SecretContext, MAGIC, MAX_SECRET_BYTES, NONCE_BYTES, WRAPPED_DEK_BYTES,
};

/// An RSA-4096 public key bound to its envelope slot.
pub struct WrapPublicKey {
    slot: u8,
    key: RsaPublicKey,
}

impl std::fmt::Debug for WrapPublicKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WrapPublicKey")
            .field("slot", &self.slot)
            .finish_non_exhaustive()
    }
}

impl WrapPublicKey {
    /// The envelope slot this key seals into.
    pub fn slot(&self) -> u8 {
        self.slot
    }

    /// Accepts only an SPKI (`BEGIN PUBLIC KEY`) PEM of an RSA-4096 key, slot 1..=255.
    pub fn from_spki_pem(slot: u8, pem: &str) -> Result<Self, EnvelopeError> {
        if slot == 0 {
            return Err(EnvelopeError::BadKey);
        }
        let key = RsaPublicKey::from_public_key_pem(pem).map_err(|_| EnvelopeError::BadKey)?;
        if key.size() != WRAPPED_DEK_BYTES {
            return Err(EnvelopeError::BadKey);
        }
        Ok(Self { slot, key })
    }
}

pub fn seal(
    ctx: &SecretContext,
    plaintext: &[u8],
    key: &WrapPublicKey,
) -> Result<Vec<u8>, EnvelopeError> {
    if plaintext.is_empty() || plaintext.len() > MAX_SECRET_BYTES {
        return Err(EnvelopeError::BadPlaintext);
    }
    let mut dek = Zeroizing::new([0u8; 32]);
    OsRng.fill_bytes(dek.as_mut());
    let mut nonce = [0u8; NONCE_BYTES];
    OsRng.fill_bytes(&mut nonce);
    let wrapped = key
        .key
        .encrypt(&mut OsRng, Oaep::new::<Sha256>(), dek.as_ref())
        .map_err(|_| EnvelopeError::BadKey)?;
    let cipher = Aes256Gcm::new_from_slice(dek.as_ref()).map_err(|_| EnvelopeError::BadKey)?;
    let aad = ctx.aad();
    let body = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad: &aad,
            },
        )
        .map_err(|_| EnvelopeError::BadPlaintext)?;

    let mut out = Vec::with_capacity(7 + wrapped.len() + NONCE_BYTES + body.len());
    out.extend_from_slice(MAGIC);
    out.push(key.slot);
    out.extend_from_slice(&(wrapped.len() as u16).to_be_bytes());
    out.extend_from_slice(&wrapped);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&body);
    Ok(out)
}
