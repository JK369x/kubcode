//! The Lambda's use cases end to end against Postgres and the fake provider.
//!
//!   KUBCODE_TEST_DATABASE_URL=postgres://postgres:…@127.0.0.1:55432/kubcode_local_test \
//!     cargo test -p kubcode-publishing-lambda -- --ignored

mod support;

use std::sync::Arc;

use kubcode_publishing::domain::{
    ChannelId, DeliveryStatus, MediaKind, MediaMeta, Platform, ProviderKind, ProviderRef,
    Visibility,
};
use kubcode_publishing::errors::{ErrorClass, PublishError};
use kubcode_publishing::fake::FakeProvider;
use kubcode_publishing::ports::{CallbackParams, DeliveryState};
use kubcode_publishing_store::Store;
use publishing_lambda::ops;
use publishing_lambda::service::{AssetRequest, Service, WebhookResult};
use publishing_lambda::summary::{digest, ScheduleRequest, Target};
use support::{cfg, db, registry, FakeOpener};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

const CLIP: &str = "2026-11-08_deep-sea-docs_ep01_giant-squid";

fn svc<'a>(
    store: &'a mut Store,
    reg: &'a publishing_lambda::service::Registry,
    cfg: &'a kubcode_publishing::config::PublishingConfig,
) -> Service<'a> {
    Service {
        store,
        reg,
        cfg,
        media: &FakeOpener,
        now: OffsetDateTime::now_utc(),
    }
}

/// Connects one YouTube channel for `user` through the fake and returns it.
async fn connect(
    s: &mut Service<'_>,
    fake: &FakeProvider,
    user: Uuid,
    platform: Platform,
) -> ChannelId {
    let state = *Uuid::new_v4().as_bytes();
    let state = [state, state].concat().try_into().unwrap();
    let url = s
        .connect_start(user, platform, &state, &[1; 32], &[2; 32])
        .await
        .unwrap();
    assert!(url.starts_with("https://"));
    let ws = s.store.owner_workspace(user).await.unwrap();
    let profile = s
        .store
        .profile(ws, ProviderKind::Zernio)
        .await
        .unwrap()
        .expect("profile stored on first connect");
    let account = fake.add_account(&profile, platform);
    s.connect_complete(
        &state,
        CallbackParams(vec![("accountId".into(), account.0)]),
    )
    .await
    .unwrap()
}

async fn assets(s: &mut Service<'_>, user: Uuid, with_cover: bool) -> (Uuid, Option<Uuid>) {
    let meta = |ct: &str, seconds| MediaMeta {
        content_type: ct.into(),
        bytes: 1000,
        width: 1080,
        height: 1920,
        seconds,
    };
    let (video, key) = s
        .register_asset(
            user,
            AssetRequest {
                clip_ref: CLIP.into(),
                kind: MediaKind::Video,
                sha256: "ab".repeat(32),
                ext: "mp4".into(),
                meta: meta("video/mp4", Some(58.9)),
            },
        )
        .await
        .unwrap();
    let ws = s.store.owner_workspace(user).await.unwrap();
    assert_eq!(
        key,
        format!("clips/{}/{CLIP}/{}.mp4", ws.0, "ab".repeat(32))
    );
    let cover = if with_cover {
        Some(
            s.register_asset(
                user,
                AssetRequest {
                    clip_ref: CLIP.into(),
                    kind: MediaKind::Cover,
                    sha256: "cd".repeat(32),
                    ext: "png".into(),
                    meta: meta("image/png", None),
                },
            )
            .await
            .unwrap()
            .0,
        )
    } else {
        None
    };
    (video.0, cover.map(|c| c.0))
}

