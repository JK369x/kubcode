//! Pins the production wrap public key (docs/design/settings-keys.md §1): the
//! same SPKI SHA-256 as tests/wrap-key.test.ts, taken from
//! `aws kms get-public-key` at creation. A key swapped in the repo fails here.
use kubcode_envelope::keys::{kms_key_arn, WRAP_KEY_V1_ARN, WRAP_KEY_V1_PEM, WRAP_KEY_V1_SLOT, WRAP_KEY_V1_SPKI_SHA256};
use kubcode_envelope::WrapPublicKey;
use rsa::pkcs8::{DecodePublicKey, EncodePublicKey};
use sha2::{Digest, Sha256};

const PINNED: &str = "3e1ff570c6db6682616c623cffbcfd84a572291462d4b564f30efd65d9268ac5";

#[test]
fn committed_pem_matches_the_pinned_fingerprint() {
    assert_eq!(WRAP_KEY_V1_SPKI_SHA256, PINNED);
    let key = rsa::RsaPublicKey::from_public_key_pem(WRAP_KEY_V1_PEM).expect("SPKI PEM");
    let der = key.to_public_key_der().expect("DER");
    assert_eq!(hex::encode(Sha256::digest(der.as_bytes())), PINNED);
}

#[test]
fn slot_one_is_the_only_allowlisted_kms_key() {
    assert_eq!(WRAP_KEY_V1_SLOT, 1);
    assert_eq!(kms_key_arn(1), Some(WRAP_KEY_V1_ARN));
    assert_eq!(
        WRAP_KEY_V1_ARN,
        "arn:aws:kms:ap-southeast-1:955758449820:key/39320743-1ef2-4627-b212-df76db143dc3"
    );
    for slot in [0u8, 2, 255] {
        assert_eq!(kms_key_arn(slot), None, "slot {slot}");
    }
}

#[test]
fn the_pinned_key_is_a_valid_wrap_key() {
    WrapPublicKey::from_spki_pem(WRAP_KEY_V1_SLOT, WRAP_KEY_V1_PEM).expect("RSA-4096 SPKI");
}
