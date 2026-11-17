//! Browser uploads from the web composer (docs/design/publishing-core.md,
//! web composer): a SigV4 query-presigned S3 `PutObject` for ONE key that
//! this Lambda chose (`clips/<workspace>/<clip>/<sha256>.<ext>`). The
//! signature binds the key, the content type, the exact size
//! (`content-length`), SSE-S3 and the object's SHA-256
//! (`x-amz-checksum-sha256`, base64), so S3 refuses any other body, size or
//! key. Short-lived (15 minutes). No network here.

use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

pub const UPLOAD_EXPIRES_SECS: u64 = 900;

pub struct Creds<'a> {
    pub access_key_id: &'a str,
    pub secret_access_key: &'a str,
    pub session_token: Option<&'a str>,
}

/// What the browser must send with the PUT (exact values; all signed).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct PresignedPut {
    pub url: String,
    pub headers: Vec<(String, String)>,
}

pub struct PutSpec<'a> {
    pub host: &'a str,
    pub region: &'a str,
    pub key: &'a str,
    pub content_type: &'a str,
    /// Raw 32-byte SHA-256 of the file (the asset's registered hash).
    pub sha256: &'a [u8; 32],
    /// The size the quota checked. Signed, so a bigger body is refused.
    pub bytes: u64,
    pub now: u64,
}

pub fn presign_put(creds: &Creds<'_>, p: &PutSpec<'_>) -> PresignedPut {
    let (date_time, date) = amz_timestamps(p.now);
    let scope = format!("{date}/{}/s3/aws4_request", p.region);
    let checksum = base64::engine::general_purpose::STANDARD.encode(p.sha256);
    // Signed headers, lowercase, sorted.
    let mut signed: Vec<(&str, String)> = vec![
        ("content-length", p.bytes.to_string()),
        ("content-type", p.content_type.to_owned()),
        ("host", p.host.to_owned()),
        ("x-amz-checksum-sha256", checksum.clone()),
        ("x-amz-server-side-encryption", "AES256".to_owned()),
        ("x-amz-sdk-checksum-algorithm", "SHA256".to_owned()),
    ];
    signed.sort_by(|a, b| a.0.cmp(b.0));
    let signed_names = signed.iter().map(|(k, _)| *k).collect::<Vec<_>>().join(";");
    let mut query: Vec<(String, String)> = vec![
        ("X-Amz-Algorithm".into(), "AWS4-HMAC-SHA256".into()),
        (
            "X-Amz-Credential".into(),
            format!("{}/{scope}", creds.access_key_id),
        ),
        ("X-Amz-Date".into(), date_time.clone()),
        ("X-Amz-Expires".into(), UPLOAD_EXPIRES_SECS.to_string()),
        ("X-Amz-SignedHeaders".into(), signed_names.clone()),
    ];
    if let Some(t) = creds.session_token {
        query.push(("X-Amz-Security-Token".into(), t.to_owned()));
    }
    let mut enc: Vec<(String, String)> = query
        .iter()
        .map(|(k, v)| (uri_encode(k, true), uri_encode(v, true)))
        .collect();
    enc.sort();
    let canonical_query = enc
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&");
    let path = format!("/{}", uri_encode(p.key, false));
    let canonical_headers: String = signed
        .iter()
        .map(|(k, v)| format!("{k}:{}\n", v.trim()))
        .collect();
    let canonical_request = format!(
        "PUT\n{path}\n{canonical_query}\n{canonical_headers}\n{signed_names}\nUNSIGNED-PAYLOAD"
    );
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{date_time}\n{scope}\n{}",
        hex::encode(Sha256::digest(canonical_request.as_bytes()))
    );
    let k_date = hmac(
        format!("AWS4{}", creds.secret_access_key).as_bytes(),
        date.as_bytes(),
    );
    let k_region = hmac(&k_date, p.region.as_bytes());
    let k_service = hmac(&k_region, b"s3");
    let k_signing = hmac(&k_service, b"aws4_request");
    let signature = hex::encode(hmac(&k_signing, string_to_sign.as_bytes()));
    PresignedPut {
        url: format!(
            "https://{}{path}?{canonical_query}&X-Amz-Signature={signature}",
            p.host
        ),
        // The browser sets Host and Content-Length itself (XHR refuses both);
        // Content-Length is the file's real size, which the signature pins.
        headers: signed
            .into_iter()
            .filter(|(k, _)| *k != "host" && *k != "content-length")
            .map(|(k, v)| (k.to_owned(), v))
            .collect(),
    }
}

