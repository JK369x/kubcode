//! TEST/LOCAL ONLY: unwraps DEKs with a local RSA private key. Production
//! never holds the private key; it lives only inside KMS. (The `rsa` crate's
//! private-key operations are not constant-time, RUSTSEC-2023-0071, which is
//! another reason this stays behind the `local-unwrap` feature.)

use std::future::Future;

use rsa::pkcs8::DecodePrivateKey;
use rsa::{Oaep, RsaPrivateKey};
use sha2::Sha256;
use zeroize::Zeroizing;

use crate::{DekUnwrapper, EnvelopeError};

pub struct LocalRsaUnwrapper {
    slot: u8,
    key: RsaPrivateKey,
}

impl LocalRsaUnwrapper {
    pub fn from_pkcs8_pem(slot: u8, pem: &str) -> Result<Self, EnvelopeError> {
        let key = RsaPrivateKey::from_pkcs8_pem(pem).map_err(|_| EnvelopeError::BadKey)?;
        Ok(Self { slot, key })
    }
}

impl DekUnwrapper for LocalRsaUnwrapper {
    fn unwrap_dek(
        &self,
        slot: u8,
        wrapped: &[u8],
    ) -> impl Future<Output = Result<Zeroizing<[u8; 32]>, EnvelopeError>> + Send {
        let result = (|| {
            if slot != self.slot {
                return Err(EnvelopeError::UnknownSlot);
            }
            let dek = Zeroizing::new(
                self.key
                    .decrypt(Oaep::new::<Sha256>(), wrapped)
                    .map_err(|_| EnvelopeError::UnwrapFailed)?,
            );
            let out: [u8; 32] = dek
                .as_slice()
                .try_into()
                .map_err(|_| EnvelopeError::UnwrapFailed)?;
            Ok(Zeroizing::new(out))
        })();
        std::future::ready(result)
    }
}
