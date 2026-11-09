//! Parsing the documented Zernio examples (tests/fixtures/zernio), error
//! mapping (design §3.3) and webhook verification (design §5.4).

mod support;

use kubcode_publishing::domain::{ConnectionStatus, DeliveryStatus, ProviderRef};
use kubcode_publishing::errors::ErrorClass;
use kubcode_publishing::events::{EventSource, Headers, ProviderEvent};
use kubcode_publishing_zernio::errors::map_error;
use kubcode_publishing_zernio::events::{sign, signature_matches, ZernioEvents};
use kubcode_publishing_zernio::parse;
use serde_json::{json, Value};

fn fixture(name: &str) -> Value {
    let path = format!(
        "{}/tests/fixtures/zernio/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn profiles() {
    assert_eq!(
        parse::profile_id(&fixture("profile-created")).as_deref(),
        Some("66a1f0c2a4b9d3e8f1a2b3c4")
    );
    assert_eq!(
        parse::conflicting_profile_id(&fixture("profile-conflict")).as_deref(),
        Some("66a1f0c2a4b9d3e8f1a2b3c4")
    );
    assert_eq!(
        parse::profile_id(&json!({"profiles": [{"_id": "p1", "externalId": "w"}]})).as_deref(),
        Some("p1")
    );
}

#[test]
fn connect_url_and_accounts() {
    assert!(parse::auth_url(&fixture("connect-url"))
        .unwrap()
        .starts_with("https://"));
    let accts = parse::accounts(&fixture("accounts"));
    assert_eq!(accts.len(), 1);
    assert_eq!(accts[0].id, "66b2e19d8c3f5a7e9d0b1c2d");
    assert_eq!(accts[0].platform, "instagram");
    assert_eq!(accts[0].username.as_deref(), Some("acmecorp"));
    assert!(accts[0].active);
    assert_eq!(
        accts[0].profile_id.as_deref(),
        Some("66a1f0c2a4b9d3e8f1a2b3c4")
    );
}

#[test]
fn accounts_with_a_populated_profile() {
    // GET /v1/accounts returns profileId as a Profile object (OpenAPI
    // example); the multi-tenant guide shows a plain string. Both must read.
    let accts = parse::accounts(&fixture("accounts-populated"));
    assert_eq!(accts.len(), 1);
    assert_eq!(accts[0].id, "64e1...");
    assert_eq!(accts[0].profile_id.as_deref(), Some("64f0..."));
    // An object without an id is still no proof of ownership.
    let no_id =
        json!({"accounts": [{"_id": "a1", "platform": "youtube", "profileId": {"name": "x"}}]});
    assert_eq!(parse::accounts(&no_id)[0].profile_id, None);
}

#[test]
fn a_failed_post_carries_the_class_its_error_category_implies() {
    let (_, st) = parse::post_state(&fixture("post-failed-auth-expired")).unwrap();
    assert_eq!(st.status, DeliveryStatus::Failed);
    let err = st.error.unwrap();
    assert_eq!(err.code.as_str(), "platform_auth_expired");
    assert_eq!(err.class, ErrorClass::NeedsReconnect);

    // OpenAPI errorCategory enum.
    let class = |c: Option<&str>| parse::platform_error(c).class;
    assert_eq!(class(Some("auth_expired")), ErrorClass::NeedsReconnect);
    for c in ["platform_rate_limit", "quota_exhausted"] {
        assert!(
            matches!(class(Some(c)), ErrorClass::RateLimited { .. }),
            "{c}"
        );
        assert!(parse::platform_error(Some(c)).retryable(), "{c}");
    }
    for c in ["platform_error", "system_error"] {
        assert_eq!(class(Some(c)), ErrorClass::Temporary, "{c}");
    }
    for c in [
        Some("user_content"),
        Some("user_abuse"),
        Some("account_issue"),
        Some("platform_rejected"),
        Some("unknown"),
        Some("brand_new"),
        None,
    ] {
        assert_eq!(class(c), ErrorClass::Rejected, "{c:?}");
    }
}

#[test]
fn an_inline_publish_that_failed_is_terminal() {
    let (id, st) = parse::post_state(&fixture("post-207-failed")).unwrap();
    assert_eq!(id, "6a9e43f7fd28fe46ce033d98");
    assert_eq!(st.status, DeliveryStatus::Failed);
    assert_eq!(st.error.unwrap().class, ErrorClass::Rejected);
}

#[test]
fn webhook_signatures_in_every_common_encoding() {
    use base64::Engine as _;
    let secret = b"0123456789abcdef0123456789abcdef";
    let raw = br#"{"id":"evt_1","event":"post.published"}"#;
    let hexed = sign(secret, raw);
    let bytes = hex::decode(&hexed).unwrap();
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    for header in [
        hexed.clone(),
        hexed.to_ascii_uppercase(),
        format!("sha256={hexed}"),
        b64.clone(),
        format!("sha256={b64}"),
    ] {
        assert!(signature_matches(&[secret], &header, raw), "{header}");
    }
    for header in ["", "sha256=", "not-a-signature", &format!("sha1={hexed}")] {
        assert!(!signature_matches(&[secret], header, raw), "{header:?}");
    }
    assert!(!signature_matches(
        &[b"another-secret-another-secret-00"],
        &b64,
        raw
    ));
}

#[test]
fn health_uses_account_id_not_underscore_id() {
    let h = parse::health(&fixture("accounts-health"));
    assert_eq!(
        h,
        vec![(
            "66b2e19d8c3f5a7e9d0b1c2d".to_owned(),
            ConnectionStatus::NeedsReconnect
        )]
    );
}

#[test]
fn presign() {
    let p = parse::presign(&fixture("presign")).unwrap();
    assert!(p.upload_url.contains("X-Amz-Signature"));
    assert_eq!(
        p.public_url,
        "https://media.zernio.com/temp/1234567890_abc123_photo.jpg"
    );
}

#[test]
fn posts_with_and_without_the_message_wrapper() {
    let (id, st) = parse::post_state(&fixture("post-created")).unwrap();
    assert_eq!(id, "65f1c0a9e2b5af0012ab34cd");
    assert_eq!(st.status, DeliveryStatus::Scheduled);

    let (_, st) = parse::post_state(&fixture("post-published-now")).unwrap();
    assert_eq!(st.status, DeliveryStatus::Published);
    assert_eq!(
        st.platform_url.as_deref(),
        Some("https://www.instagram.com/p/DGx7Yk2ScAb/")
    );
}

#[test]
fn a_failed_platform_entry_wins_and_keeps_only_a_code() {
    let mut v = fixture("post-partial");
    // One Zernio post per delivery: keep only the failed Instagram entry.
    v["post"]["platforms"] = json!([v["post"]["platforms"][1].clone()]);
    let (_, st) = parse::post_state(&v).unwrap();
    assert_eq!(st.status, DeliveryStatus::Failed);
    let e = st.error.unwrap();
    assert_eq!(e.class, ErrorClass::Rejected);
    assert_eq!(e.code.as_str(), "platform_user_content");
    assert!(!format!("{e:?}").contains("too short"), "no provider text");
}

#[test]
fn error_mapping() {
    let class = |status, retry: Option<u32>, body: Value| map_error(status, retry, &body).class;
    let code = |status, body: Value| map_error(status, None, &body).code.as_str().to_owned();

    assert_eq!(class(401, None, fixture("error-401")), ErrorClass::Bug);
    assert_eq!(code(401, fixture("error-401")), "zernio_auth_failed");
    assert_eq!(
        class(401, None, json!({"code": "TOKEN_EXPIRED"})),
        ErrorClass::NeedsReconnect
    );
    assert_eq!(
        class(403, None, json!({"code": "ACCOUNT_DISCONNECTED"})),
        ErrorClass::NeedsReconnect
    );
    assert_eq!(
        class(404, None, json!({"code": "account_not_found"})),
        ErrorClass::NeedsReconnect
    );
    assert_eq!(class(404, None, fixture("error-404")), ErrorClass::NotFound);
    assert_eq!(
        class(429, None, fixture("error-429")),
        ErrorClass::RateLimited {
            retry_after_secs: 12
        },
        "details.retryAfterSeconds when the header is missing"
    );
    assert_eq!(
        class(429, Some(3), fixture("error-429")),
        ErrorClass::RateLimited {
            retry_after_secs: 3
        },
        "the header wins"
    );
    assert_eq!(
        class(409, Some(2), json!({"code": "idempotency_conflict"})),
        ErrorClass::RateLimited {
            retry_after_secs: 2
        }
    );
    for billing in [
        json!({"code": "payment_required"}),
        json!({"code": "PROFILE_OVER_LIMIT"}),
        json!({"code": "message_allowance_exceeded"}),
    ] {
        assert_eq!(
            class(403, None, billing.clone()),
            ErrorClass::ProviderBilling,
            "{billing}"
        );
    }
    assert_eq!(class(402, None, json!({})), ErrorClass::ProviderBilling);
    assert_eq!(
        code(400, fixture("error-published-delete")),
        "invalid_state"
    );
    assert_eq!(
        class(
            400,
            None,
            json!({"type": "platform_error", "platform": "instagram"})
        ),
        ErrorClass::Rejected
    );
    assert_eq!(
        class(400, None, json!({"code": "missing_required_field"})),
        ErrorClass::Bug
    );
    for s in [500, 502, 503, 504] {
        assert_eq!(class(s, None, json!({})), ErrorClass::Temporary);
    }
}

#[test]
fn hmac_matches_rfc_4231_case_2() {
    // Key "Jefe", data "what do ya want for nothing?".
    let raw = b"what do ya want for nothing?";
    let expected = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";
    assert_eq!(sign(b"Jefe", raw), expected);
    assert!(signature_matches(&[b"Jefe".to_vec()], expected, raw));
    assert!(signature_matches(
        &[b"Jefe".to_vec()],
        &expected.to_uppercase(),
        raw
    ));
    assert!(!signature_matches(&[b"jefe".to_vec()], expected, raw));
    assert!(!signature_matches(&[b"Jefe".to_vec()], "zz", raw));
}

#[test]
fn the_previous_secret_still_verifies_during_rotation() {
    let events = ZernioEvents::new(vec![b"new".to_vec(), b"old".to_vec()]);
    let raw = br#"{"id":"evt_9","event":"post.cancelled"}"#;
    let headers = Headers(vec![("x-zernio-signature".into(), sign(b"old", raw))]);
    assert!(events.verify(&headers, raw).is_ok());
}

fn translate(name: &str) -> Vec<ProviderEvent> {
    let (headers, raw) = support::signed(&fixture(name));
    let events = ZernioEvents::new(vec![support::WEBHOOK_SECRET.to_vec()]);
    let v = events.verify(&headers, &raw).unwrap();
    events.translate(&v)
}

#[test]
fn post_platform_published() {
    let e = translate("webhook-post-platform-published");
    assert_eq!(e.len(), 1);
    let ProviderEvent::PostPublished {
        post,
        platform_post_id,
        url,
        at,
    } = &e[0]
    else {
        panic!("{e:?}")
    };
    assert_eq!(post, &ProviderRef("65f1c0a9e2b5af0012ab34cd".into()));
    assert_eq!(platform_post_id.as_deref(), Some("y7AAfV8ABIo"));
    assert_eq!(
        url.as_deref(),
        Some("https://www.youtube.com/watch?v=y7AAfV8ABIo")
    );
    assert!(at.is_some());
}

#[test]
fn post_platform_failed_keeps_only_a_code() {
    let e = translate("webhook-post-platform-failed");
    let ProviderEvent::PostFailed { post, code } = &e[0] else {
        panic!("{e:?}")
    };
    assert_eq!(post, &ProviderRef("65f1c0a9e2b5af0012ab34ce".into()));
    assert_eq!(code.as_str(), "platform_user_content");
}

#[test]
fn account_events() {
    let e = translate("webhook-account-disconnected");
    let ProviderEvent::AccountLost { account, code } = &e[0] else {
        panic!("{e:?}")
    };
    assert_eq!(account, &ProviderRef("66b2e19d8c3f5a7e9d0b1c2d".into()));
    assert_eq!(code.as_str(), "account_lost");

    let e = translate("webhook-account-connected");
    assert!(matches!(&e[0], ProviderEvent::AccountConnected { .. }));
}

#[test]
fn identity_comes_only_from_the_signed_body() {
    let events = ZernioEvents::new(vec![support::WEBHOOK_SECRET.to_vec()]);
    let (mut headers, raw) = support::signed(&fixture("webhook-account-connected"));
    let first = events.verify(&headers, &raw).unwrap();
    assert_eq!(
        first.event_id,
        format!("sha256:{}", hex::encode(first.body_sha256)),
        "no id in the body: the body hash"
    );
    // A replay with a fresh, unsigned event-id header still dedupes.
    headers
        .0
        .push(("X-Zernio-Event-Id".into(), "evt_new".into()));
    assert_eq!(
        events.verify(&headers, &raw).unwrap().event_id,
        first.event_id
    );

    let (h, raw) = support::signed(&json!({"id": "evt_1"}));
    let mut h = h;
    h.0.push(("X-Zernio-Event".into(), "post.platform.published".into()));
    assert_eq!(
        events.verify(&h, &raw).unwrap_err().code.as_str(),
        "bad_body",
        "the event type is never taken from a header"
    );
}

#[test]
fn bodies_over_one_mebibyte_are_refused_before_hashing() {
    let events = ZernioEvents::new(vec![support::WEBHOOK_SECRET.to_vec()]);
    let raw = vec![b' '; 1024 * 1024 + 1];
    let headers = Headers(vec![(
        "X-Zernio-Signature".into(),
        sign(support::WEBHOOK_SECRET, &raw),
    )]);
    assert_eq!(
        events.verify(&headers, &raw).unwrap_err().code.as_str(),
        "body_too_large"
    );
}
