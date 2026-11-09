//! What the adapter actually sends to Zernio (design §5.2, §5.3).

mod support;

use kubcode_publishing::config::PublishingConfig;
use kubcode_publishing::contract::{sample_request, PublisherHarness};
use kubcode_publishing::domain::{Platform, Visibility, WorkspaceId};
use kubcode_publishing::fake::FakeMedia;
use kubcode_publishing::ports::{
    check, Checked, ConnectProvider, DeliveryRequest, Publisher, WorkspaceCtx,
};
use kubcode_publishing::validate::Velocity;
use kubcode_publishing_zernio::transport::Method;
use support::{Harness, API_KEY};
use uuid::Uuid;

fn checked(h: &Harness, req: DeliveryRequest) -> Checked {
    check(
        req,
        h.now(),
        Velocity::default(),
        &PublishingConfig::default(),
        &h.zernio,
    )
    .unwrap()
}

#[tokio::test]
async fn first_connect_creates_a_profile_keyed_by_the_workspace_id_only() {
    let h = Harness::default();
    let ws = WorkspaceId(Uuid::new_v4());
    let start = h
        .zernio
        .start(
            &WorkspaceCtx {
                workspace: ws,
                profile: None,
            },
            Platform::YouTube,
            "https://kubcode.dev/api/channels/callback?i=abc",
        )
        .await
        .unwrap();
    let log = h.fake.log();
    let create = &log[0];
    assert_eq!(create.method, Method::Post);
    assert_eq!(create.url.path(), "/api/v1/profiles");
    let body = create.json.as_ref().unwrap();
    assert_eq!(body["externalId"], ws.0.to_string());
    let name = body["name"].as_str().unwrap();
    assert!(
        name.starts_with("kubcode-") && name.len() <= 20,
        "no creator name or email goes to the processor: {name}"
    );
    assert_eq!(
        create.header("idempotency-key"),
        Some(ws.0.to_string().as_str())
    );

    let connect = &log[1];
    assert_eq!(connect.url.path(), "/api/v1/connect/youtube");
    let q: Vec<(String, String)> = connect.url.query_pairs().into_owned().collect();
    assert!(q.contains(&("profileId".into(), start.profile.0.clone())));
    assert!(q.contains(&("headless".into(), "true".into())));
    assert!(q.contains(&(
        "redirect_url".into(),
        "https://kubcode.dev/api/channels/callback?i=abc".into()
    )));
}

#[tokio::test]
async fn a_callback_url_outside_kubcode_dev_is_refused_before_any_call() {
    let h = Harness::default();
    let err = h
        .zernio
        .start(
            &WorkspaceCtx {
                workspace: WorkspaceId(Uuid::new_v4()),
                profile: None,
            },
            Platform::YouTube,
            "https://evil.example/callback",
        )
        .await
        .unwrap_err();
    assert_eq!(err.code.as_str(), "bad_callback_url");
    assert!(h.fake.log().is_empty());
}

#[tokio::test]
async fn youtube_post_carries_the_designed_cover_title_and_visibility() {
    let h = Harness::default();
    let conn = h.connection(Platform::YouTube).await;
    let req = sample_request(Platform::YouTube, h.now());
    let key = req.idempotency_key;
    h.zernio
        .schedule(&conn, &checked(&h, req), &FakeMedia)
        .await
        .unwrap();

    let log = h.fake.log();
    let uploads: Vec<_> = log.iter().filter(|r| r.method == Method::Put).collect();
    assert_eq!(uploads.len(), 2, "video and cover go through presign");
    for u in &uploads {
        assert_eq!(u.header("authorization"), None, "no API key to storage");
        assert!(u.uploaded.as_ref().is_some_and(|b| !b.is_empty()));
        assert!(u.header("content-type").is_some());
    }
    let post = log
        .iter()
        .find(|r| r.method == Method::Post && r.url.path() == "/api/v1/posts")
        .unwrap();
    assert_eq!(
        post.header("authorization"),
        Some(format!("Bearer {API_KEY}").as_str())
    );
    assert_eq!(
        post.header("idempotency-key"),
        Some(key.to_string().as_str())
    );
    let b = post.json.as_ref().unwrap();
    let media = &b["mediaItems"][0];
    assert_eq!(media["type"], "video");
    assert!(media["url"].as_str().unwrap().ends_with("video.mp4"));
    assert!(
        media["thumbnail"]
            .as_str()
            .unwrap()
            .ends_with("thumbnail.png"),
        "the designed cover is the YouTube thumbnail"
    );
    let p = &b["platforms"][0];
    assert_eq!(p["platform"], "youtube");
    assert_eq!(p["accountId"], conn.account.0);
    assert_eq!(p["platformSpecificData"]["title"], "หมึกยักษ์หลบเรามาตลอด");
    assert_eq!(p["platformSpecificData"]["visibility"], "private");
    assert_eq!(p["platformSpecificData"]["madeForKids"], false);
    assert_eq!(b["content"], "คำอธิบายคลิป");
    assert_eq!(b["tags"][0], "deep sea");
    assert_eq!(
        b["scheduledFor"], "2026-11-09T07:00:00Z",
        "UTC, two hours on"
    );
    assert!(b.get("publishNow").is_none() && b.get("isDraft").is_none());
}

