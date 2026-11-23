//! Analytics probe (owner ops `analytics_probe`): asks Zernio's dashboard
//! endpoint for one profile and keeps only the status, the error code and the
//! field names, never metric values.

mod support;

use kubcode_publishing::domain::ProviderRef;
use kubcode_publishing::ports::Analytics;
use kubcode_publishing_zernio::transport::Method;
use serde_json::json;
use support::Harness;

const PROFILE: &str = "64e1f0a9c2b4d5e6f7a8b9c0";

#[tokio::test]
async fn an_answer_gives_field_names_not_values() {
    let h = Harness::default();
    h.fake.answer_next_inbox(
        200,
        json!({
            "dateRange": {"fromDate": "2026-11-01", "toDate": "2026-11-22"},
            "totals": {"views": 2200, "likes": 320},
            "followers": {"current": 12840, "gained": 96},
            "daily": [], "topPosts": [], "recentPosts": [],
            "dataAsOf": "2026-11-22T23:10:00.000Z"
        }),
    );
    let p = h.zernio.probe(&ProviderRef(PROFILE.into())).await.unwrap();
    assert_eq!((p.status, p.code.as_deref()), (200, None));
    let mut f = p.fields.clone();
    f.sort();
    assert_eq!(
        f,
        [
            "daily",
            "dataAsOf",
            "dateRange",
            "followers",
            "recentPosts",
            "topPosts",
            "totals"
        ]
    );
    let dbg = format!("{p:?}");
    assert!(
        !dbg.contains("12840") && !dbg.contains("2200"),
        "no metric values kept"
    );
    let req = h.fake.log().into_iter().last().unwrap();
    assert_eq!(req.method, Method::Get);
    assert!(
        req.url.path().ends_with("/v1/analytics/dashboard"),
        "{}",
        req.url
    );
    assert_eq!(
        req.url
            .query_pairs()
            .find(|(k, _)| k == "profileId")
            .map(|(_, v)| v.into_owned()),
        Some(PROFILE.to_owned())
    );
}

#[tokio::test]
async fn a_refusal_gives_its_status_and_code() {
    let h = Harness::default();
    h.fake.answer_next_inbox(
        403,
        json!({"error": "Analytics add-on required", "code": "analytics_addon_required"}),
    );
    let p = h.zernio.probe(&ProviderRef(PROFILE.into())).await.unwrap();
    assert_eq!(p.status, 403);
    assert!(p.code.is_some(), "a code for the refusal");
    assert!(p.fields.contains(&"error".to_owned()));
}

#[tokio::test]
async fn a_bad_profile_ref_is_refused_before_any_call() {
    let h = Harness::default();
    assert!(h.zernio.probe(&ProviderRef("../x".into())).await.is_err());
    assert!(h.fake.log().is_empty());
}
