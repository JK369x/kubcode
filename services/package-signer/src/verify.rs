//! HMAC check that a request really came from the kubcode web app.

use hmac::{Hmac, Mac};
use lambda_http::http::HeaderMap;
use sha2::{Digest, Sha256};

/// Any failure: missing header, malformed value, stale timestamp, bad signature.
/// Deliberately carries no detail so callers cannot echo input back.
#[derive(Debug, PartialEq, Eq)]
pub struct Unauthorized;

const MAX_SKEW_SECS: u64 = 60;

/// Digits only: rejects signs, spaces and `+`, which `u64::from_str` partly allows.
fn is_decimal(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

/// Exactly `len` characters of `[0-9a-f]`, as the contract specifies.
fn is_lower_hex(s: &str, len: usize) -> bool {
    s.len() == len && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn header<'a>(headers: &'a HeaderMap, name: &str) -> Result<&'a str, Unauthorized> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or(Unauthorized)
}

fn mac(key: &[u8], timestamp: &str, nonce: &str, body: &[u8]) -> Hmac<Sha256> {
    // POST and /sign are fixed: the Lambda serves exactly one route.
    let string_to_sign = format!(
        "KUBCODE-HMAC-V1\nPOST\n/sign\n{timestamp}\n{nonce}\n{}",
        hex::encode(Sha256::digest(body))
    );
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(string_to_sign.as_bytes());
    mac
}

/// Lowercase hex signature the web app is expected to send.
pub fn sign(key: &[u8], timestamp: &str, nonce: &str, body: &[u8]) -> String {
    hex::encode(mac(key, timestamp, nonce, body).finalize().into_bytes())
}

pub fn verify(key: &[u8], headers: &HeaderMap, body: &[u8], now: u64) -> Result<(), Unauthorized> {
    let timestamp = header(headers, "x-kubcode-timestamp")?;
    let nonce = header(headers, "x-kubcode-nonce")?;
    let signature = header(headers, "x-kubcode-signature")?;

    if !is_decimal(timestamp) || !is_lower_hex(nonce, 32) || !is_lower_hex(signature, 64) {
        return Err(Unauthorized);
    }
    // is_decimal can still overflow u64; that is a rejection too.
    let sent_at: u64 = timestamp.parse().map_err(|_| Unauthorized)?;
    if sent_at.abs_diff(now) > MAX_SKEW_SECS {
        return Err(Unauthorized);
    }

    let signature = hex::decode(signature).map_err(|_| Unauthorized)?;
    // verify_slice compares in constant time.
    mac(key, timestamp, nonce, body)
        .verify_slice(&signature)
        .map_err(|_| Unauthorized)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Shared vector from docs/design/package-signer.md.
    pub const KEY: &[u8] = b"test-key-0123456789abcdef0123456789abcdef";
    pub const TIMESTAMP: &str = "1700000000";
    pub const NONCE: &str = "00112233445566778899aabbccddeeff";
    pub const BODY: &[u8] = br#"{"key":"packages/freshstack-what-if/0.1.0.zip","filename":"freshstack-what-if-0.1.0.zip","user":"11111111-2222-4333-8444-555555555555"}"#;
    pub const SIGNATURE: &str = "67bf738902a1cb865dec0c72499ffe52b4d30fe4247afc2399677eaa9db8f9be";

    pub fn headers(timestamp: &str, nonce: &str, signature: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("x-kubcode-timestamp", timestamp.parse().unwrap());
        h.insert("x-kubcode-nonce", nonce.parse().unwrap());
        h.insert("x-kubcode-signature", signature.parse().unwrap());
        h
    }

    #[test]
    fn accepts_the_shared_contract_vector() {
        let h = headers(TIMESTAMP, NONCE, SIGNATURE);
        assert_eq!(verify(KEY, &h, BODY, 1_700_000_000), Ok(()));
    }

    /// Headers correctly signed for `timestamp`, so only the clock can reject them.
    fn signed_at(timestamp: &str) -> HeaderMap {
        headers(timestamp, NONCE, &sign(KEY, timestamp, NONCE, BODY))
    }

    #[test]
    fn timestamp_window_is_plus_minus_60_seconds() {
        let now = 1_700_000_000;
        for (ts, ok) in [
            (now - 60, true),
            (now + 60, true),
            (now - 61, false),
            (now + 61, false),
        ] {
            let h = signed_at(&ts.to_string());
            let expected = if ok { Ok(()) } else { Err(Unauthorized) };
            assert_eq!(verify(KEY, &h, BODY, now), expected, "timestamp {ts}");
        }
    }

    #[test]
    fn rejects_a_malformed_nonce_even_when_the_signature_matches_it() {
        for nonce in [
            "",
            "0011",
            "00112233445566778899AABBCCDDEEFF",
            "zz112233445566778899aabbccddeeff",
        ] {
            let h = headers(TIMESTAMP, nonce, &sign(KEY, TIMESTAMP, nonce, BODY));
            assert_eq!(
                verify(KEY, &h, BODY, 1_700_000_000),
                Err(Unauthorized),
                "nonce {nonce:?}"
            );
        }
    }

    #[test]
    fn rejects_missing_headers() {
        for name in [
            "x-kubcode-timestamp",
            "x-kubcode-nonce",
            "x-kubcode-signature",
        ] {
            let mut h = headers(TIMESTAMP, NONCE, SIGNATURE);
            h.remove(name);
            assert_eq!(
                verify(KEY, &h, BODY, 1_700_000_000),
                Err(Unauthorized),
                "{name}"
            );
        }
    }

    #[test]
    fn rejects_non_hex_wrong_length_and_wrong_signatures() {
        let wrong = "0".repeat(64);
        let upper = SIGNATURE.to_uppercase();
        for sig in [
            "",
            "not-hex",
            "67bf",
            &wrong,
            &upper,
            &SIGNATURE[..62],
            &format!("{SIGNATURE}00"),
        ] {
            let h = headers(TIMESTAMP, NONCE, sig);
            assert_eq!(
                verify(KEY, &h, BODY, 1_700_000_000),
                Err(Unauthorized),
                "sig {sig:?}"
            );
        }
    }

    #[test]
    fn rejects_a_tampered_body_or_a_different_key() {
        let h = headers(TIMESTAMP, NONCE, SIGNATURE);
        let mut body = BODY.to_vec();
        body[10] ^= 1;
        assert_eq!(verify(KEY, &h, &body, 1_700_000_000), Err(Unauthorized));
        assert_eq!(
            verify(
                b"another-key-0123456789abcdef01234567",
                &h,
                BODY,
                1_700_000_000
            ),
            Err(Unauthorized)
        );
    }

    #[test]
    fn rejects_timestamps_that_are_not_plain_decimal_seconds() {
        for ts in [
            "",
            "+1700000000",
            " 1700000000",
            "1700000000.0",
            "-1",
            "1e9",
            "99999999999999999999999",
        ] {
            let h = signed_at(ts);
            assert_eq!(
                verify(KEY, &h, BODY, 1_700_000_000),
                Err(Unauthorized),
                "timestamp {ts:?}"
            );
        }
    }
}