pub fn regional_host(bucket: &str, region: &str) -> String {
    format!("{bucket}.s3.{region}.amazonaws.com")
}

fn hmac(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("any key length");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn uri_encode(input: &str, encode_slash: bool) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char)
            }
            b'/' if !encode_slash => out.push('/'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn amz_timestamps(unix: u64) -> (String, String) {
    let t = time::OffsetDateTime::from_unix_timestamp(unix as i64).expect("valid time");
    let date = format!("{:04}{:02}{:02}", t.year(), u8::from(t.month()), t.day());
    (
        format!("{date}T{:02}{:02}{:02}Z", t.hour(), t.minute(), t.second()),
        date,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec<'a>(sha: &'a [u8; 32]) -> PutSpec<'a> {
        PutSpec {
            host: "kubcode-media-test.s3.ap-southeast-1.amazonaws.com",
            region: "ap-southeast-1",
            key: "clips/00000000-0000-0000-0000-000000000001/web-abc/ab.mp4",
            content_type: "video/mp4",
            sha256: sha,
            bytes: 10_000_000,
            now: 1_794_800_000,
        }
    }

    #[test]
    fn signs_the_exact_key_type_checksum_and_sse() {
        let creds = Creds {
            access_key_id: "AKIDEXAMPLE",
            secret_access_key: "FIXTURE-ONLY-secret",
            session_token: Some("tok"),
        };
        let sha = [7u8; 32];
        let p = presign_put(&creds, &spec(&sha));
        assert!(p.url.starts_with("https://kubcode-media-test.s3.ap-southeast-1.amazonaws.com/clips/00000000-0000-0000-0000-000000000001/web-abc/ab.mp4?"));
        assert!(p.url.contains("X-Amz-Expires=900"));
        // content-length is signed: S3 refuses a body of any other size.
        assert!(p.url.contains("X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost%3Bx-amz-checksum-sha256%3Bx-amz-sdk-checksum-algorithm%3Bx-amz-server-side-encryption"));
        assert!(p.url.contains("X-Amz-Security-Token=tok"));
        assert!(!p.url.contains("FIXTURE-ONLY-secret"));
        let h: std::collections::HashMap<_, _> = p.headers.iter().cloned().collect();
        assert_eq!(h["content-type"], "video/mp4");
        assert_eq!(h["x-amz-server-side-encryption"], "AES256");
        assert_eq!(
            h["x-amz-checksum-sha256"],
            base64::engine::general_purpose::STANDARD.encode([7u8; 32])
        );
        // content-length is signed (S3 refuses any other size), and left to
        // the browser, which sends the file's real size (XHR forbids setting it).
        assert!(p
            .url
            .contains("X-Amz-SignedHeaders=content-length%3Bcontent-type%3B"));
        assert!(!h.contains_key("content-length"));
        // Another hash, key or size gives another signature.
        let other = presign_put(&creds, &spec(&[8u8; 32]));
        assert_ne!(p.url, other.url);
        let bigger = presign_put(
            &creds,
            &PutSpec {
                bytes: 5_000_000_000,
                ..spec(&sha)
            },
        );
        assert_ne!(p.url, bigger.url);
        assert_eq!(
            amz_timestamps(0),
            ("19700101T000000Z".into(), "19700101".into())
        );
    }
}