fn request(video: Uuid, cover: Option<Uuid>, channels: &[ChannelId]) -> ScheduleRequest {
    ScheduleRequest {
        clip_ref: CLIP.into(),
        video_asset: video,
        cover_asset: cover,
        title: "หมึกยักษ์หลบเรามาตลอด".into(),
        description: "คำอธิบาย".into(),
        tags: vec!["deep sea".into()],
        targets: channels
            .iter()
            .map(|c| Target {
                channel: c.0,
                publish_at: OffsetDateTime::now_utc() + Duration::hours(3),
                visibility: Visibility::Private,
            })
            .collect(),
    }
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn connect_then_publish_one_clip_privately() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;

    let yt = connect(&mut s, &fake, owner, Platform::YouTube).await;
    assert_eq!(s.channels(owner).await.unwrap().len(), 1);

    let (video, cover) = assets(&mut s, owner, true).await;
    let req = request(video, cover, &[yt]);
    let out = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    assert_eq!(out.deliveries.len(), 1);
    let d = &out.deliveries[0];
    assert_eq!(d.status, DeliveryStatus::Scheduled, "{d:?}");
    assert_eq!(fake.post_count(), 1);

    let status = s.status(owner, out.post).await.unwrap();
    assert_eq!(status[0].status, DeliveryStatus::Scheduled);
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn what_the_provider_reports_on_handover_is_what_we_record() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let yt = connect(&mut s, &fake, owner, Platform::YouTube).await;

    // A due publish that failed inline: terminal, with the provider's code.
    fake.answer_next_schedule(DeliveryState {
        status: DeliveryStatus::Failed,
        platform_post_id: None,
        platform_url: None,
        error: Some(PublishError::new(
            ErrorClass::Rejected,
            "platform_user_content",
        )),
    });
    let (video, cover) = assets(&mut s, owner, true).await;
    let req = request(video, cover, &[yt]);
    let out = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    assert_eq!(out.deliveries[0].status, DeliveryStatus::Failed);
    assert_eq!(
        out.deliveries[0].codes,
        vec!["platform_user_content".to_owned()]
    );
    let st = s.status(owner, out.post).await.unwrap();
    assert_eq!(st[0].status, DeliveryStatus::Failed);

    // Published inline: on its way; the receipt (URL) comes with the webhook.
    fake.answer_next_schedule(DeliveryState {
        status: DeliveryStatus::Published,
        platform_post_id: None,
        platform_url: None,
        error: None,
    });
    let (video, cover) = assets(&mut s, owner, true).await;
    let req = request(video, cover, &[yt]);
    let out = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    assert_eq!(out.deliveries[0].status, DeliveryStatus::Publishing);
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn a_summary_that_differs_from_the_confirmed_one_is_refused() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let yt = connect(&mut s, &fake, owner, Platform::YouTube).await;
    let (video, cover) = assets(&mut s, owner, true).await;
    let shown = request(video, cover, &[yt]);
    let mut sent = shown.clone();
    sent.targets[0].visibility = Visibility::Public;
    let err = s.schedule(owner, sent, digest(&shown)).await.unwrap_err();
    assert_eq!(err.code, "digest_mismatch");
    assert_eq!(fake.post_count(), 0, "nothing reached the provider");
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn no_cover_means_rejected_before_the_provider() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let yt = connect(&mut s, &fake, owner, Platform::YouTube).await;
    let (video, _) = assets(&mut s, owner, false).await;
    let req = request(video, None, &[yt]);
    let out = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    assert_eq!(out.deliveries[0].status, DeliveryStatus::Rejected);
    assert_eq!(out.deliveries[0].codes, vec!["cover_missing".to_owned()]);
    assert_eq!(fake.post_count(), 0);
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn other_workspaces_are_out_of_reach() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let (owner, other) = (db.user(true).await, db.user(false).await);
    let theirs = connect(&mut s, &fake, other, Platform::YouTube).await;
    let (video, cover) = assets(&mut s, owner, true).await;
    let req = request(video, cover, &[theirs]);
    let out = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    assert_eq!(
        out.deliveries[0].codes,
        vec!["channel_not_found".to_owned()]
    );
    assert_eq!(fake.post_count(), 0);

    let (their_video, their_cover) = assets(&mut s, other, true).await;
    let req = request(their_video, their_cover, &[]);
    assert_eq!(
        s.schedule(owner, req.clone(), digest(&req))
            .await
            .unwrap_err()
            .code,
        "asset_not_found"
    );
    assert_eq!(
        s.disconnect(owner, theirs).await.unwrap_err().code,
        "channel_not_found"
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn webhooks_cancel_and_disconnect() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let yt = connect(&mut s, &fake, owner, Platform::YouTube).await;
    let (video, cover) = assets(&mut s, owner, true).await;

    let req = request(video, cover, &[yt]);
    let first = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    // The fake's posts are numbered; the first post of this provider is post-N.
    let delivery = first.deliveries[0].delivery.unwrap();
    let row = s.store.delivery(delivery).await.unwrap().unwrap();
    let post_ref = row.provider_ref.unwrap();
    let (headers, body) = fake.signed(serde_json::json!({
        "id": "evt-1", "event": "post.published", "post": post_ref.0,
    }));
    assert_eq!(
        s.webhook(ProviderKind::Zernio, &headers, &body).await,
        WebhookResult::Accepted
    );
    assert_eq!(
        s.webhook(ProviderKind::Zernio, &headers, &body).await,
        WebhookResult::Accepted,
        "a retry is accepted and changes nothing"
    );
    assert_eq!(
        s.webhook(ProviderKind::Zernio, &Default::default(), &body)
            .await,
        WebhookResult::Unauthorized
    );
    assert_eq!(
        s.status(owner, first.post).await.unwrap()[0].status,
        DeliveryStatus::Published
    );
    // The owner's CLI records what the platform served as the thumbnail.
    let cover = |d: uuid::Uuid, check: &str| serde_json::json!({"op": "cover_check", "delivery": d, "check": check});
    let recorded = ops::run(&mut s, cover(delivery.0, "mismatch"), "b").await;
    assert_eq!(recorded["ok"], true, "{recorded}");
    let st = s.status(owner, first.post).await.unwrap();
    assert_eq!(st[0].cover_check.as_deref(), Some("mismatch"));
    assert!(!st[0].clip_ref.is_empty());
    assert_eq!(
        ops::run(&mut s, cover(delivery.0, "maybe"), "b").await["code"],
        "bad_request"
    );
    assert_eq!(
        ops::run(&mut s, cover(uuid::Uuid::new_v4(), "ok"), "b").await["code"],
        "delivery_not_found"
    );
    assert_eq!(
        s.cancel(owner, delivery).await.unwrap_err().code,
        "already_final"
    );

    let second = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    let d2 = second.deliveries[0].delivery.unwrap();
    s.cancel(owner, d2).await.unwrap();
    assert_eq!(
        ops::run(&mut s, cover(d2.0, "ok"), "b").await["code"],
        "no_receipt",
        "only a published delivery has a thumbnail to check"
    );
    assert_eq!(
        s.status(owner, second.post).await.unwrap()[0].status,
        DeliveryStatus::Cancelled
    );

    s.disconnect(owner, yt).await.unwrap();
    let third = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    assert_eq!(
        third.deliveries[0].codes,
        vec!["needs_reconnect".to_owned()]
    );
    let _ = ProviderRef(String::new());
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn a_denied_consent_fails_the_intent_and_creates_nothing() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let state = [7u8; 32];
    s.connect_start(owner, Platform::Instagram, &state, &[1; 32], &[2; 32])
        .await
        .unwrap();
    let err = s
        .connect_complete(
            &state,
            CallbackParams(vec![("error".into(), "oauth_denied".into())]),
        )
        .await
        .unwrap_err();
    assert_eq!(err.code, "connect_denied");
    assert!(s.channels(owner).await.unwrap().is_empty());
    assert_eq!(
        s.connect_complete(&state, CallbackParams::default())
            .await
            .unwrap_err()
            .code,
        "intent_invalid",
        "single use"
    );
    db.drop().await;
}
