//! The publishing store against a real, throwaway Postgres with every
//! migration applied, running as the Lambda role (kubcode_worker).
//!
//!   KUBCODE_TEST_DATABASE_URL=postgres://postgres:…@127.0.0.1:55432/kubcode_local_test \
//!     cargo test -p kubcode-publishing-store -- --ignored

use kubcode_publishing::domain::{
    ConnectionStatus, DeliveryStatus, MediaKind, MediaMeta, Platform, ProviderKind, ProviderRef,
    Visibility, WorkspaceId,
};
use kubcode_publishing::errors::ErrorCode;
use kubcode_publishing::events::{ProviderEvent, VerifiedDelivery};
use kubcode_publishing::ports::ConnectedAccount;
use kubcode_publishing_store::{
    ApplyOutcome, NewAsset, NewDelivery, NewIntent, NewPost, Store, StoreError,
};
use sha2::{Digest, Sha256};
use time::{Duration, OffsetDateTime};
use tokio_postgres::{Client, NoTls};
use uuid::Uuid;

const NEEDS_DB: &str = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored";

async fn connect(url: &str) -> Client {
    let (c, conn) = tokio_postgres::connect(url, NoTls).await.unwrap();
    tokio::spawn(async move {
        let _ = conn.await;
    });
    c
}

struct Db {
    admin: Client,
    owner: Client,
    url: String,
    name: String,
}

async fn db() -> Db {
    let base = std::env::var("KUBCODE_TEST_DATABASE_URL").expect(NEEDS_DB);
    assert!(
        base.contains("127.0.0.1") || base.contains("localhost"),
        "local test database only"
    );
    let admin = connect(&base).await;
    let name = format!("kc_pub_{}_test", &Uuid::new_v4().simple().to_string()[..12]);
    admin
        .batch_execute(&format!("CREATE DATABASE {name}"))
        .await
        .unwrap();
    let url = format!("{}/{name}", base.rsplit_once('/').unwrap().0);
    let owner = connect(&url).await;
    // What lib/accounts/migrate.ts runs first. Roles are cluster-wide, so
    // parallel tests tolerate one another creating them.
    owner
        .batch_execute(
            "CREATE SCHEMA IF NOT EXISTS kubcode_accounts;
             CREATE TABLE IF NOT EXISTS kubcode_accounts.schema_migrations (
               version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
             DO $$ BEGIN CREATE ROLE kubcode_worker NOLOGIN;
             EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
             DO $$ BEGIN CREATE ROLE kubcode_app NOLOGIN;
             EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;",
        )
        .await
        .unwrap();
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../db/migrations");
    let mut files: Vec<_> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|f| f.extension().is_some_and(|e| e == "sql"))
        .collect();
    files.sort();
    for f in &files {
        owner
            .batch_execute(&std::fs::read_to_string(f).unwrap())
            .await
            .unwrap();
    }
    Db {
        admin,
        owner,
        url,
        name,
    }
}

impl Db {
    async fn as_role(&self, role: &str) -> Client {
        let c = connect(&self.url).await;
        c.batch_execute(&format!("SET ROLE {role}")).await.unwrap();
        c
    }

    async fn worker(&self) -> Store {
        Store::new(self.as_role("kubcode_worker").await)
    }

    async fn user(&self) -> Uuid {
        self.owner
            .query_one(
                "INSERT INTO kubcode_accounts.users DEFAULT VALUES RETURNING id",
                &[],
            )
            .await
            .unwrap()
            .get(0)
    }

    async fn drop(self) {
        drop(self.owner);
        self.admin
            .batch_execute(&format!(
                "DROP DATABASE IF EXISTS {} WITH (FORCE)",
                self.name
            ))
            .await
            .unwrap();
    }
}

fn hash(s: &str) -> [u8; 32] {
    Sha256::digest(s.as_bytes()).into()
}

fn intent(ws: WorkspaceId, user: Uuid, state: &str) -> NewIntent {
    NewIntent {
        workspace: ws,
        user,
        platform: Platform::YouTube,
        provider: ProviderKind::Zernio,
        state_hash: hash(state),
        cookie_hash: hash("cookie"),
        session_binding_hash: hash("session"),
        ttl: Duration::minutes(10),
    }
}

