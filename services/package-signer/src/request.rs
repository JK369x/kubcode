//! Validation of the JSON body. Hand-written matchers keep the dependency
//! list short; they mirror the regexes in docs/design/package-signer.md.

use serde::Deserialize;

/// Any invalid body. Carries no detail so callers cannot echo input back.
#[derive(Debug, PartialEq, Eq)]
pub struct BadRequest;

#[derive(Debug, PartialEq, Eq)]
pub struct SignRequest {
    pub key: String,
    pub filename: String,
    pub user: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Raw {
    key: String,
    filename: String,
    user: String,
}

pub fn parse_body(body: &[u8]) -> Result<SignRequest, BadRequest> {
    let raw: Raw = serde_json::from_slice(body).map_err(|_| BadRequest)?;
    if is_package_key(&raw.key) && is_package_filename(&raw.filename) && is_uuid(&raw.user) {
        Ok(SignRequest {
            key: raw.key,
            filename: raw.filename,
            user: raw.user,
        })
    } else {
        Err(BadRequest)
    }
}

/// `[a-z0-9]+(-[a-z0-9]+)*`
fn is_slug(s: &str) -> bool {
    s.split('-').all(|part| {
        !part.is_empty() && part.bytes().all(|b| matches!(b, b'a'..=b'z' | b'0'..=b'9'))
    })
}

/// `[0-9]+\.[0-9]+\.[0-9]+`
fn is_version(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

/// `^packages/<slug>/<version>.zip$`
fn is_package_key(key: &str) -> bool {
    let Some(rest) = key.strip_prefix("packages/") else {
        return false;
    };
    let Some((slug, file)) = rest.split_once('/') else {
        return false;
    };
    let Some(version) = file.strip_suffix(".zip") else {
        return false;
    };
    is_slug(slug) && is_version(version)
}

/// `^<slug>-<version>.zip$`
fn is_package_filename(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".zip") else {
        return false;
    };
    // A version never contains '-', so the last '-' separates slug and version.
    let Some((slug, version)) = stem.rsplit_once('-') else {
        return false;
    };
    is_slug(slug) && is_version(version)
}

/// Canonical 8-4-4-4-12 hex form (the web app sends the Postgres user id).
fn is_uuid(s: &str) -> bool {
    let groups: Vec<&str> = s.split('-').collect();
    groups.len() == 5
        && groups
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(g, len)| g.len() == len && g.bytes().all(|b| b.is_ascii_hexdigit()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const KEY: &str = "packages/freshstack-what-if/0.1.0.zip";
    const FILENAME: &str = "freshstack-what-if-0.1.0.zip";
    const USER: &str = "11111111-2222-4333-8444-555555555555";

    fn body(key: &str, filename: &str, user: &str) -> Vec<u8> {
        json!({"key": key, "filename": filename, "user": user})
            .to_string()
            .into_bytes()
    }

    #[test]
    fn accepts_the_contract_example() {
        let parsed = parse_body(&body(KEY, FILENAME, USER)).unwrap();
        assert_eq!(parsed.key, KEY);
        assert_eq!(parsed.filename, FILENAME);
        assert_eq!(parsed.user, USER);
    }

    fn rejects(key: &str, filename: &str, user: &str) {
        assert_eq!(
            parse_body(&body(key, filename, user)),
            Err(BadRequest),
            "{key:?} {filename:?} {user:?}"
        );
    }

    #[test]
    fn rejects_keys_outside_the_package_layout() {
        for key in [
            "",
            "../packages/x/1.0.0.zip",
            "packages/../secret/1.0.0.zip",
            "packages/x/../../etc/1.0.0.zip",
            "packages/x/1.0.0.zip/../../y.zip",
            "/packages/x/1.0.0.zip",
            "private/x/1.0.0.zip",
            "packages/X/1.0.0.zip",
            "packages/x/1.0.0.ZIP",
            "packages/x/1.0.zip",
            "packages/x/1.0.0.0.zip",
            "packages/x/v1.0.0.zip",
            "packages/x/1.0.0",
            "packages/x/1.0.0.zip/",
            "packages/x/1.0.0.zip\n",
            "packages/x/1.0.0.zip%00",
            "packages//1.0.0.zip",
            "packages/-x/1.0.0.zip",
            "packages/x-/1.0.0.zip",
            "packages/x--y/1.0.0.zip",
            "packages/x_y/1.0.0.zip",
            "packages/a/b/1.0.0.zip",
            "packages/x/1.0.0.zip?x=1",
            "packages/x/1.0.0.zip#frag",
            "packages/x/\u{0661}.0.0.zip",
        ] {
            rejects(key, FILENAME, USER);
        }
    }

    #[test]
    fn rejects_filenames_that_could_break_the_content_disposition_header() {
        for filename in [
            "",
            "../x-1.0.0.zip",
            "a/b-1.0.0.zip",
            "a\\b-1.0.0.zip",
            "X-1.0.0.zip",
            "x.zip",
            "x-1.0.zip",
            "1.0.0.zip",
            "-x-1.0.0.zip",
            "x--y-1.0.0.zip",
            "x-1.0.0",
            "x-1.0.0.zip ",
            "x\"-1.0.0.zip",
            "x-1.0.0.zip\r\nSet-Cookie: a=b",
            "x-1.0.0.zip\"; filename*=UTF-8''evil",
        ] {
            rejects(KEY, filename, USER);
        }
    }

    #[test]
    fn accepts_slugs_with_digits_and_multiple_hyphens() {
        for (key, filename) in [
            ("packages/a1-b2-c3/10.20.30.zip", "a1-b2-c3-10.20.30.zip"),
            // The version is whatever follows the last hyphen, so numeric slug parts are fine.
            ("packages/a-1/2.0.0.zip", "a-1-2.0.0.zip"),
        ] {
            assert!(parse_body(&body(key, filename, USER)).is_ok(), "{filename}");
        }
    }

    #[test]
    fn rejects_bad_user_ids() {
        for user in [
            "",
            "not-a-uuid",
            "11111111-2222-4333-8444-55555555555",
            "11111111-2222-4333-8444-5555555555555",
            "11111111222243338444555555555555",
            "g1111111-2222-4333-8444-555555555555",
            "11111111-2222-4333-8444-555555555555\n",
            " 11111111-2222-4333-8444-555555555555",
            "11111111-2222-4333-8444-555555555555 extra",
        ] {
            rejects(KEY, FILENAME, user);
        }
    }

    #[test]
    fn rejects_bodies_that_are_not_the_expected_json() {
        let cases: Vec<Vec<u8>> = vec![
            b"".to_vec(),
            b"not json".to_vec(),
            b"null".to_vec(),
            b"[]".to_vec(),
            b"{}".to_vec(),
            vec![0xff, 0xfe, 0xfd],
            json!({"filename": FILENAME, "user": USER})
                .to_string()
                .into_bytes(),
            json!({"key": KEY, "user": USER}).to_string().into_bytes(),
            json!({"key": KEY, "filename": FILENAME})
                .to_string()
                .into_bytes(),
            json!({"key": 1, "filename": FILENAME, "user": USER})
                .to_string()
                .into_bytes(),
            json!({"key": null, "filename": FILENAME, "user": USER})
                .to_string()
                .into_bytes(),
            json!({"key": KEY, "filename": FILENAME, "user": USER, "extra": 1})
                .to_string()
                .into_bytes(),
            format!(r#"{{"key":"{KEY}","key":"{KEY}","filename":"{FILENAME}","user":"{USER}"}}"#)
                .into_bytes(),
        ];
        for case in cases {
            assert_eq!(
                parse_body(&case),
                Err(BadRequest),
                "{}",
                String::from_utf8_lossy(&case)
            );
        }
    }
}
