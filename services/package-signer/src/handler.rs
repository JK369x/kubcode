//! Request handling as a pure function: config + request + clock in, reply out.

use crate::presign::{presign_get, regional_host, Credentials, Presign};
use crate::request::parse_body;
use crate::verify::verify;
use lambda_http::http::HeaderMap;

/// Lambda environment, parsed once at cold start.
pub struct Config {
    pub signer_key: Vec<u8>,
    pub bucket: String,
    pub region: String,
    pub creds: Credentials,
}

/// Names the missing setting only; never a value.
#[derive(Debug, PartialEq, Eq)]
pub struct ConfigError(pub &'static str);

const MIN_SIGNER_KEY_BYTES: usize = 32;
const URL_TTL_SECS: u64 = 60;

impl Config {
    /// `get` is `std::env::var(..).ok()` in production and a map in tests.
    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Config, ConfigError> {
        let required =
            |name: &'static str| get(name).filter(|v| !v.is_empty()).ok_or(ConfigError(name));
        let signer_key = required("KUBCODE_PACKAGE_SIGNER_KEY")?;
        if signer_key.len() < MIN_SIGNER_KEY_BYTES {
            return Err(ConfigError("KUBCODE_PACKAGE_SIGNER_KEY"));
        }
        Ok(Config {
            signer_key: signer_key.into_bytes(),
            bucket: required("KUBCODE_PACKAGE_BUCKET")?,
            region: required("AWS_REGION")?,
            creds: Credentials {
                access_key_id: required("AWS_ACCESS_KEY_ID")?,
                secret_access_key: required("AWS_SECRET_ACCESS_KEY")?,
                session_token: get("AWS_SESSION_TOKEN").filter(|v| !v.is_empty()),
            },
        })
    }

    pub fn from_env() -> Result<Config, ConfigError> {
        Config::from_lookup(|name| std::env::var(name).ok())
    }
}

pub struct Req<'a> {
    pub method: &'a str,
    pub path: &'a str,
    pub headers: &'a HeaderMap,
    pub body: &'a [u8],
}

pub struct Reply {
    pub status: u16,
    /// JSON text.
    pub body: String,
    /// One log line, free of signatures and secrets.
    pub log: String,
}

fn error(status: u16, code: &str, log: String) -> Reply {
    Reply {
        status,
        body: serde_json::json!({ "error": code }).to_string(),
        log,
    }
}

