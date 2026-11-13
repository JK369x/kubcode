//! Real-PostgreSQL tests for the exchange and revoke flows, run as the DB role
//! `kubcode_worker` against every repo migration, with fake providers and the
//! TEST-ONLY RSA key standing in for KMS.
//!
//! Needs a local throwaway Postgres:
//!   KUBCODE_TEST_DATABASE_URL=postgres://postgres:…@127.0.0.1:55432/kubcode_local_test \
//!     cargo test -p kubcode-oauth-connect -- --ignored
//! The suite creates and drops its own `kc_rs_<random>_test` database.

use std::sync::Mutex;

use kubcode_envelope::{open, seal, LocalRsaUnwrapper, SecretContext, WrapPublicKey};
use oauth_connect::flow::{self, Deps, Exchange, Revoke};
use oauth_connect::providers::{Account, Connected, OAuthClient, ProviderError, Providers};
use sha2::{Digest, Sha256};
use tokio_postgres::{Client, NoTls};
use uuid::Uuid;
use zeroize::Zeroizing;

const PUB: &str = include_str!("../../../../tests/fixtures/envelope/test-only-wrap-key.pub.pem");
const PRIV: &str = include_str!("../../../../tests/fixtures/envelope/test-only-wrap-key.pem");
const NEEDS_DB: &str = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored";

#[derive(Default)]
struct FakeProviders {
    seen: Mutex<Vec<String>>,
    fail: Option<&'static str>,
    revoke_fails: bool,
}

