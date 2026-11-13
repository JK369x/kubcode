//! Stripe webhook signatures (`Stripe-Signature: t=…,v1=…[,v1=…]`):
//! HMAC-SHA256 of `"{t}.{raw body}"` with the endpoint secret, any `v1`
//! matching in constant time, `t` within 5 minutes. The raw bytes are checked
//! before any JSON parsing.

use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

pub const TOLERANCE_SECS: u64 = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BadSignature;

fn expected(secret: &[u8], t: &str, body: &[u8]) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("any key length");
    mac.update(t.as_bytes());
    mac.update(b".");
    mac.update(body);
    mac.finalize().into_bytes().into()
}

/// Verifies against every configured secret (current and, during a rotation,
/// the previous one).
pub fn verify(
    secrets: &[Vec<u8>],
    header: Option<&str>,
    body: &[u8],
    now: u64,
) -> Result<(), BadSignature> {
    let header = header.ok_or(BadSignature)?;
    if header.len() > 2048 {
        return Err(BadSignature);
    }
    let mut t: Option<&str> = None;
    let mut sigs: Vec<[u8; 32]> = Vec::new();
    for part in header.split(',') {
        let (k, v) = part.trim().split_once('=').ok_or(BadSignature)?;
        match k {
            "t" if t.is_none() => t = Some(v),
            "v1" => {
                if v.len() != 64 {
                    continue;
                }
                if let Ok(b) = hex::decode(v) {
                    if let Ok(a) = <[u8; 32]>::try_from(b.as_slice()) {
                        sigs.push(a);
                    }
                }
            }
            _ => {}
        }
    }
    let t = t.ok_or(BadSignature)?;
    if t.is_empty() || t.len() > 20 || !t.bytes().all(|b| b.is_ascii_digit()) {
        return Err(BadSignature);
    }
    let ts: u64 = t.parse().map_err(|_| BadSignature)?;
    if ts.abs_diff(now) > TOLERANCE_SECS || sigs.is_empty() || secrets.is_empty() {
        return Err(BadSignature);
    }
    let mut ok = false;
    for s in secrets {
        let want = expected(s, t, body);
        for got in &sigs {
            ok |= bool::from(want.ct_eq(got));
        }
    }
    if ok {
        Ok(())
    } else {
        Err(BadSignature)
    }
}

/// Test helper and the local runner: a header Stripe would send.
pub fn sign(secret: &[u8], t: u64, body: &[u8]) -> String {
    format!(
        "t={t},v1={}",
        hex::encode(expected(secret, &t.to_string(), body))
    )
}

/// The envelope fields we read from a verified event.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct Event {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub livemode: bool,
    pub data: EventData,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct EventData {
    pub object: serde_json::Value,
}

pub fn valid_event_id(id: &str) -> bool {
    id.strip_prefix("evt_").is_some_and(|r| {
        (1..=200).contains(&r.len()) && r.bytes().all(|b| b.is_ascii_alphanumeric())
    })
}
