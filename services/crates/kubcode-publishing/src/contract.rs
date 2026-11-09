//! The contract every adapter must pass (design §7): the same suite runs on
//! the fake, on the Zernio adapter against recorded fixtures, and on every
//! native adapter before its platform may move off Zernio.
//!
//! Each adapter provides a harness that can set up provider state and inject
//! faults; the suite only uses the ports.

use async_trait::async_trait;
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::config::PublishingConfig;
use crate::domain::{
    ConnectionStatus, DeliveryId, DeliveryStatus, MediaMeta, Platform, ProviderRef, Visibility,
    WorkspaceId,
};
use crate::errors::{ErrorClass, PublishError};
use crate::events::{EventSource, Headers, ProviderEvent};
use crate::ports::{
    check, CallbackParams, Checked, ConnectProvider, ConnectionRef, DeliveryRequest, MediaSource,
    Publisher, WorkspaceCtx,
};
use crate::validate::{DeliveryDraft, Velocity};

/// A valid delivery request for `platform`, two hours after `now`.
pub fn sample_request(platform: Platform, now: OffsetDateTime) -> DeliveryRequest {
    DeliveryRequest {
        delivery: DeliveryId(Uuid::new_v4()),
        idempotency_key: Uuid::new_v4(),
        draft: DeliveryDraft {
            platform,
            title: "หมึกยักษ์หลบเรามาตลอด".into(),
            description: "คำอธิบายคลิป".into(),
            tags: vec!["deep sea".into()],
            video: MediaMeta {
                content_type: "video/mp4".into(),
                bytes: 1_024,
                width: 1080,
                height: 1920,
                seconds: Some(59.0),
            },
            cover: Some(MediaMeta {
                content_type: "image/png".into(),
                bytes: 512,
                width: 1080,
                height: 1920,
                seconds: None,
            }),
            publish_at: now + Duration::hours(2),
            visibility: Visibility::Private,
        },
    }
}

fn expect_class<T: std::fmt::Debug>(r: Result<T, PublishError>, class: ErrorClass, what: &str) {
    match r {
        Err(e) => assert_eq!(e.class, class, "{what}: wrong class ({e})"),
        Ok(v) => panic!("{what}: expected {class:?}, got Ok({v:?})"),
    }
}

// ------------------------------------------------------------------ connect

#[async_trait]
pub trait ConnectHarness: Send + Sync {
    type P: ConnectProvider;
    fn provider(&self) -> &Self::P;
    /// Simulates the creator approving `platform` on the consent screen and
    /// returns the query string the provider would send to our callback.
    async fn approve(&self, profile: &ProviderRef, platform: Platform) -> CallbackParams;
    /// A callback naming an account that is not in `profile`.
    fn foreign_callback(&self, platform: Platform) -> CallbackParams;
    /// A callback for a creator who pressed "cancel" on the consent screen.
    fn denied_callback(&self, platform: Platform) -> CallbackParams;
}