impl Providers for FakeProviders {
    async fn connect_youtube(
        &self,
        client: &OAuthClient,
        code: &str,
        verifier: &str,
    ) -> Result<Connected, ProviderError> {
        self.seen.lock().unwrap().push(format!(
            "youtube {} {} {code} {verifier}",
            client.client_id,
            client.client_secret.as_str()
        ));
        if let Some(code) = self.fail {
            return Err(ProviderError(code));
        }
        Ok(Connected {
            account: Account {
                external_id: "UC-fixture".into(),
                label: "STORY GRID".into(),
            },
            stored: Zeroizing::new(r#"{"refresh_token":"1//fixture-refresh"}"#.into()),
            expires_in: None,
            scopes: vec!["https://www.googleapis.com/auth/youtube.upload".into()],
        })
    }

    async fn connect_instagram(
        &self,
        client: &OAuthClient,
        code: &str,
    ) -> Result<Connected, ProviderError> {
        self.seen.lock().unwrap().push(format!(
            "instagram {} {} {code}",
            client.client_id,
            client.client_secret.as_str()
        ));
        Ok(Connected {
            account: Account {
                external_id: "17841400000000000".into(),
                label: "@story.grids".into(),
            },
            stored: Zeroizing::new(r#"{"access_token":"IGL-fixture"}"#.into()),
            expires_in: Some(5_184_000),
            scopes: vec!["instagram_business_basic".into()],
        })
    }

    async fn revoke_google(&self, refresh_token: &str) -> Result<(), ProviderError> {
        self.seen
            .lock()
            .unwrap()
            .push(format!("revoke {refresh_token}"));
        if self.revoke_fails {
            Err(ProviderError("revoke_failed"))
        } else {
            Ok(())
        }
    }
}

struct Db {
    admin: Client,
    owner: Client,
    worker: Client,
    name: String,
}

async fn connect(url: &str) -> Client {
    let (c, conn) = tokio_postgres::connect(url, NoTls).await.expect("connect");
    tokio::spawn(async move {
        let _ = conn.await;
    });
    c
}

/// A throwaway database with every migration in db/migrations applied.
async fn db() -> Db {
    let base = std::env::var("KUBCODE_TEST_DATABASE_URL").expect(NEEDS_DB);
    assert!(
        base.contains("127.0.0.1") || base.contains("localhost"),
        "local test database only"
    );
    let admin = connect(&base).await;
    let name = format!("kc_rs_{}_test", &Uuid::new_v4().simple().to_string()[..12]);
    admin
        .batch_execute(&format!("CREATE DATABASE {name}"))
        .await
        .unwrap();
    let own_url = format!("{}/{name}", base.rsplit_once('/').unwrap().0);
    let owner = connect(&own_url).await;
    // What lib/accounts/migrate.ts runs before the migrations. Roles are
    // cluster-wide, so parallel tests tolerate one another creating it.
    owner
        .batch_execute(
            "CREATE SCHEMA IF NOT EXISTS kubcode_accounts;
             CREATE TABLE IF NOT EXISTS kubcode_accounts.schema_migrations (
               version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
             DO $$ BEGIN CREATE ROLE kubcode_worker NOLOGIN;
             EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
             DO $$ BEGIN CREATE ROLE kubcode_billing NOLOGIN;
             EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;",
        )
        .await
        .unwrap();
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../db/migrations");
    let mut files: Vec<_> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    files.sort();
    for f in files
        .iter()
        .filter(|f| f.extension().is_some_and(|e| e == "sql"))
    {
        owner
            .batch_execute(&std::fs::read_to_string(f).unwrap())
            .await
            .unwrap();
    }
    let worker = connect(&own_url).await;
    worker
        .batch_execute("SET ROLE kubcode_worker")
        .await
        .unwrap();
    Db {
        admin,
        owner,
        worker,
        name,
    }
}

impl Db {
    async fn drop(self) {
        drop(self.worker);
        drop(self.owner);
        self.admin
            .batch_execute(&format!(
                "DROP DATABASE IF EXISTS {} WITH (FORCE)",
                self.name
            ))
            .await
            .unwrap();
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

    /// An intent the web host has already moved to `exchanging`.
    async fn intent(
        &self,
        key: &WrapPublicKey,
        user: Uuid,
        provider: &str,
        app_source: &str,
        state: &str,
        verifier: Option<&str>,
    ) -> Uuid {
        let id = Uuid::new_v4();
        let envelope = verifier.map(|v| {
            let c = SecretContext::new(
                "oauth_connect_intents",
                &id.to_string(),
                &user.to_string(),
                provider,
                1,
            )
            .unwrap();
            seal(&c, v.as_bytes(), key).unwrap()
        });
        let slot: Option<i16> = envelope.as_ref().map(|_| 1);
        self.owner
            .execute(
                "INSERT INTO kubcode_accounts.oauth_connect_intents
                   (id, user_id, provider, state_hash, cookie_hash, session_binding_hash, verifier_envelope, key_slot,
                    phase, app_source, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $5, $6, $7, 'exchanging', $8, now() + interval '10 minutes')",
                &[&id, &user, &provider, &Sha256::digest(state.as_bytes()).to_vec(), &vec![0u8; 32], &envelope, &slot, &app_source],
            )
            .await
            .unwrap();
        id
    }

    async fn member_secret(
        &self,
        key: &WrapPublicKey,
        user: Uuid,
        kind: &str,
        public: &str,
        json: &str,
    ) {
        let id = Uuid::new_v4();
        let c = SecretContext::new("user_secrets", &id.to_string(), &user.to_string(), kind, 1)
            .unwrap();
        let envelope = seal(&c, json.as_bytes(), key).unwrap();
        self.owner
            .execute(
                "INSERT INTO kubcode_accounts.user_secrets (id, user_id, kind, public_value, envelope, key_slot, hint)
                 VALUES ($1, $2, $3, $4, $5, 1, 'abcd')",
                &[&id, &user, &kind, &public, &envelope],
            )
            .await
            .unwrap();
    }

    async fn events(&self, user: Uuid) -> Vec<(String, String)> {
        self.owner
            .query("SELECT event, actor FROM kubcode_accounts.secret_audit_events WHERE user_id = $1 ORDER BY id", &[&user])
            .await
            .unwrap()
            .iter()
            .map(|r| (r.get(0), r.get(1)))
            .collect()
    }
}

fn keys() -> (WrapPublicKey, LocalRsaUnwrapper) {
    (
        WrapPublicKey::from_spki_pem(1, PUB).unwrap(),
        LocalRsaUnwrapper::from_pkcs8_pem(1, PRIV).unwrap(),
    )
}

fn shared() -> OAuthClient {
    OAuthClient {
        client_id: "111111111111-kubcodesharedapp.apps.googleusercontent.com".into(),
        client_secret: Zeroizing::new("FIXTURE-ONLY-shared-secret".into()),
    }
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn youtube_through_kubcode_app_seals_the_refresh_token_and_closes_the_intent() {
    let db = db().await;
    let (key, unwrapper) = keys();
    let providers = FakeProviders::default();
    let client = shared();
    let deps = Deps {
        unwrapper: &unwrapper,
        providers: &providers,
        wrap_key: &key,
        kubcode_google: Some(&client),
    };
    let user = db.user().await;
    let intent = db
        .intent(
            &key,
            user,
            "youtube",
            "kubcode",
            "STATE-1",
            Some("VERIFIER-1"),
        )
        .await;

    let out = flow::exchange(&db.worker, &deps, "STATE-1", "CODE-1")
        .await
        .unwrap();
    assert_eq!(
        out,
        Exchange::Connected {
            label: "STORY GRID".into()
        }
    );
    assert_eq!(
        *providers.seen.lock().unwrap(),
        ["youtube 111111111111-kubcodesharedapp.apps.googleusercontent.com FIXTURE-ONLY-shared-secret CODE-1 VERIFIER-1"]
    );
    let row = db
        .owner
        .query_one(
            "SELECT id, envelope, version, app_source, app_secret_version, status, token_expires_at IS NULL, account_label
               FROM kubcode_accounts.oauth_connections WHERE user_id = $1",
            &[&user],
        )
        .await
        .unwrap();
    let id: Uuid = row.get(0);
    let c = SecretContext::new(
        "oauth_connections",
        &id.to_string(),
        &user.to_string(),
        "youtube",
        1,
    )
    .unwrap();
    let plain = open(row.get::<_, &[u8]>(1), &c, &unwrapper).await.unwrap();
    assert_eq!(
        std::str::from_utf8(&plain).unwrap(),
        r#"{"refresh_token":"1//fixture-refresh"}"#
    );
    assert_eq!(row.get::<_, i32>(2), 1);
    assert_eq!(row.get::<_, &str>(3), "kubcode");
    assert_eq!(row.get::<_, i32>(4), 1);
    assert_eq!(row.get::<_, &str>(5), "active");
    assert!(row.get::<_, bool>(6), "refresh tokens have no expiry");
    let intent_row = db
        .owner
        .query_one(
            "SELECT phase, status, verifier_envelope IS NULL FROM kubcode_accounts.oauth_connect_intents WHERE id = $1",
            &[&intent],
        )
        .await
        .unwrap();
    assert_eq!(
        (
            intent_row.get::<_, &str>(0),
            intent_row.get::<_, &str>(1),
            intent_row.get::<_, bool>(2)
        ),
        ("closed", "consumed", true)
    );
    assert_eq!(
        db.events(user).await,
        [("oauth_connected".to_string(), "lambda".to_string())]
    );
    // Single use: the same state cannot be exchanged again.
    assert_eq!(
        flow::exchange(&db.worker, &deps, "STATE-1", "CODE-1")
            .await
            .unwrap(),
        Exchange::Failed("intent_invalid")
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn instagram_through_the_members_own_app_and_reconnect_bumps_the_version() {
    let db = db().await;
    let (key, unwrapper) = keys();
    let providers = FakeProviders::default();
    let deps = Deps {
        unwrapper: &unwrapper,
        providers: &providers,
        wrap_key: &key,
        kubcode_google: None,
    };
    let user = db.user().await;
    db.member_secret(
        &key,
        user,
        "instagram_app",
        "1234567890123456",
        r#"{"app_secret":"FIXTURE-ONLY-ig-secret"}"#,
    )
    .await;
    db.intent(&key, user, "instagram", "member", "STATE-IG", None)
        .await;
    assert_eq!(
        flow::exchange(&db.worker, &deps, "STATE-IG", "CODE-IG")
            .await
            .unwrap(),
        Exchange::Connected {
            label: "@story.grids".into()
        }
    );
    assert_eq!(
        *providers.seen.lock().unwrap(),
        ["instagram 1234567890123456 FIXTURE-ONLY-ig-secret CODE-IG"]
    );
    db.intent(&key, user, "instagram", "member", "STATE-IG-2", None)
        .await;
    flow::exchange(&db.worker, &deps, "STATE-IG-2", "CODE-IG-2")
        .await
        .unwrap();
    let rows = db
        .owner
        .query(
            "SELECT id, envelope, version, app_source, token_expires_at > now() + interval '59 days'
               FROM kubcode_accounts.oauth_connections WHERE user_id = $1",
            &[&user],
        )
        .await
        .unwrap();
    assert_eq!(rows.len(), 1, "one row per (user, provider, account)");
    let r = &rows[0];
    assert_eq!(
        (r.get::<_, i32>(2), r.get::<_, &str>(3), r.get::<_, bool>(4)),
        (2, "member", true)
    );
    let id: Uuid = r.get(0);
    let v2 = SecretContext::new(
        "oauth_connections",
        &id.to_string(),
        &user.to_string(),
        "instagram",
        2,
    )
    .unwrap();
    assert!(open(r.get::<_, &[u8]>(1), &v2, &unwrapper).await.is_ok());
    let v1 = SecretContext::new(
        "oauth_connections",
        &id.to_string(),
        &user.to_string(),
        "instagram",
        1,
    )
    .unwrap();
    assert!(
        open(r.get::<_, &[u8]>(1), &v1, &unwrapper).await.is_err(),
        "old version AAD does not open it"
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn failures_keep_nothing_and_close_the_intent() {
    let db = db().await;
    let (key, unwrapper) = keys();
    let failing = FakeProviders {
        fail: Some("exchange_failed"),
        ..Default::default()
    };
    let client = shared();
    let deps = Deps {
        unwrapper: &unwrapper,
        providers: &failing,
        wrap_key: &key,
        kubcode_google: Some(&client),
    };
    let user = db.user().await;
    let intent = db
        .intent(&key, user, "youtube", "kubcode", "STATE-F", Some("V"))
        .await;
    assert_eq!(
        flow::exchange(&db.worker, &deps, "STATE-F", "C")
            .await
            .unwrap(),
        Exchange::Failed("exchange_failed")
    );
    let n: i64 = db
        .owner
        .query_one(
            "SELECT count(*) FROM kubcode_accounts.oauth_connections",
            &[],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(n, 0);
    let status: String = db
        .owner
        .query_one(
            "SELECT status FROM kubcode_accounts.oauth_connect_intents WHERE id = $1",
            &[&intent],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(status, "failed");
    assert_eq!(
        db.events(user).await,
        [("oauth_connect_failed".to_string(), "lambda".to_string())]
    );

    // kubcode's app chosen but its client is not configured in SSM.
    let ok = FakeProviders::default();
    let no_shared = Deps {
        unwrapper: &unwrapper,
        providers: &ok,
        wrap_key: &key,
        kubcode_google: None,
    };
    db.intent(
        &key,
        db.user().await,
        "youtube",
        "kubcode",
        "STATE-N",
        Some("V"),
    )
    .await;
    assert_eq!(
        flow::exchange(&db.worker, &no_shared, "STATE-N", "C")
            .await
            .unwrap(),
        Exchange::Failed("app_not_configured")
    );
    // The member's own app chosen but its credentials were deleted meanwhile.
    db.intent(
        &key,
        db.user().await,
        "youtube",
        "member",
        "STATE-M",
        Some("V"),
    )
    .await;
    assert_eq!(
        flow::exchange(&db.worker, &no_shared, "STATE-M", "C")
            .await
            .unwrap(),
        Exchange::Failed("app_not_configured")
    );
    // Unknown, still-awaiting-callback and expired intents never reach a provider.
    assert_eq!(
        flow::exchange(&db.worker, &no_shared, "NO-SUCH", "C")
            .await
            .unwrap(),
        Exchange::Failed("intent_invalid")
    );
    let waiting_user = db.user().await;
    let waiting = db
        .intent(
            &key,
            waiting_user,
            "youtube",
            "kubcode",
            "STATE-W",
            Some("V"),
        )
        .await;
    db.owner.execute("UPDATE kubcode_accounts.oauth_connect_intents SET phase = 'await_callback' WHERE id = $1", &[&waiting]).await.unwrap();
    assert_eq!(
        flow::exchange(&db.worker, &no_shared, "STATE-W", "C")
            .await
            .unwrap(),
        Exchange::Failed("intent_invalid")
    );
    let old_user = db.user().await;
    let old = db
        .intent(&key, old_user, "youtube", "kubcode", "STATE-O", Some("V"))
        .await;
    db.owner.execute("UPDATE kubcode_accounts.oauth_connect_intents SET expires_at = now() - interval '1 second' WHERE id = $1", &[&old]).await.unwrap();
    assert_eq!(
        flow::exchange(&db.worker, &no_shared, "STATE-O", "C")
            .await
            .unwrap(),
        Exchange::Failed("intent_invalid")
    );
    assert!(ok.seen.lock().unwrap().is_empty());
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn revoke_wipes_the_row_and_reports_whether_google_revoked() {
    let db = db().await;
    let (key, unwrapper) = keys();
    let providers = FakeProviders::default();
    let client = shared();
    let deps = Deps {
        unwrapper: &unwrapper,
        providers: &providers,
        wrap_key: &key,
        kubcode_google: Some(&client),
    };
    let user = db.user().await;
    db.intent(&key, user, "youtube", "kubcode", "STATE-R", Some("V"))
        .await;
    flow::exchange(&db.worker, &deps, "STATE-R", "C")
        .await
        .unwrap();
    let id: Uuid = db
        .owner
        .query_one(
            "SELECT id FROM kubcode_accounts.oauth_connections WHERE user_id = $1",
            &[&user],
        )
        .await
        .unwrap()
        .get(0);

    // Not marked revoking by the web host, or another member's id: nothing happens.
    assert_eq!(
        flow::revoke(&db.worker, &deps, id, user).await.unwrap(),
        Revoke::NotFound
    );
    db.owner
        .execute(
            "UPDATE kubcode_accounts.oauth_connections SET status = 'revoking' WHERE id = $1",
            &[&id],
        )
        .await
        .unwrap();
    assert_eq!(
        flow::revoke(&db.worker, &deps, id, Uuid::new_v4())
            .await
            .unwrap(),
        Revoke::NotFound
    );

    assert_eq!(
        flow::revoke(&db.worker, &deps, id, user).await.unwrap(),
        Revoke::Done { revoked: true }
    );
    assert!(providers
        .seen
        .lock()
        .unwrap()
        .contains(&"revoke 1//fixture-refresh".to_string()));
    let n: i64 = db
        .owner
        .query_one(
            "SELECT count(*) FROM kubcode_accounts.oauth_connections",
            &[],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(n, 0);

    // Google refuses: the row is still wiped, and the failure is audited.
    let refusing = FakeProviders {
        revoke_fails: true,
        ..Default::default()
    };
    let deps2 = Deps {
        unwrapper: &unwrapper,
        providers: &refusing,
        wrap_key: &key,
        kubcode_google: Some(&client),
    };
    db.intent(&key, user, "youtube", "kubcode", "STATE-R2", Some("V"))
        .await;
    flow::exchange(&db.worker, &deps2, "STATE-R2", "C")
        .await
        .unwrap();
    let id2: Uuid = db
        .owner
        .query_one(
            "SELECT id FROM kubcode_accounts.oauth_connections WHERE user_id = $1",
            &[&user],
        )
        .await
        .unwrap()
        .get(0);
    db.owner
        .execute(
            "UPDATE kubcode_accounts.oauth_connections SET status = 'revoking' WHERE id = $1",
            &[&id2],
        )
        .await
        .unwrap();
    assert_eq!(
        flow::revoke(&db.worker, &deps2, id2, user).await.unwrap(),
        Revoke::Done { revoked: false }
    );
    let tail: Vec<String> = db
        .events(user)
        .await
        .into_iter()
        .map(|e| e.0)
        .rev()
        .take(2)
        .collect();
    assert_eq!(tail, ["oauth_revoke_failed", "oauth_disconnected"]);
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn nonces_are_single_use_and_old_ones_are_pruned() {
    let db = db().await;
    let nonce = "00112233445566778899aabbccddeeff";
    assert!(flow::accept_nonce(&db.worker, nonce).await.unwrap());
    assert!(
        !flow::accept_nonce(&db.worker, nonce).await.unwrap(),
        "replay refused"
    );
    db.owner
        .execute("UPDATE kubcode_accounts.connect_request_nonces SET created_at = now() - interval '11 minutes'", &[])
        .await
        .unwrap();
    assert!(
        flow::accept_nonce(&db.worker, nonce).await.unwrap(),
        "pruned after 10 minutes"
    );
    db.drop().await;
}
