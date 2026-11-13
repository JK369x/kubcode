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

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn comments_become_one_dm_per_person_per_post() {
    use kubcode_publishing::ports::PrivateReply;
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, mut cfg) = (registry(&fake), cfg());
    cfg.dm_cap_per_month = 3;
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let ig = connect(&mut s, &fake, owner, Platform::Instagram).await;
    let acct = s.store.connections(ig).await.unwrap()[0]
        .provider_ref
        .clone();
    db.owner
        .execute(
            "INSERT INTO kubcode_accounts.automation_rules (channel_id, keywords, dm_text, public_reply)
             VALUES ($1, ARRAY['ขอลิงก์'], 'ลิงก์: https://kubcode.dev/go/x', 'ส่งให้ใน DM แล้วนะ')",
            &[&ig.0],
        )
        .await
        .unwrap();
    let mut n = 0;
    let mut comment = |id: &str, post: &str, author: &str, text: &str, own: bool| {
        n += 1;
        fake.signed(serde_json::json!({
            "id": format!("evt-{n}"), "event": "comment.received", "account": acct.0,
            "comment": id, "post": post, "author": author, "text": text, "own": own,
        }))
    };
    for (id, post, author, text, own) in [
        ("c1", "p1", "a1", "ขอลิงก์ครับ", false),
        ("c2", "p1", "a2", "สวยมาก", false),
        ("c3", "p1", "a1", "ขอลิงก์อีกที", false),
        ("c4", "p1", "me", "ขอลิงก์", true),
    ] {
        let (h, b) = comment(id, post, author, text, own);
        assert_eq!(
            s.webhook(ProviderKind::Zernio, &h, &b).await,
            WebhookResult::Accepted
        );
    }
    let stored: i64 = db
        .owner
        .query_one("SELECT count(*) FROM kubcode_accounts.comment_items", &[])
        .await
        .unwrap()
        .get(0);
    assert_eq!(
        stored, 2,
        "only matching comments are kept (no ids of others)"
    );

    let out = s.work().await.unwrap();
    assert_eq!(
        out,
        vec![("c1".to_owned(), "dm_sent"), ("c3".to_owned(), "duplicate")]
    );
    assert_eq!(
        fake.inbox_calls(),
        vec![
            (
                "private".to_owned(),
                "p1".to_owned(),
                "c1".to_owned(),
                "ลิงก์: https://kubcode.dev/go/x".to_owned()
            ),
            (
                "public".to_owned(),
                "p1".to_owned(),
                "c1".to_owned(),
                "ส่งให้ใน DM แล้วนะ".to_owned()
            ),
        ]
    );

    // A spent reply is final and, after_dm, gets no public reply.
    fake.answer_next_private(PrivateReply::Consumed);
    let (h, b) = comment("c5", "p2", "a1", "ขอลิงก์", false);
    s.webhook(ProviderKind::Zernio, &h, &b).await;
    assert_eq!(
        s.work().await.unwrap(),
        vec![("c5".to_owned(), "dm_consumed")]
    );
    assert_eq!(
        fake.inbox_calls().len(),
        3,
        "no public reply after a failed DM"
    );

    // No clear answer: may be out, never retried.
    fake.answer_next_private(PrivateReply::Unknown);
    let (h, b) = comment("c6", "p3", "a1", "ขอลิงก์", false);
    s.webhook(ProviderKind::Zernio, &h, &b).await;
    assert_eq!(
        s.work().await.unwrap(),
        vec![("c6".to_owned(), "dm_unknown")]
    );
    assert!(s.work().await.unwrap().is_empty());
    assert_eq!(fake.inbox_calls().len(), 4);

    // The cap counts sent and unknown DMs (2 of 3 used): one more, then stop.
    for (id, post) in [("c7", "p4"), ("c8", "p5")] {
        let (h, b) = comment(id, post, "a9", "ขอลิงก์", false);
        s.webhook(ProviderKind::Zernio, &h, &b).await;
    }
    assert_eq!(
        s.work().await.unwrap(),
        vec![
            ("c7".to_owned(), "dm_sent"),
            ("c8".to_owned(), "cap_reached")
        ]
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn catch_up_finds_comments_the_webhook_missed() {
    use kubcode_publishing::events::IncomingComment;
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let ig = connect(&mut s, &fake, owner, Platform::Instagram).await;
    let acct = s.store.connections(ig).await.unwrap()[0]
        .provider_ref
        .clone();
    db.owner
        .execute(
            "INSERT INTO kubcode_accounts.automation_rules (channel_id, keywords, dm_text)
             VALUES ($1, ARRAY['ขอลิงก์'], 'ลิงก์: https://kubcode.dev/go/x')",
            &[&ig.0],
        )
        .await
        .unwrap();
    let c = |id: &str, author: &str, own: bool| IncomingComment {
        account: acct.clone(),
        comment_id: id.into(),
        platform_post_id: "p1".into(),
        author_id: author.into(),
        own_account: own,
        is_reply: false,
        created_at: Some(time::OffsetDateTime::now_utc()),
        text: "ขอลิงก์".into(),
    };
    fake.set_post_comments("p1", vec![c("k1", "a1", false), c("k2", "me", true)]);
    // A post rule naming a post the account does not list is never read.
    db.owner
        .execute(
            "INSERT INTO kubcode_accounts.automation_rules (channel_id, keywords, dm_text, platform_post_id)
             VALUES ($1, ARRAY['ขอลิงก์'], 'x', 'someone-elses-post')",
            &[&ig.0],
        )
        .await
        .unwrap();

    assert_eq!(s.catch_up().await.unwrap(), 1, "one new matching comment");
    assert!(
        !fake.inbox_reads().iter().any(|p| p == "someone-elses-post"),
        "only posts the account itself lists"
    );
    assert_eq!(
        s.catch_up().await.unwrap(),
        0,
        "seen comments are not recorded again"
    );
    assert_eq!(s.work().await.unwrap(), vec![("k1".to_owned(), "dm_sent")]);
    assert!(s.work().await.unwrap().is_empty());
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn the_scheduled_worker_catches_up_every_ten_minutes() {
    use kubcode_publishing::events::IncomingComment;
    use publishing_lambda::worker::run;
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let ig = connect(&mut s, &fake, owner, Platform::Instagram).await;
    let acct = s.store.connections(ig).await.unwrap()[0]
        .provider_ref
        .clone();
    db.owner
        .execute(
            "INSERT INTO kubcode_accounts.automation_rules (channel_id, keywords, dm_text) VALUES ($1, ARRAY['link'], 'x')",
            &[&ig.0],
        )
        .await
        .unwrap();
    fake.set_post_comments(
        "p1",
        vec![IncomingComment {
            account: acct,
            comment_id: "k1".into(),
            platform_post_id: "p1".into(),
            author_id: "a1".into(),
            own_account: false,
            is_reply: false,
            created_at: Some(time::OffsetDateTime::now_utc()),
            text: "link please".into(),
        }],
    );
    let quiet = run(&mut s, 3).await;
    assert_eq!(
        (
            quiet["ok"].as_bool(),
            quiet["kept"].as_u64(),
            quiet["handled"].as_u64()
        ),
        (Some(true), Some(0), Some(0))
    );
    let tenth = run(&mut s, 10).await;
    assert_eq!(
        (tenth["kept"].as_u64(), tenth["handled"].as_u64()),
        (Some(1), Some(1)),
        "{tenth}"
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn tiktok_comments_get_only_the_public_reply_once_per_person_per_post() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, mut cfg) = (registry(&fake), cfg());
    cfg.dm_cap_per_month = 2;
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let tt = connect(&mut s, &fake, owner, Platform::TikTok).await;
    let acct = s.store.connections(tt).await.unwrap()[0]
        .provider_ref
        .clone();
    db.owner
        .execute(
            "INSERT INTO kubcode_accounts.automation_rules (channel_id, keywords, dm_text, public_reply)
             VALUES ($1, ARRAY['egm'], 'unused on TikTok', 'ลิงก์อยู่ในไบโอนะ https://kubcode.dev/go/egm')",
            &[&tt.0],
        )
        .await
        .unwrap();
    let mut n = 0;
    let mut comment = |id: &str, post: &str, author: &str, text: &str| {
        n += 1;
        fake.signed(serde_json::json!({
            "id": format!("tt-evt-{n}"), "event": "comment.received", "account": acct.0,
            "comment": id, "post": post, "author": author, "text": text, "own": false,
        }))
    };
    for (id, post, author, text) in [
        ("t1", "v1", "a1", "EGM please"),
        ("t2", "v1", "a1", "egm"),
        ("t3", "v1", "a2", "nice"),
    ] {
        let (h, b) = comment(id, post, author, text);
        assert_eq!(
            s.webhook(ProviderKind::Zernio, &h, &b).await,
            WebhookResult::Accepted
        );
    }
    assert_eq!(
        s.work().await.unwrap(),
        vec![
            ("t1".to_owned(), "reply_sent"),
            ("t2".to_owned(), "duplicate")
        ]
    );
    assert_eq!(
        fake.inbox_calls(),
        vec![(
            "public".to_owned(),
            "v1".to_owned(),
            "t1".to_owned(),
            "ลิงก์อยู่ในไบโอนะ https://kubcode.dev/go/egm".to_owned()
        )],
        "never a private reply on TikTok"
    );
    let row = db
        .owner
        .query_one(
            "SELECT dm_state, reply_state FROM kubcode_accounts.dm_ledger WHERE channel_id = $1",
            &[&tt.0],
        )
        .await
        .unwrap();
    assert_eq!(
        (row.get::<_, String>(0), row.get::<_, String>(1)),
        ("claimed".to_owned(), "sent".to_owned())
    );

    // Public replies count against the same monthly cap (2): one more, then stop.
    for (id, post) in [("t4", "v2"), ("t5", "v3")] {
        let (h, b) = comment(id, post, "a1", "egm");
        s.webhook(ProviderKind::Zernio, &h, &b).await;
    }
    assert_eq!(
        s.work().await.unwrap(),
        vec![
            ("t4".to_owned(), "reply_sent"),
            ("t5".to_owned(), "cap_reached")
        ]
    );
    assert_eq!(fake.inbox_calls().len(), 2);

    // A TikTok rule without a public reply sends nothing.
    db.owner
        .execute(
            "UPDATE kubcode_accounts.automation_rules SET public_reply = NULL WHERE channel_id = $1",
            &[&tt.0],
        )
        .await
        .unwrap();
    cfg_free(&db, tt).await;
    let (h, b) = comment("t6", "v4", "a3", "egm");
    s.webhook(ProviderKind::Zernio, &h, &b).await;
    assert_eq!(
        s.work().await.unwrap(),
        vec![("t6".to_owned(), "no_public_reply")]
    );
    assert_eq!(fake.inbox_calls().len(), 2);
    db.drop().await;
}

/// Moves this channel's ledger rows to last month, so the cap is free again.
async fn cfg_free(db: &support::Db, channel: ChannelId) {
    db.owner
        .execute(
            "UPDATE kubcode_accounts.dm_ledger SET created_at = created_at - interval '40 days' WHERE channel_id = $1",
            &[&channel.0],
        )
        .await
        .unwrap();
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn a_late_tiktok_url_fills_the_receipt_without_overwriting() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let tt = connect(&mut s, &fake, owner, Platform::TikTok).await;
    let (video, cover) = assets(&mut s, owner, true).await;
    let mut req = request(video, cover, &[tt]);
    req.targets[0].visibility = Visibility::Public;
    let out = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    assert_eq!(
        out.deliveries[0].status,
        DeliveryStatus::Scheduled,
        "{out:?}"
    );
    let post_ref: String = db
        .owner
        .query_one(
            "SELECT provider_ref FROM kubcode_accounts.deliveries WHERE id = $1",
            &[&out.deliveries[0].delivery.unwrap().0],
        )
        .await
        .unwrap()
        .get(0);
    let store = &mut *s.store;
    let apply = |id: &str, body: serde_json::Value| kubcode_publishing::events::VerifiedDelivery {
        event_id: id.into(),
        body_sha256: [id.len() as u8; 32],
        event_type: "x".into(),
        body,
    };
    use kubcode_publishing::events::ProviderEvent;
    let published = |pid: Option<&str>, url: Option<&str>| ProviderEvent::PostPublished {
        post: ProviderRef(post_ref.clone()),
        platform_post_id: pid.map(str::to_owned),
        url: url.map(str::to_owned),
        at: None,
    };
    store
        .apply_event(
            ProviderKind::Zernio,
            &apply("e1", serde_json::json!({})),
            &[published(None, None)],
        )
        .await
        .unwrap();
    store
        .apply_event(
            ProviderKind::Zernio,
            &apply("e-two", serde_json::json!({})),
            &[published(
                Some("7300000000000000001"),
                Some("https://www.tiktok.com/@kubcode/video/7300000000000000001"),
            )],
        )
        .await
        .unwrap();
    store
        .apply_event(
            ProviderKind::Zernio,
            &apply("e-three", serde_json::json!({})),
            &[published(Some("999"), Some("https://evil.example/x"))],
        )
        .await
        .unwrap();
    let r = db
        .owner
        .query_one(
            "SELECT platform_post_id, platform_url FROM kubcode_accounts.receipts r
               JOIN kubcode_accounts.deliveries d ON d.id = r.delivery_id WHERE d.provider_ref = $1",
            &[&post_ref],
        )
        .await
        .unwrap();
    assert_eq!(
        (r.get::<_, String>(0), r.get::<_, String>(1)),
        (
            "7300000000000000001".to_owned(),
            "https://www.tiktok.com/@kubcode/video/7300000000000000001".to_owned()
        )
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn the_post_picker_lists_the_channels_posts_and_ours_first() {
    use kubcode_publishing::events::{ProviderEvent, VerifiedDelivery};
    use kubcode_publishing::ports::OwnPost;
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let (owner, other) = (db.user(true).await, db.user(false).await);
    let ig = connect(&mut s, &fake, owner, Platform::Instagram).await;
    let yt = connect(&mut s, &fake, owner, Platform::YouTube).await;
    let theirs = connect(&mut s, &fake, other, Platform::Instagram).await;
    fake.set_own_posts(vec![OwnPost {
        platform_post_id: "17900000000000001".into(),
        permalink: Some("https://www.instagram.com/reel/A/".into()),
        thumbnail_url: Some("https://cdn.example/a.jpg".into()),
        caption: "โพสต์เก่า".into(),
        created_at: Some(OffsetDateTime::now_utc() - Duration::days(3)),
    }]);

    // Published through kubcode a moment ago; the platform does not list it yet.
    let (video, cover) = assets(&mut s, owner, true).await;
    let mut req = request(video, cover, &[ig]);
    req.description = "คลิปใหม่\nบรรทัดสอง".into();
    req.targets[0].visibility = Visibility::Public;
    let out = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    assert_eq!(
        out.deliveries[0].status,
        DeliveryStatus::Scheduled,
        "{out:?}"
    );
    let post_ref: String = db
        .owner
        .query_one(
            "SELECT provider_ref FROM kubcode_accounts.deliveries WHERE id = $1",
            &[&out.deliveries[0].delivery.unwrap().0],
        )
        .await
        .unwrap()
        .get(0);
    s.store
        .apply_event(
            ProviderKind::Zernio,
            &VerifiedDelivery {
                event_id: "pub-1".into(),
                body_sha256: [7; 32],
                event_type: "post.platform.published".into(),
                body: serde_json::json!({}),
            },
            &[ProviderEvent::PostPublished {
                post: ProviderRef(post_ref),
                platform_post_id: Some("17900000000000009".into()),
                url: Some("https://www.instagram.com/reel/NEW/".into()),
                at: Some(OffsetDateTime::now_utc()),
            }],
        )
        .await
        .unwrap();

    let got = s.channel_posts(owner, ig).await.unwrap();
    assert!(got.complete);
    let ids: Vec<&str> = got
        .posts
        .iter()
        .map(|p| p.platform_post_id.as_str())
        .collect();
    assert_eq!(ids, vec!["17900000000000009", "17900000000000001"]);
    assert_eq!(got.posts[0].caption, "คลิปใหม่");
    assert!(got.posts[0].kubcode);
    assert_eq!(
        got.posts[0].permalink.as_deref(),
        Some("https://www.instagram.com/reel/NEW/")
    );
    assert_eq!(fake.own_post_reads(), 1);
    s.channel_posts(owner, ig).await.unwrap();
    assert_eq!(fake.own_post_reads(), 1, "cached briefly");

    for (user, ch) in [(owner, theirs), (owner, yt), (other, ig)] {
        assert_eq!(
            s.channel_posts(user, ch).await.unwrap_err().code,
            "channel_not_found"
        );
    }
    assert_eq!(
        fake.own_post_reads(),
        1,
        "no provider call for a refused channel"
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn billing_paused_channels_take_no_posts_and_disconnect_after_14_days() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = svc(&mut store, &reg, &cfg);
    let owner = db.user(true).await;
    let yt = connect(&mut s, &fake, owner, Platform::YouTube).await;
    let (video, cover) = assets(&mut s, owner, true).await;
    let req = request(video, cover, &[yt]);
    let before = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    let pending = before.deliveries[0].delivery.unwrap();
    assert_eq!(before.deliveries[0].status, DeliveryStatus::Scheduled);

    // The billing sweep pauses the channel (written by kubcode_billing).
    let paused_at = s.now - Duration::days(1);
    db.owner
        .execute(
            "INSERT INTO kubcode_accounts.billing_channel_pauses (channel_id, reason, paused_at) VALUES ($1, 'lapsed', $2)",
            &[&yt.0, &paused_at],
        )
        .await
        .unwrap();
    // New posts are refused before the provider.
    let posts_before = fake.post_count();
    let refused = s.schedule(owner, req.clone(), digest(&req)).await.unwrap();
    assert_eq!(
        refused.deliveries[0].codes,
        vec!["channel_paused".to_owned()]
    );
    assert_eq!(fake.post_count(), posts_before);

    // The publishing half of the sweep cancels the scheduled post; not yet 14 days.
    let (cancelled, disconnected) = s.billing_sweep().await.unwrap();
    assert_eq!((cancelled, disconnected), (1, 0));
    assert_eq!(
        s.store.delivery(pending).await.unwrap().unwrap().status,
        DeliveryStatus::Cancelled
    );
    assert_eq!(s.billing_sweep().await.unwrap(), (0, 0), "idempotent");

    // 14 days paused: disconnected from the provider; our rows stay.
    s.now = paused_at + Duration::days(14);
    assert_eq!(s.billing_sweep().await.unwrap(), (0, 1));
    assert!(s
        .store
        .connections(yt)
        .await
        .unwrap()
        .iter()
        .all(|c| c.status == kubcode_publishing::domain::ConnectionStatus::Revoked));
    assert!(
        s.store.channel(yt).await.unwrap().is_some(),
        "the channel is kept"
    );
    assert_eq!(s.billing_sweep().await.unwrap(), (0, 0));
    db.drop().await;
}