pub async fn connect_contract<H: ConnectHarness>(h: &H) {
    let p = h.provider();
    let ws = WorkspaceCtx {
        workspace: WorkspaceId(Uuid::new_v4()),
        profile: None,
    };
    let cb_url = "https://kubcode.dev/api/channels/callback?i=state";

    let first = p
        .start(&ws, Platform::YouTube, cb_url)
        .await
        .expect("start");
    assert!(first.auth_url.starts_with("https://"), "auth url is https");
    let again = p
        .start(
            &WorkspaceCtx {
                profile: Some(first.profile.clone()),
                ..ws.clone()
            },
            Platform::Instagram,
            cb_url,
        )
        .await
        .expect("start with known profile");
    assert_eq!(again.profile, first.profile, "one profile per workspace");
    let lost = p
        .start(&ws, Platform::YouTube, cb_url)
        .await
        .expect("start again without the stored profile");
    assert_eq!(
        lost.profile, first.profile,
        "a workspace whose profile ref was lost gets the same profile back"
    );

    let profile = first.profile;
    let cb = h.approve(&profile, Platform::YouTube).await;
    let acct = p
        .complete(&profile, Platform::YouTube, &cb)
        .await
        .expect("complete");
    assert_eq!(acct.platform, Platform::YouTube);
    assert!(!acct.display_name.is_empty());

    expect_class(
        p.complete(&profile, Platform::Instagram, &cb).await,
        ErrorClass::Rejected,
        "an account of another platform is refused",
    );
    expect_class(
        p.complete(
            &profile,
            Platform::YouTube,
            &h.foreign_callback(Platform::YouTube),
        )
        .await,
        ErrorClass::Rejected,
        "an account outside the profile is refused",
    );
    expect_class(
        p.complete(
            &profile,
            Platform::YouTube,
            &h.denied_callback(Platform::YouTube),
        )
        .await,
        ErrorClass::Rejected,
        "a denied consent is refused",
    );

    let health = p.health(&profile).await.expect("health");
    assert!(
        health
            .iter()
            .any(|c| c.account == acct.account && c.status == ConnectionStatus::Active),
        "the new account is healthy"
    );

    let conn = ConnectionRef {
        platform: Platform::YouTube,
        profile: profile.clone(),
        account: acct.account.clone(),
    };
    p.disconnect(&conn).await.expect("disconnect");
    p.disconnect(&conn).await.expect("disconnect is idempotent");
    let health = p.health(&profile).await.expect("health after disconnect");
    assert!(
        !health
            .iter()
            .any(|c| c.account == acct.account && c.status == ConnectionStatus::Active),
        "a disconnected account is never active"
    );
}

// ------------------------------------------------------------------ publish

/// The next provider call fails like this.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fault {
    TokenExpired,
    RateLimited { retry_after_secs: u32 },
    ServerError,
    Billing,
}

#[async_trait]
pub trait PublisherHarness: Send + Sync {
    type P: Publisher;
    fn publisher(&self) -> &Self::P;
    /// A healthy connection on `platform`.
    async fn connection(&self, platform: Platform) -> ConnectionRef;
    /// A valid video and cover.
    fn media(&self) -> Box<dyn MediaSource>;
    fn inject(&self, fault: Fault);
    /// How many posts the provider holds right now.
    async fn provider_posts(&self) -> usize;
    /// Makes the provider report `post` as published.
    async fn mark_published(&self, post: &ProviderRef);
    fn now(&self) -> OffsetDateTime;
}

fn checked<H: PublisherHarness>(h: &H, req: DeliveryRequest) -> Checked {
    check(
        req,
        h.now(),
        Velocity::default(),
        &PublishingConfig::default(),
        h.publisher(),
    )
    .expect("sample request is valid")
}

