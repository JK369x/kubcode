//! Stripe-Signature verification (Stripe's documented scheme).
use billing_lambda::webhook::{sign, verify, TOLERANCE_SECS};

const S: &[u8] = b"whsec_FIXTUREONLY0000000000000000";
const NOW: u64 = 1_700_000_000;

#[test]
fn matches_a_known_vector() {
    // HMAC-SHA256(key, "1700000000.{}") computed independently with Python's hmac.
    assert_eq!(
        sign(S, NOW, b"{}"),
        "t=1700000000,v1=9de40014be5e113aa8edcd8a969d6e13d7360603ae5aa848593aeb9671dbe4fb"
    );
}

#[test]
fn accepts_good_rejects_bad() {
    let h = sign(S, NOW, b"{}");
    assert!(verify(&[S.to_vec()], Some(&h), b"{}", NOW).is_ok());
    assert!(verify(&[S.to_vec()], Some(&h), b"{} ", NOW).is_err());
    assert!(verify(&[S.to_vec()], Some(&h), b"{}", NOW + TOLERANCE_SECS + 1).is_err());
    assert!(verify(&[S.to_vec()], Some(&h), b"{}", NOW + TOLERANCE_SECS).is_ok());
    assert!(verify(&[], Some(&h), b"{}", NOW).is_err());
    assert!(verify(&[S.to_vec()], None, b"{}", NOW).is_err());
    for bad in [
        "",
        "t=",
        "v1=abc",
        "t=abc,v1=00",
        "garbage",
        &format!("t={NOW}"),
    ] {
        assert!(
            verify(&[S.to_vec()], Some(bad), b"{}", NOW).is_err(),
            "{bad}"
        );
    }
    // Rotation: either secret works.
    assert!(verify(
        &[b"whsec_old0000000000000000".to_vec(), S.to_vec()],
        Some(&h),
        b"{}",
        NOW
    )
    .is_ok());
    // v0 / unknown schemes are ignored.
    assert!(verify(
        &[S.to_vec()],
        Some(&format!("t={NOW},v0={}", "0".repeat(64))),
        b"{}",
        NOW
    )
    .is_err());
}