#[tokio::test]
async fn instagram_reel_uses_the_designed_cover_never_a_frame() {
    let h = Harness::default();
    let conn = h.connection(Platform::Instagram).await;
    let mut req = sample_request(Platform::Instagram, h.now());
    req.draft.visibility = Visibility::Public;
    h.zernio
        .schedule(&conn, &checked(&h, req), &FakeMedia)
        .await
        .unwrap();
    let log = h.fake.log();
    let post = log
        .iter()
        .find(|r| r.method == Method::Post && r.url.path() == "/api/v1/posts")
        .unwrap();
    let b = post.json.as_ref().unwrap();
    let psd = &b["platforms"][0]["platformSpecificData"];
    assert!(psd["instagramThumbnail"]
        .as_str()
        .unwrap()
        .ends_with("thumbnail.png"));
    assert!(psd.get("thumbOffset").is_none());
    assert_eq!(psd["shareToFeed"], true);
    assert!(b["mediaItems"][0].get("thumbnail").is_none());
    assert_eq!(b["content"], "คำอธิบายคลิป");
}

#[tokio::test]
async fn cancelling_a_published_post_is_refused() {
    let h = Harness::default();
    let conn = h.connection(Platform::YouTube).await;
    let req = sample_request(Platform::YouTube, h.now());
    let post = h
        .zernio
        .schedule(&conn, &checked(&h, req), &FakeMedia)
        .await
        .unwrap();
    h.fake.set_post_status(&post.0, "published");
    let err = h.zernio.cancel(&conn, &post).await.unwrap_err();
    assert_eq!(err.code.as_str(), "already_published");
    let st = h.zernio.status(&conn, &post).await.unwrap();
    assert_eq!(
        st.platform_url.as_deref(),
        Some("https://www.youtube.com/watch?v=y7AAfV8ABIo")
    );
}

#[test]
fn media_over_zernios_5_gb_cap_is_refused_by_the_adapter() {
    let h = Harness::default();
    let mut d = sample_request(Platform::YouTube, h.now()).draft;
    d.video.bytes = 5 * 1024 * 1024 * 1024 + 1;
    let v: Vec<_> = h.zernio.validate(&d).into_iter().map(|v| v.code).collect();
    assert_eq!(v, vec!["provider_video_too_large"]);
}

/// Answers every call with the same JSON body.
struct Canned(serde_json::Value);

#[async_trait::async_trait]
impl kubcode_publishing_zernio::transport::Transport for Canned {
    async fn send(
        &self,
        _req: kubcode_publishing_zernio::transport::HttpRequest,
    ) -> Result<
        kubcode_publishing_zernio::transport::HttpResponse,
        kubcode_publishing_zernio::transport::TransportError,
    > {
        Ok(kubcode_publishing_zernio::transport::HttpResponse {
            status: 200,
            headers: vec![],
            body: serde_json::to_vec(&self.0).unwrap(),
        })
    }
}

#[tokio::test]
async fn an_account_without_a_profile_id_is_not_accepted() {
    use kubcode_publishing::domain::ProviderRef;
    use kubcode_publishing::ports::CallbackParams;
    let z = kubcode_publishing_zernio::Zernio::new(
        kubcode_publishing_zernio::ZernioConfig {
            base_url: support::BASE.into(),
            api_key: API_KEY.into(),
        },
        std::sync::Arc::new(Canned(serde_json::json!({
            "accounts": [{"_id": "a1", "platform": "youtube", "username": "x", "isActive": true}]
        }))),
        std::sync::Arc::new(kubcode_publishing_zernio::limiter::MinuteWindow::new(10)),
    );
    let err = z
        .complete(
            &ProviderRef("p1".into()),
            Platform::YouTube,
            &CallbackParams(vec![("accountId".into(), "a1".into())]),
        )
        .await
        .unwrap_err();
    assert_eq!(err.code.as_str(), "account_not_in_profile");
}
