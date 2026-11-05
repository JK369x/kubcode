//! Local SigV4 query-string presign for S3 `GetObject` (no network, no SDK).

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

pub struct Credentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: Option<String>,
}

pub struct Presign<'a> {
    pub creds: &'a Credentials,
    pub region: &'a str,
    /// Value signed as the `host` header, e.g. `bkt.s3.eu-west-1.amazonaws.com`.
    pub host: &'a str,
    pub key: &'a str,
    /// When set, S3 answers with `Content-Disposition: attachment; filename="…"`.
    pub filename: Option<&'a str>,
    /// Unix seconds. Injected so tests control the clock.
    pub now: u64,
    pub expires: u64,
}

const ALGORITHM: &str = "AWS4-HMAC-SHA256";

/// Builds `https://<host>/<key>?…&X-Amz-Signature=…` (virtual-hosted style).
pub fn presign_get(p: &Presign) -> String {
    let (date_time, date) = amz_timestamps(p.now);
    let scope = format!("{date}/{}/s3/aws4_request", p.region);

    let mut query: Vec<(&str, String)> = vec![
        ("X-Amz-Algorithm", ALGORITHM.to_string()),
        (
            "X-Amz-Credential",
            format!("{}/{scope}", p.creds.access_key_id),
        ),
        ("X-Amz-Date", date_time.clone()),
        ("X-Amz-Expires", p.expires.to_string()),
        ("X-Amz-SignedHeaders", "host".to_string()),
    ];
    // AWS requires the session token in the canonical query string, signed.
    if let Some(token) = &p.creds.session_token {
        query.push(("X-Amz-Security-Token", token.clone()));
    }
    if let Some(name) = p.filename {
        query.push((
            "response-content-disposition",
            format!("attachment; filename=\"{name}\""),
        ));
    }

    let mut encoded: Vec<(String, String)> = query
        .iter()
        .map(|(k, v)| (uri_encode(k, true), uri_encode(v, true)))
        .collect();
    encoded.sort();
    let canonical_query = encoded
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&");

    let path = format!("/{}", uri_encode(p.key, false));
    let canonical_request = format!(
        "GET\n{path}\n{canonical_query}\nhost:{}\n\nhost\nUNSIGNED-PAYLOAD",
        p.host
    );
    let string_to_sign = format!(
        "{ALGORITHM}\n{date_time}\n{scope}\n{}",
        hex::encode(Sha256::digest(canonical_request.as_bytes()))
    );

    let k_date = hmac_sha256(
        format!("AWS4{}", p.creds.secret_access_key).as_bytes(),
        date.as_bytes(),
    );
    let k_region = hmac_sha256(&k_date, p.region.as_bytes());
    let k_service = hmac_sha256(&k_region, b"s3");
    let k_signing = hmac_sha256(&k_service, b"aws4_request");
    let signature = hex::encode(hmac_sha256(&k_signing, string_to_sign.as_bytes()));

    format!(
        "https://{}{path}?{canonical_query}&X-Amz-Signature={signature}",
        p.host
    )
}

/// `<bucket>.s3.<region>.amazonaws.com`, the host production signs for.
pub fn regional_host(bucket: &str, region: &str) -> String {
    format!("{bucket}.s3.{region}.amazonaws.com")
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// RFC 3986 percent-encoding: only unreserved characters stay as they are.
/// `/` is kept for object paths and encoded inside query values.
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

/// Unix seconds -> (`YYYYMMDDTHHMMSSZ`, `YYYYMMDD`) in UTC.
fn amz_timestamps(unix: u64) -> (String, String) {
    let (secs, days) = ((unix % 86_400) as u32, (unix / 86_400) as i64);
    // Civil-from-days (Howard Hinnant's algorithm), valid for the proleptic Gregorian calendar.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);

    let date = format!("{year:04}{month:02}{day:02}");
    let date_time = format!(
        "{date}T{:02}{:02}{:02}Z",
        secs / 3_600,
        secs % 3_600 / 60,
        secs % 60
    );
    (date_time, date)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn aws_example_creds() -> Credentials {
        Credentials {
            access_key_id: "AKIAIOSFODNN7EXAMPLE".into(),
            secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".into(),
            session_token: None,
        }
    }

    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    #[test]
    fn reproduces_the_documented_aws_s3_presigned_url() {
        let creds = aws_example_creds();
        let url = presign_get(&Presign {
            creds: &creds,
            region: "us-east-1",
            host: "examplebucket.s3.amazonaws.com",
            key: "test.txt",
            filename: None,
            now: 1_369_353_600, // 2013-05-24T00:00:00Z
            expires: 86_400,
        });
        assert_eq!(
            url,
            "https://examplebucket.s3.amazonaws.com/test.txt\
             ?X-Amz-Algorithm=AWS4-HMAC-SHA256\
             &X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request\
             &X-Amz-Date=20130524T000000Z\
             &X-Amz-Expires=86400\
             &X-Amz-SignedHeaders=host\
             &X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
        );
    }

    // Expected URL computed independently with a Python SigV4 implementation
    // (hashlib/hmac/urllib) for the production shape: regional host, session
    // token, 60 s expiry and an attachment filename.
    #[test]
    fn production_url_has_token_disposition_and_regional_host() {
        let creds = Credentials {
            access_key_id: "AKIDEXAMPLEPROD".into(),
            secret_access_key: "secret/with+chars/KEY".into(),
            session_token: Some("IQoJb3JpZ2luX2VjE/+token==".into()),
        };
        let url = presign_get(&Presign {
            creds: &creds,
            region: "ap-southeast-1",
            host: &regional_host("kubcode-media-955758449820", "ap-southeast-1"),
            key: "packages/freshstack-what-if/0.1.0.zip",
            filename: Some("freshstack-what-if-0.1.0.zip"),
            now: 1_700_000_000,
            expires: 60,
        });
        assert_eq!(
            url,
            "https://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com/packages/freshstack-what-if/0.1.0.zip\
             ?X-Amz-Algorithm=AWS4-HMAC-SHA256\
             &X-Amz-Credential=AKIDEXAMPLEPROD%2F20231114%2Fap-southeast-1%2Fs3%2Faws4_request\
             &X-Amz-Date=20231114T221320Z\
             &X-Amz-Expires=60\
             &X-Amz-Security-Token=IQoJb3JpZ2luX2VjE%2F%2Btoken%3D%3D\
             &X-Amz-SignedHeaders=host\
             &response-content-disposition=attachment%3B%20filename%3D%22freshstack-what-if-0.1.0.zip%22\
             &X-Amz-Signature=8fa6e83cf8aafcd3ab13b69b1fa698609e8dd71e0585683079b781519704aa51"
        );
    }

    #[test]
    fn session_token_changes_the_signature() {
        let mut creds = aws_example_creds();
        let sign = |creds: &Credentials| {
            presign_get(&Presign {
                creds,
                region: "us-east-1",
                host: "examplebucket.s3.amazonaws.com",
                key: "test.txt",
                filename: None,
                now: 1_369_353_600,
                expires: 60,
            })
        };
        let without = sign(&creds);
        creds.session_token = Some("tok".into());
        let with = sign(&creds);
        assert!(with.contains("&X-Amz-Security-Token=tok&"));
        assert!(!without.contains("X-Amz-Security-Token"));
        let sig = |u: &str| u.rsplit("X-Amz-Signature=").next().unwrap().to_string();
        assert_ne!(sig(&with), sig(&without));
    }
}