pub async fn publisher_contract<H: PublisherHarness>(h: &H) {
    let p = h.publisher();
    let media = h.media();
    for platform in [Platform::YouTube, Platform::Instagram] {
        let conn = h.connection(platform).await;
        let mut req = sample_request(platform, h.now());
        if platform == Platform::Instagram {
            req.draft.visibility = Visibility::Public;
        }
        let before = h.provider_posts().await;

        let d = checked(h, req.clone());
        let taken = p
            .schedule(&conn, &d, media.as_ref())
            .await
            .expect("schedule");
        assert_eq!(
            taken.state.status,
            DeliveryStatus::Scheduled,
            "{platform:?}: a future publish time is reported as scheduled"
        );
        let post = taken.post;
        let again = p
            .schedule(&conn, &d, media.as_ref())
            .await
            .expect("schedule again")
            .post;
        assert_eq!(post, again, "{platform:?}: same idempotency key, same post");
        assert_eq!(
            h.provider_posts().await,
            before + 1,
            "{platform:?}: no duplicate"
        );

        let st = p.status(&conn, &post).await.expect("status");
        assert_eq!(st.status, DeliveryStatus::Scheduled, "{platform:?}");

        h.mark_published(&post).await;
        let st = p.status(&conn, &post).await.expect("status after publish");
        assert_eq!(st.status, DeliveryStatus::Published, "{platform:?}");

        let other = DeliveryRequest {
            idempotency_key: Uuid::new_v4(),
            delivery: DeliveryId(Uuid::new_v4()),
            ..req
        };
        let second = p
            .schedule(&conn, &checked(h, other), media.as_ref())
            .await
            .expect("a new key is a new post")
            .post;
        assert_ne!(second, post);
        p.cancel(&conn, &second).await.expect("cancel");
        p.cancel(&conn, &second)
            .await
            .expect("cancel is idempotent");
        match p.status(&conn, &second).await {
            Ok(s) => assert_eq!(s.status, DeliveryStatus::Cancelled),
            Err(e) => assert_eq!(e.class, ErrorClass::NotFound, "cancelled post: {e}"),
        }
    }

    let conn = h.connection(Platform::YouTube).await;
    expect_class(
        p.status(&conn, &ProviderRef("no-such-post".into())).await,
        ErrorClass::NotFound,
        "unknown post",
    );

    let faults = [
        (Fault::TokenExpired, ErrorClass::NeedsReconnect),
        (
            Fault::RateLimited {
                retry_after_secs: 30,
            },
            ErrorClass::RateLimited {
                retry_after_secs: 30,
            },
        ),
        (Fault::ServerError, ErrorClass::Temporary),
        (Fault::Billing, ErrorClass::ProviderBilling),
    ];
    for (fault, class) in faults {
        h.inject(fault);
        let d = checked(h, sample_request(Platform::YouTube, h.now()));
        expect_class(
            p.schedule(&conn, &d, media.as_ref()).await,
            class,
            &format!("{fault:?}"),
        );
    }
}

// ------------------------------------------------------------------ events

pub trait EventHarness: Send + Sync {
    type E: EventSource;
    fn source(&self) -> &Self::E;
    /// A correctly signed "post published" delivery for `post`.
    fn published(&self, post: &ProviderRef) -> (Headers, Vec<u8>);
    /// A correctly signed delivery of an event type we do not handle.
    fn unknown(&self) -> (Headers, Vec<u8>);
    /// Headers for `body` signed with a different secret.
    fn wrong_secret(&self, body: &[u8]) -> Headers;
}

pub fn events_contract<H: EventHarness>(h: &H) {
    let s = h.source();
    let post = ProviderRef("post-1".into());
    let (headers, body) = h.published(&post);

    let v = s.verify(&headers, &body).expect("valid signature");
    let events = s.translate(&v);
    assert!(
        events
            .iter()
            .any(|e| matches!(e, ProviderEvent::PostPublished { post: p, .. } if *p == post)),
        "published event translated: {events:?}"
    );
    let again = s.verify(&headers, &body).expect("a retry verifies too");
    assert_eq!(again.event_id, v.event_id, "retries keep the event id");
    assert_eq!(again.body_sha256, v.body_sha256);

    let mut tampered = body.clone();
    tampered.push(b' ');
    expect_class(
        s.verify(&headers, &tampered),
        ErrorClass::Rejected,
        "tampered body",
    );
    expect_class(
        s.verify(&h.wrong_secret(&body), &body),
        ErrorClass::Rejected,
        "wrong secret",
    );
    expect_class(
        s.verify(&Headers::default(), &body),
        ErrorClass::Rejected,
        "missing signature",
    );

    let (uh, ub) = h.unknown();
    let u = s.verify(&uh, &ub).expect("unknown types still verify");
    assert!(
        s.translate(&u)
            .iter()
            .all(|e| matches!(e, ProviderEvent::Ignored { .. })),
        "unknown types change nothing"
    );
}
