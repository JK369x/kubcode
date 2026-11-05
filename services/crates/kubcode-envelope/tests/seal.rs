use kubcode_envelope::{
    open, seal, EnvelopeError, LocalRsaUnwrapper, SecretContext, WrapPublicKey, MAX_SECRET_BYTES,
};

const FIXTURES: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../tests/fixtures/envelope"
);
const USER: &str = "0b6e4f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ROW: &str = "11111111-2222-4333-8444-555555555555";

fn fixture(name: &str) -> String {
    std::fs::read_to_string(format!("{FIXTURES}/{name}")).unwrap()
}

fn wrap_key() -> WrapPublicKey {
    WrapPublicKey::from_spki_pem(1, &fixture("test-only-wrap-key.pub.pem")).unwrap()
}

fn unwrapper() -> LocalRsaUnwrapper {
    LocalRsaUnwrapper::from_pkcs8_pem(1, &fixture("test-only-wrap-key.pem")).unwrap()
}

fn ctx(version: u32) -> SecretContext {
    SecretContext::new("oauth_connections", ROW, USER, "youtube", version).unwrap()
}

#[test]
fn a_token_sealed_in_rust_opens_only_under_the_same_row_context() {
    let envelope = seal(&ctx(1), b"1//refresh-token-fixture", &wrap_key()).unwrap();
    let plain = pollster::block_on(open(&envelope, &ctx(1), &unwrapper())).unwrap();
    assert_eq!(plain.as_slice(), b"1//refresh-token-fixture");
    assert_eq!(
        pollster::block_on(open(&envelope, &ctx(2), &unwrapper())).unwrap_err(),
        EnvelopeError::DecryptFailed
    );
}

#[test]
fn sealing_refuses_empty_or_oversized_plaintext() {
    assert!(seal(&ctx(1), &vec![b'a'; MAX_SECRET_BYTES], &wrap_key()).is_ok());
    for bad in [vec![], vec![b'a'; MAX_SECRET_BYTES + 1]] {
        assert_eq!(
            seal(&ctx(1), &bad, &wrap_key()).unwrap_err(),
            EnvelopeError::BadPlaintext
        );
    }
}

#[test]
fn wrap_keys_must_be_rsa_4096_public_keys_with_a_slot() {
    assert_eq!(
        WrapPublicKey::from_spki_pem(1, &fixture("test-only-rsa2048.pub.pem")).unwrap_err(),
        EnvelopeError::BadKey
    );
    assert_eq!(
        WrapPublicKey::from_spki_pem(1, &fixture("test-only-wrap-key.pem")).unwrap_err(),
        EnvelopeError::BadKey
    );
    assert_eq!(
        WrapPublicKey::from_spki_pem(0, &fixture("test-only-wrap-key.pub.pem")).unwrap_err(),
        EnvelopeError::BadKey
    );
}

#[test]
fn an_envelope_for_an_unknown_slot_is_refused_before_any_unwrap() {
    let other_slot =
        WrapPublicKey::from_spki_pem(2, &fixture("test-only-wrap-key.pub.pem")).unwrap();
    let envelope = seal(&ctx(1), b"x", &other_slot).unwrap();
    assert_eq!(
        pollster::block_on(open(&envelope, &ctx(1), &unwrapper())).unwrap_err(),
        EnvelopeError::UnknownSlot
    );
}

#[test]
fn malformed_row_contexts_are_refused() {
    for (table, row, user, kind, version) in [
        ("users", ROW, USER, "youtube", 1),
        ("oauth_connections", "not-a-uuid", USER, "youtube", 1),
        (
            "oauth_connections",
            ROW,
            "0B6E4F3A-1C2D-4E5F-8A9B-0C1D2E3F4A5B",
            "youtube",
            1,
        ),
        ("oauth_connections", ROW, USER, "Bad|Kind", 1),
        ("oauth_connections", ROW, USER, "y", 1),
        ("oauth_connections", ROW, USER, "youtube", 0),
    ] {
        assert_eq!(
            SecretContext::new(table, row, user, kind, version).unwrap_err(),
            EnvelopeError::BadContext,
            "{table} {row} {user} {kind} {version}"
        );
    }
}
