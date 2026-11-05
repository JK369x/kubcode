//! Allowlisted wrap keys (docs/design/settings-keys.md §1). An envelope's
//! `key_slot` maps to a KMS key ARN here, so a row can never point a Lambda at
//! another key. The public key is the committed `lib/keys/secrets-wrap-v1.pub.pem`;
//! its SPKI SHA-256 is pinned here and in `tests/wrap-key.test.ts`.

/// Slot of wrap key v1 (`alias/kubcode-secrets-wrap`).
pub const WRAP_KEY_V1_SLOT: u8 = 1;

/// The KMS key behind slot 1 (created 2026-11-05).
pub const WRAP_KEY_V1_ARN: &str =
    "arn:aws:kms:ap-southeast-1:955758449820:key/39320743-1ef2-4627-b212-df76db143dc3";

/// SPKI (`BEGIN PUBLIC KEY`) PEM of slot 1, as committed for the web host.
pub const WRAP_KEY_V1_PEM: &str = include_str!("../../../../lib/keys/secrets-wrap-v1.pub.pem");

/// Lowercase hex SHA-256 of slot 1's SPKI DER, from `aws kms get-public-key`.
pub const WRAP_KEY_V1_SPKI_SHA256: &str =
    "3e1ff570c6db6682616c623cffbcfd84a572291462d4b564f30efd65d9268ac5";

/// The KMS key ARN for an envelope slot, or `None` for any slot not allowlisted.
pub fn kms_key_arn(slot: u8) -> Option<&'static str> {
    match slot {
        WRAP_KEY_V1_SLOT => Some(WRAP_KEY_V1_ARN),
        _ => None,
    }
}