fn account(id: &str) -> ConnectedAccount {
    ConnectedAccount {
        account: ProviderRef(id.into()),
        platform: Platform::YouTube,
        display_name: "โลกอีกแบบ".into(),
        handle: Some("lokeekbaeb".into()),
        platform_account_id: None,
    }
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn workspaces_profiles_and_routes() {
    let db = db().await;
    let s = db.worker().await;
    let (u1, u2) = (db.user().await, db.user().await);
    let w1 = s.owner_workspace(u1).await.unwrap();
    assert_eq!(s.owner_workspace(u1).await.unwrap(), w1, "one per creator");
    assert_ne!(s.owner_workspace(u2).await.unwrap(), w1);

    assert_eq!(s.profile(w1, ProviderKind::Zernio).await.unwrap(), None);
    s.save_profile(w1, ProviderKind::Zernio, &ProviderRef("p1".into()))
        .await
        .unwrap();
    s.save_profile(w1, ProviderKind::Zernio, &ProviderRef("p1".into()))
        .await
        .unwrap();
    assert_eq!(
        s.profile(w1, ProviderKind::Zernio).await.unwrap(),
        Some(ProviderRef("p1".into()))
    );

    let routes = s.routes().await.unwrap();
    let r = routes
        .get(
            Platform::YouTube,
            kubcode_publishing::domain::Capability::Publish,
        )
        .unwrap();
    assert_eq!(r.provider, ProviderKind::Zernio);
    assert!(!r.allow_fallback);
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn a_connect_intent_is_single_use_and_short_lived() {
    let db = db().await;
    let s = db.worker().await;
    let u = db.user().await;
    let ws = s.owner_workspace(u).await.unwrap();

    s.open_intent(&intent(ws, u, "a")).await.unwrap();
    let taken = s.take_intent(&hash("a")).await.unwrap();
    assert_eq!(taken.workspace, ws);
    assert_eq!(taken.platform, Platform::YouTube);
    assert!(matches!(
        s.take_intent(&hash("a")).await,
        Err(StoreError::IntentInvalid)
    ));

    s.open_intent(&intent(ws, u, "b")).await.unwrap();
    s.open_intent(&intent(ws, u, "c")).await.unwrap();
    assert!(
        matches!(
            s.take_intent(&hash("b")).await,
            Err(StoreError::IntentInvalid)
        ),
        "a newer click expires the older one"
    );

    let mut old = intent(ws, u, "d");
    old.ttl = Duration::seconds(-1);
    s.open_intent(&old).await.unwrap();
    assert!(matches!(
        s.take_intent(&hash("d")).await,
        Err(StoreError::IntentInvalid)
    ));
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn attaching_connections() {
    let db = db().await;
    let mut s = db.worker().await;
    let u = db.user().await;
    let ws = s.owner_workspace(u).await.unwrap();
    s.open_intent(&intent(ws, u, "x")).await.unwrap();
    let i = s.take_intent(&hash("x")).await.unwrap();

    let ch = s.attach_connection(&i, &account("acct-1")).await.unwrap();
    let again = s.attach_connection(&i, &account("acct-1")).await.unwrap();
    assert_eq!(ch, again, "reconnecting the same account keeps the channel");
    let other = s.attach_connection(&i, &account("acct-2")).await.unwrap();
    assert_ne!(other, ch);

    let conns = s.connections(ch).await.unwrap();
    assert_eq!(conns.len(), 1);
    assert_eq!(conns[0].provider, ProviderKind::Zernio);
    assert_eq!(conns[0].provider_ref, ProviderRef("acct-1".into()));
    assert_eq!(conns[0].status, ConnectionStatus::Active);

    s.revoke_connection(conns[0].id).await.unwrap();
    assert_eq!(
        s.connections(ch).await.unwrap()[0].status,
        ConnectionStatus::Revoked
    );
    let back = s.attach_connection(&i, &account("acct-1")).await.unwrap();
    assert_eq!(
        back, ch,
        "a revoked account that comes back reuses its channel"
    );
    assert_eq!(
        s.connections(ch).await.unwrap()[0].status,
        ConnectionStatus::Active
    );

    let audit: i64 = db
        .owner
        .query_one(
            "SELECT count(*) FROM kubcode_accounts.publishing_audit_events WHERE event = 'channel_connected'",
            &[],
        )
        .await
        .unwrap()
        .get(0);
    assert!(audit >= 3);
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn the_web_role_sees_only_its_workspace_and_never_provider_refs() {
    let db = db().await;
    let mut s = db.worker().await;
    let (mine, theirs) = (db.user().await, db.user().await);
    for u in [mine, theirs] {
        let ws = s.owner_workspace(u).await.unwrap();
        let state = u.to_string();
        s.open_intent(&intent(ws, u, &state)).await.unwrap();
        let i = s.take_intent(&hash(&state)).await.unwrap();
        s.attach_connection(&i, &account(&format!("acct-{u}")))
            .await
            .unwrap();
    }
    let web = db.as_role("kubcode_app").await;
    // set_config(…, true) is transaction-scoped, as the web app uses it.
    web.batch_execute("BEGIN").await.unwrap();
    web.execute(
        "SELECT set_config('kubcode.user_id', $1, true)",
        &[&mine.to_string()],
    )
    .await
    .unwrap();
    let n: i64 = web
        .query_one("SELECT count(*) FROM kubcode_accounts.channels", &[])
        .await
        .unwrap()
        .get(0);
    assert_eq!(n, 1, "only the member's own channel");
    let denied = web
        .query(
            "SELECT provider_ref FROM kubcode_accounts.channel_connections",
            &[],
        )
        .await;
    assert!(denied.is_err(), "provider ids never reach the web role");
    db.drop().await;
}

async fn delivery_fixture(
    db: &Db,
    s: &mut Store,
) -> (uuid::Uuid, kubcode_publishing::domain::DeliveryId) {
    let u = db.user().await;
    let ws = s.owner_workspace(u).await.unwrap();
    s.open_intent(&intent(ws, u, "p")).await.unwrap();
    let i = s.take_intent(&hash("p")).await.unwrap();
    let ch = s.attach_connection(&i, &account("acct-p")).await.unwrap();
    let conn = s.connections(ch).await.unwrap()[0].id;
    let asset = |kind: MediaKind, ct: &str, ext: &str| NewAsset {
        workspace: ws,
        clip_ref: "2026-11-08_deep-sea-docs_ep01_giant-squid".into(),
        kind,
        s3_key: format!(
            "clips/{}/2026-11-08_deep-sea-docs_ep01_giant-squid/{}.{ext}",
            ws.0,
            "ab".repeat(32)
        ),
        sha256: hash(ext),
        meta: MediaMeta {
            content_type: ct.into(),
            bytes: 1000,
            width: 1080,
            height: 1920,
            seconds: (kind == MediaKind::Video).then_some(58.93),
        },
    };
    let video = s
        .register_asset(&asset(MediaKind::Video, "video/mp4", "mp4"))
        .await
        .unwrap();
    assert_eq!(
        s.register_asset(&asset(MediaKind::Video, "video/mp4", "mp4"))
            .await
            .unwrap(),
        video,
        "the same file registers once"
    );
    let cover = s
        .register_asset(&asset(MediaKind::Cover, "image/png", "png"))
        .await
        .unwrap();
    let post = s
        .create_post(&NewPost {
            workspace: ws,
            clip_ref: "2026-11-08_deep-sea-docs_ep01_giant-squid".into(),
            video,
            cover: Some(cover),
            title: "หมึกยักษ์".into(),
            description: "คำอธิบาย".into(),
            tags: vec!["deep sea".into()],
        })
        .await
        .unwrap();
    s.confirm_post(post, &hash("summary"), u).await.unwrap();
    let d = s
        .create_delivery(&NewDelivery {
            post,
            channel: ch,
            connection: conn,
            provider: ProviderKind::Zernio,
            platform: Platform::YouTube,
            publish_at: OffsetDateTime::now_utc() + Duration::hours(2),
            visibility: Visibility::Private,
            idempotency_key: Uuid::new_v4(),
        })
        .await
        .unwrap();
    (ch.0, d)
}

fn delivery(event_id: &str, body: &str) -> VerifiedDelivery {
    VerifiedDelivery {
        event_id: event_id.into(),
        body_sha256: hash(body),
        event_type: "post.platform.published".into(),
        body: serde_json::Value::Null,
    }
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn posts_deliveries_velocity_and_webhooks() {
    let db = db().await;
    let mut s = db.worker().await;
    let (channel, d) = delivery_fixture(&db, &mut s).await;
    let at = OffsetDateTime::now_utc() + Duration::hours(2);
    assert_eq!(
        s.velocity(kubcode_publishing::domain::ChannelId(channel), at)
            .await
            .unwrap()
            .same_hour,
        0,
        "pending deliveries do not count yet"
    );

    assert!(s
        .mark_scheduled(d, &ProviderRef("post-1".into()))
        .await
        .unwrap());
    assert_eq!(
        s.velocity(kubcode_publishing::domain::ChannelId(channel), at)
            .await
            .unwrap()
            .same_day,
        1
    );
    assert_eq!(
        s.delivery_status(d).await.unwrap(),
        DeliveryStatus::Scheduled
    );

    let published = ProviderEvent::PostPublished {
        post: ProviderRef("post-1".into()),
        platform_post_id: Some("y7AAfV8ABIo".into()),
        url: Some("https://www.youtube.com/watch?v=y7AAfV8ABIo".into()),
        at: None,
    };
    let out = s
        .apply_event(
            ProviderKind::Zernio,
            &delivery("evt_1", "a"),
            std::slice::from_ref(&published),
        )
        .await
        .unwrap();
    assert_eq!(out, ApplyOutcome::Applied);
    assert_eq!(
        s.delivery_status(d).await.unwrap(),
        DeliveryStatus::Published
    );
    let r = s.receipt(d).await.unwrap().unwrap();
    assert_eq!(r.platform_post_id.as_deref(), Some("y7AAfV8ABIo"));
    assert_eq!(r.cover_check, "pending");

    assert_eq!(
        s.apply_event(ProviderKind::Zernio, &delivery("evt_1", "a"), &[published])
            .await
            .unwrap(),
        ApplyOutcome::Duplicate
    );
    let failed = ProviderEvent::PostFailed {
        post: ProviderRef("post-1".into()),
        code: ErrorCode::new("platform_user_content").unwrap(),
    };
    assert_eq!(
        s.apply_event(
            ProviderKind::Zernio,
            &delivery("evt_1", "b"),
            std::slice::from_ref(&failed)
        )
        .await
        .unwrap(),
        ApplyOutcome::IdReuse,
        "same id, different body: recorded oddity, nothing applied"
    );
    s.apply_event(ProviderKind::Zernio, &delivery("evt_2", "c"), &[failed])
        .await
        .unwrap();
    assert_eq!(
        s.delivery_status(d).await.unwrap(),
        DeliveryStatus::Published,
        "a late failure never undoes a publish"
    );

    let lost = ProviderEvent::AccountLost {
        account: ProviderRef("acct-p".into()),
        code: ErrorCode::new("account_lost").unwrap(),
    };
    s.apply_event(ProviderKind::Zernio, &delivery("evt_3", "d"), &[lost])
        .await
        .unwrap();
    let conns = s
        .connections(kubcode_publishing::domain::ChannelId(channel))
        .await
        .unwrap();
    assert_eq!(conns[0].status, ConnectionStatus::NeedsReconnect);

    let unknown = ProviderEvent::PostPublished {
        post: ProviderRef("someone-elses-post".into()),
        platform_post_id: None,
        url: None,
        at: None,
    };
    assert_eq!(
        s.apply_event(ProviderKind::Zernio, &delivery("evt_4", "e"), &[unknown])
            .await
            .unwrap(),
        ApplyOutcome::Applied,
        "unknown refs are recorded and ignored"
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn the_shared_rate_limiter() {
    let db = db().await;
    let s = db.worker().await;
    let w = Duration::minutes(1);
    assert!(s.rate_acquire("zernio:api", 2, w).await.unwrap());
    assert!(s.rate_acquire("zernio:api", 2, w).await.unwrap());
    assert!(!s.rate_acquire("zernio:api", 2, w).await.unwrap());
    assert!(
        s.rate_acquire("zernio:other", 2, w).await.unwrap(),
        "keys are independent"
    );
    let other = db.worker().await;
    assert!(
        !other.rate_acquire("zernio:api", 2, w).await.unwrap(),
        "shared across connections (Lambda instances)"
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn a_request_nonce_is_used_once() {
    let db = db().await;
    let s = db.worker().await;
    assert!(s.use_nonce(&hash("n1")).await.unwrap());
    assert!(!s.use_nonce(&hash("n1")).await.unwrap());
    assert!(s.use_nonce(&hash("n2")).await.unwrap());
    db.drop().await;
}