/// Order matters: route, then config, then HMAC, then body. Nothing is parsed
/// or validated before the caller has proven it holds the shared key.
pub fn handle(cfg: &Result<Config, ConfigError>, req: &Req, now: u64) -> Reply {
    if req.method != "POST" || req.path != "/sign" {
        return error(404, "not_found", "outcome=not_found".into());
    }
    let cfg = match cfg {
        Ok(cfg) => cfg,
        Err(ConfigError(name)) => {
            return error(500, "internal", format!("outcome=internal missing={name}"));
        }
    };
    if verify(&cfg.signer_key, req.headers, req.body, now).is_err() {
        return error(401, "unauthorized", "outcome=unauthorized".into());
    }
    let Ok(parsed) = parse_body(req.body) else {
        return error(400, "bad_request", "outcome=bad_request".into());
    };

    let url = presign_get(&Presign {
        creds: &cfg.creds,
        region: &cfg.region,
        host: &regional_host(&cfg.bucket, &cfg.region),
        key: &parsed.key,
        filename: Some(&parsed.filename),
        now,
        expires: URL_TTL_SECS,
    });
    Reply {
        status: 200,
        body: serde_json::json!({ "url": url, "expires_in": URL_TTL_SECS }).to_string(),
        log: format!("outcome=signed user={} key={}", parsed.user, parsed.key),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::verify::sign;

    const SIGNER_KEY: &str = "test-key-0123456789abcdef0123456789abcdef";
    const NOW: u64 = 1_700_000_000;
    const NONCE: &str = "00112233445566778899aabbccddeeff";
    const BODY: &str = r#"{"key":"packages/freshstack-what-if/0.1.0.zip","filename":"freshstack-what-if-0.1.0.zip","user":"11111111-2222-4333-8444-555555555555"}"#;

    fn env(session_token: Option<&str>) -> impl Fn(&str) -> Option<String> + '_ {
        move |name| match name {
            "KUBCODE_PACKAGE_SIGNER_KEY" => Some(SIGNER_KEY.to_string()),
            "KUBCODE_PACKAGE_BUCKET" => Some("kubcode-test-bucket".to_string()),
            "AWS_REGION" => Some("eu-west-1".to_string()),
            "AWS_ACCESS_KEY_ID" => Some("AKIDEXAMPLE".to_string()),
            "AWS_SECRET_ACCESS_KEY" => Some("super-secret-access-key".to_string()),
            "AWS_SESSION_TOKEN" => session_token.map(str::to_string),
            _ => None,
        }
    }

    fn config() -> Result<Config, ConfigError> {
        Config::from_lookup(env(None))
    }

    fn signed_headers(body: &str) -> HeaderMap {
        let timestamp = NOW.to_string();
        let mut h = HeaderMap::new();
        h.insert("x-kubcode-timestamp", timestamp.parse().unwrap());
        h.insert("x-kubcode-nonce", NONCE.parse().unwrap());
        h.insert(
            "x-kubcode-signature",
            sign(SIGNER_KEY.as_bytes(), &timestamp, NONCE, body.as_bytes())
                .parse()
                .unwrap(),
        );
        h
    }

    fn post_sign(cfg: &Result<Config, ConfigError>, body: &str) -> Reply {
        let headers = signed_headers(body);
        handle(
            cfg,
            &Req {
                method: "POST",
                path: "/sign",
                headers: &headers,
                body: body.as_bytes(),
            },
            NOW,
        )
    }

    #[test]
    fn signs_a_valid_request_and_logs_user_and_key_only() {
        let reply = post_sign(&config(), BODY);

        assert_eq!(reply.status, 200);
        let json: serde_json::Value = serde_json::from_str(&reply.body).unwrap();
        assert_eq!(json["expires_in"], 60);
        let url = json["url"].as_str().unwrap();
        assert!(url.starts_with(
            "https://kubcode-test-bucket.s3.eu-west-1.amazonaws.com/packages/freshstack-what-if/0.1.0.zip?"
        ));
        assert!(url.contains("X-Amz-Expires=60"));
        assert!(url.contains("filename%3D%22freshstack-what-if-0.1.0.zip%22"));
        assert!(
            url.contains("X-Amz-Credential=AKIDEXAMPLE%2F20231114%2Feu-west-1%2Fs3%2Faws4_request")
        );
        assert!(!url.contains("X-Amz-Security-Token"));

        assert_eq!(
            reply.log,
            "outcome=signed user=11111111-2222-4333-8444-555555555555 key=packages/freshstack-what-if/0.1.0.zip"
        );
    }

    #[test]
    fn config_reads_the_environment_and_names_what_is_missing() {
        let cfg = Config::from_lookup(env(Some("session-token")))
            .ok()
            .unwrap();
        assert_eq!(cfg.bucket, "kubcode-test-bucket");
        assert_eq!(cfg.region, "eu-west-1");
        assert_eq!(cfg.creds.session_token.as_deref(), Some("session-token"));

        for missing in [
            "KUBCODE_PACKAGE_SIGNER_KEY",
            "KUBCODE_PACKAGE_BUCKET",
            "AWS_REGION",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
        ] {
            let base = env(None);
            let err = Config::from_lookup(|n| if n == missing { None } else { base(n) }).err();
            assert_eq!(err, Some(ConfigError(missing)), "{missing}");
            let base = env(None);
            let blank = Config::from_lookup(|n| {
                if n == missing {
                    Some(String::new())
                } else {
                    base(n)
                }
            })
            .err();
            assert_eq!(blank, Some(ConfigError(missing)), "{missing} empty");
        }
    }

    #[test]
    fn signer_key_must_be_at_least_32_bytes() {
        let with_key = |k: &'static str| {
            let base = env(None);
            Config::from_lookup(move |n| {
                if n == "KUBCODE_PACKAGE_SIGNER_KEY" {
                    Some(k.to_string())
                } else {
                    base(n)
                }
            })
        };
        assert!(with_key("0123456789abcdef0123456789abcdef").is_ok()); // 32 bytes
        assert_eq!(
            with_key("0123456789abcdef0123456789abcde").err(), // 31 bytes
            Some(ConfigError("KUBCODE_PACKAGE_SIGNER_KEY"))
        );
    }

    fn with_body(key: &str, filename: &str, user: &str) -> String {
        serde_json::json!({"key": key, "filename": filename, "user": user}).to_string()
    }

    fn assert_error(reply: &Reply, status: u16, error: &str) {
        assert_eq!(reply.status, status, "{}", reply.body);
        assert_eq!(reply.body, format!(r#"{{"error":"{error}"}}"#));
    }

    #[test]
    fn only_post_sign_exists_everything_else_is_404_before_any_auth_check() {
        let headers = signed_headers(BODY);
        for (method, path) in [
            ("GET", "/sign"),
            ("PUT", "/sign"),
            ("DELETE", "/sign"),
            ("POST", "/"),
            ("POST", "/sign/"),
            ("POST", "/SIGN"),
            ("POST", "/sign/extra"),
            ("POST", "/health"),
        ] {
            let reply = handle(
                &config(),
                &Req {
                    method,
                    path,
                    headers: &headers,
                    body: BODY.as_bytes(),
                },
                NOW,
            );
            assert_error(&reply, 404, "not_found");
            assert_eq!(reply.log, "outcome=not_found", "{method} {path}");
        }
        // Even a broken config answers 404 for other routes, not 500.
        let reply = handle(
            &Err(ConfigError("KUBCODE_PACKAGE_BUCKET")),
            &Req {
                method: "GET",
                path: "/x",
                headers: &headers,
                body: b"",
            },
            NOW,
        );
        assert_error(&reply, 404, "not_found");
    }

    #[test]
    fn unsigned_or_badly_signed_requests_get_401_even_with_an_invalid_body() {
        let invalid = with_body("../../etc/passwd", "x.zip", "nope");
        let ok_headers = signed_headers(BODY);
        let cases = [
            (HeaderMap::new(), BODY.to_string()),
            (HeaderMap::new(), invalid.clone()),
            // Valid signature for a different body.
            (ok_headers.clone(), invalid.clone()),
        ];
        for (headers, body) in cases {
            let reply = handle(
                &config(),
                &Req {
                    method: "POST",
                    path: "/sign",
                    headers: &headers,
                    body: body.as_bytes(),
                },
                NOW,
            );
            assert_error(&reply, 401, "unauthorized");
            assert_eq!(reply.log, "outcome=unauthorized");
        }
    }

    #[test]
    fn stale_timestamp_is_401() {
        let headers = signed_headers(BODY);
        let reply = handle(
            &config(),
            &Req {
                method: "POST",
                path: "/sign",
                headers: &headers,
                body: BODY.as_bytes(),
            },
            NOW + 61,
        );
        assert_error(&reply, 401, "unauthorized");
    }

    #[test]
    fn authenticated_but_invalid_bodies_get_400_and_nothing_is_echoed() {
        let user = "11111111-2222-4333-8444-555555555555";
        let bodies = [
            with_body("packages/../../secret.zip", "x-1.0.0.zip", user),
            with_body("other/x/1.0.0.zip", "x-1.0.0.zip", user),
            with_body("packages/X/1.0.0.zip", "x-1.0.0.zip", user),
            with_body("packages/x/1.0.zip", "x-1.0.0.zip", user),
            with_body("packages/x/1.0.0.zip", "bad name\".zip", user),
            with_body("packages/x/1.0.0.zip", "x-1.0.0.zip", "not-a-uuid"),
            r#"{"key":"packages/x/1.0.0.zip","filename":"x-1.0.0.zip"}"#.to_string(),
            "not json".to_string(),
        ];
        for body in bodies {
            let reply = post_sign(&config(), &body);
            assert_error(&reply, 400, "bad_request");
            assert_eq!(reply.log, "outcome=bad_request", "{body}");
        }
    }

    #[test]
    fn broken_config_is_500_for_a_real_request_without_leaking_details() {
        let reply = post_sign(&Err(ConfigError("KUBCODE_PACKAGE_BUCKET")), BODY);
        assert_error(&reply, 500, "internal");
        // The log may name the missing setting, never a value.
        assert_eq!(reply.log, "outcome=internal missing=KUBCODE_PACKAGE_BUCKET");
    }

    #[test]
    fn session_token_is_signed_into_the_url() {
        let cfg = Config::from_lookup(env(Some("FwoGZXIvYXdzE//token=")));
        let url_of = |cfg: &Result<Config, ConfigError>| {
            let json: serde_json::Value = serde_json::from_str(&post_sign(cfg, BODY).body).unwrap();
            json["url"].as_str().unwrap().to_string()
        };
        let with = url_of(&cfg);
        let without = url_of(&config());
        assert!(with.contains("&X-Amz-Security-Token=FwoGZXIvYXdzE%2F%2Ftoken%3D&"));
        assert!(!without.contains("X-Amz-Security-Token"));
        let sig = |u: &str| u.rsplit("X-Amz-Signature=").next().unwrap().to_string();
        assert_ne!(sig(&with), sig(&without));
    }

    #[test]
    fn logs_never_contain_signatures_secrets_or_presigned_urls() {
        let cfg =
            Config::from_lookup(env(Some("session-token-value"))).map_err(|e| ConfigError(e.0));
        let ok = post_sign(&cfg, BODY);
        let headers = signed_headers(BODY);
        let sig = headers["x-kubcode-signature"].to_str().unwrap().to_string();
        let bad = post_sign(&cfg, &with_body("../x", "x", "x"));
        for line in [&ok.log, &bad.log] {
            for secret in [
                SIGNER_KEY,
                "super-secret-access-key",
                "session-token-value",
                "X-Amz-Signature",
                "https://",
                sig.as_str(),
                NONCE,
            ] {
                assert!(!line.contains(secret), "log {line:?} leaked {secret}");
            }
        }
    }
}
