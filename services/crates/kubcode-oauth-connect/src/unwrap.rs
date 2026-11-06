//! DEK unwrapping through KMS for envelope v1. The slot in an envelope maps to
//! a key ARN only through `kubcode_envelope::keys` (the allowlist), so a row
//! can never point this Lambda at another key.

use kubcode_envelope::keys::kms_key_arn;
use kubcode_envelope::{DekUnwrapper, EnvelopeError};
use zeroize::Zeroizing;

use crate::aws::Kms;

pub struct KmsUnwrapper<K: Kms> {
    kms: K,
}

impl<K: Kms> KmsUnwrapper<K> {
    pub fn new(kms: K) -> Self {
        Self { kms }
    }
}

impl<K: Kms> DekUnwrapper for KmsUnwrapper<K> {
    async fn unwrap_dek(
        &self,
        slot: u8,
        wrapped: &[u8],
    ) -> Result<Zeroizing<[u8; 32]>, EnvelopeError> {
        let arn = kms_key_arn(slot).ok_or(EnvelopeError::UnknownSlot)?;
        let plain = self
            .kms
            .decrypt(arn, wrapped)
            .await
            .map_err(|_| EnvelopeError::UnwrapFailed)?;
        if plain.len() != 32 {
            return Err(EnvelopeError::UnwrapFailed);
        }
        let mut dek = Zeroizing::new([0u8; 32]);
        dek.copy_from_slice(&plain);
        Ok(dek)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aws::AwsError;
    use std::sync::Mutex;

    struct FakeKms {
        seen: Mutex<Vec<String>>,
        answer: Result<Vec<u8>, AwsError>,
    }

    impl Kms for FakeKms {
        async fn decrypt(
            &self,
            key_arn: &str,
            _blob: &[u8],
        ) -> Result<Zeroizing<Vec<u8>>, AwsError> {
            self.seen.lock().unwrap().push(key_arn.to_owned());
            self.answer.clone().map(Zeroizing::new)
        }
    }

    fn unwrapper(answer: Result<Vec<u8>, AwsError>) -> KmsUnwrapper<FakeKms> {
        KmsUnwrapper::new(FakeKms {
            seen: Mutex::new(vec![]),
            answer,
        })
    }

    #[tokio::test]
    async fn slot_one_goes_to_the_pinned_key_arn() {
        let u = unwrapper(Ok(vec![7u8; 32]));
        let dek = u.unwrap_dek(1, b"wrapped").await.unwrap();
        assert_eq!(*dek, [7u8; 32]);
        assert_eq!(
            *u.kms.seen.lock().unwrap(),
            [kubcode_envelope::keys::WRAP_KEY_V1_ARN]
        );
    }

    #[tokio::test]
    async fn unknown_slots_never_reach_kms_and_bad_answers_fail() {
        let u = unwrapper(Ok(vec![7u8; 32]));
        assert_eq!(
            u.unwrap_dek(2, b"w").await.err(),
            Some(EnvelopeError::UnknownSlot)
        );
        assert!(u.kms.seen.lock().unwrap().is_empty());
        assert_eq!(
            unwrapper(Ok(vec![1u8; 31])).unwrap_dek(1, b"w").await.err(),
            Some(EnvelopeError::UnwrapFailed)
        );
        assert_eq!(
            unwrapper(Err(AwsError)).unwrap_dek(1, b"w").await.err(),
            Some(EnvelopeError::UnwrapFailed)
        );
    }
}
