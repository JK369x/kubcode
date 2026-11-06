//! HMAC check that a request came from the kubcode web host
//! (`lib/keys/connect-config.ts` `connectHeaders`). Same KUBCODE-HMAC-V1 scheme
//! as the package signer, with the path signed too because this Lambda serves
//! several routes. The nonce is returned so the caller can reject replays.

use hmac::{Hmac, Mac};
use lambda_http::http::HeaderMap;
use sha2::{Digest, Sha256};

/// Any failure; carries no detail so nothing from the request is echoed.
#[derive(Debug, PartialEq, Eq)]
pub struct Unauthorized;

/// Accepted clock skew. Replays inside the window are stopped by the nonce table.
pub const MAX_SKEW_SECS: u64 = 300;

fn is_decimal(s: &str) -> bool {
    !s.is_empty() && s.len() <= 20 && s.bytes().all(|b| b.is_ascii_digit())
}

fn is_lower_hex(s: &str, len: usize) -> bool {
    s.len() == len && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn header<'a>(headers: &'a HeaderMap, name: &str) -> Result<&'a str, Unauthorized> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or(Unauthorized)
}

fn mac(key: &[u8], path: &str, timestamp: &str, nonce: &str, body: &[u8]) -> Hmac<Sha256> {
    let string_to_sign = format!(
        "KUBCODE-HMAC-V1\nPOST\n{path}\n{timestamp}\n{nonce}\n{}",
        hex::encode(Sha256::digest(body))
    );
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(string_to_sign.as_bytes());
    mac
}

/// Lowercase hex signature the web host sends.
pub fn sign(key: &[u8], path: &str, timestamp: &str, nonce: &str, body: &[u8]) -> String {
    hex::encode(
        mac(key, path, timestamp, nonce, body)
            .finalize()
            .into_bytes(),
    )
}

/// Verifies the signature for `path` and returns the request's nonce.
pub fn verify(
    key: &[u8],
    path: &str,
    headers: &HeaderMap,
    body: &[u8],
    now: u64,
) -> Result<String, Unauthorized> {
    let timestamp = header(headers, "x-kubcode-timestamp")?;
    let nonce = header(headers, "x-kubcode-nonce")?;
    let signature = header(headers, "x-kubcode-signature")?;
    if !is_decimal(timestamp) || !is_lower_hex(nonce, 32) || !is_lower_hex(signature, 64) {
        return Err(Unauthorized);
    }
    let sent_at: u64 = timestamp.parse().map_err(|_| Unauthorized)?;
    if sent_at.abs_diff(now) > MAX_SKEW_SECS {
        return Err(Unauthorized);
    }
    let signature = hex::decode(signature).map_err(|_| Unauthorized)?;
    // verify_slice compares in constant time.
    mac(key, path, timestamp, nonce, body)
        .verify_slice(&signature)
        .map_err(|_| Unauthorized)?;
    Ok(nonce.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &[u8] = b"FIXTURE-ONLY-connect-hmac-key-0000000000000000";
    const NONCE: &str = "00112233445566778899aabbccddeeff";
    const BODY: &[u8] = br#"{"state":"s","code":"c"}"#;
    // Same inputs as tests/connect-routes.test.ts, so both sides agree.
    const NOW: u64 = 1_700_000_000;

    fn headers(ts: &str, nonce: &str, sig: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("x-kubcode-timestamp", ts.parse().unwrap());
        h.insert("x-kubcode-nonce", nonce.parse().unwrap());
        h.insert("x-kubcode-signature", sig.parse().unwrap());
        h
    }

    #[test]
    fn accepts_a_correct_signature_and_returns_the_nonce() {
        let sig = sign(KEY, "/oauth/exchange", "1700000000", NONCE, BODY);
        let h = headers("1700000000", NONCE, &sig);
        assert_eq!(
            verify(KEY, "/oauth/exchange", &h, BODY, NOW),
            Ok(NONCE.into())
        );
    }

    #[test]
    fn matches_the_web_hosts_signature() {
        // From lib/keys/connect-config.ts connectHeaders with these exact inputs;
        // pinned here and in tests/connect-routes.test.ts.
        assert_eq!(
            sign(KEY, "/oauth/exchange", "1700000000", NONCE, BODY),
            "116e567e07b1a37d5a5eb4c484c08d80ea0043ec7a95e2412d3f1507505492db"
        );
    }

    #[test]
    fn the_path_is_part_of_the_signature() {
        let sig = sign(KEY, "/oauth/exchange", "1700000000", NONCE, BODY);
        let h = headers("1700000000", NONCE, &sig);
        assert_eq!(
            verify(KEY, "/oauth/revoke", &h, BODY, NOW),
            Err(Unauthorized)
        );
    }

    #[test]
    fn rejects_tampering_skew_and_malformed_headers() {
        let sig = sign(KEY, "/oauth/exchange", "1700000000", NONCE, BODY);
        let h = headers("1700000000", NONCE, &sig);
        assert!(verify(KEY, "/oauth/exchange", &h, b"{}", NOW).is_err());
        assert!(verify(
            b"another-key-0000000000000000000000",
            "/oauth/exchange",
            &h,
            BODY,
            NOW
        )
        .is_err());
        assert!(verify(KEY, "/oauth/exchange", &h, BODY, NOW + MAX_SKEW_SECS + 1).is_err());
        assert!(verify(KEY, "/oauth/exchange", &h, BODY, NOW + MAX_SKEW_SECS).is_ok());
        for (ts, nonce, s) in [
            ("+1700000000", NONCE, sig.as_str()),
            ("1700000000", "0011", sig.as_str()),
            ("1700000000", NONCE, &sig[..63]),
            ("1700000000", &NONCE.to_uppercase(), sig.as_str()),
        ] {
            assert!(verify(KEY, "/oauth/exchange", &headers(ts, nonce, s), BODY, NOW).is_err());
        }
        assert!(verify(KEY, "/oauth/exchange", &HeaderMap::new(), BODY, NOW).is_err());
    }
}
