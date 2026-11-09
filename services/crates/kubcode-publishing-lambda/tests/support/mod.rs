//! A throwaway Postgres with every migration applied (same setup as the
//! store's tests) and a service wired to the in-memory fake provider.
#![allow(dead_code)]

use std::sync::Arc;

use async_trait::async_trait;
use kubcode_publishing::config::PublishingConfig;
use kubcode_publishing::domain::MediaMeta;
use kubcode_publishing::fake::{FakeMedia, FakeProvider};
use kubcode_publishing::ports::MediaSource;
use kubcode_publishing_store::Store;
use publishing_lambda::service::{MediaOpener, ProviderSet, Registry};
use tokio_postgres::{Client, NoTls};
use uuid::Uuid;

pub const NEEDS_DB: &str = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored";

pub async fn connect(url: &str) -> Client {
    let (c, conn) = tokio_postgres::connect(url, NoTls).await.unwrap();
    tokio::spawn(async move {
        let _ = conn.await;
    });
    c
}

pub struct Db {
    pub admin: Client,
    pub owner: Client,
    pub url: String,
    pub name: String,
}

pub async fn db() -> Db {
    let base = std::env::var("KUBCODE_TEST_DATABASE_URL").expect(NEEDS_DB);
    assert!(
        base.contains("127.0.0.1") || base.contains("localhost"),
        "local test database only"
    );
    let admin = connect(&base).await;
    let name = format!("kc_lam_{}_test", &Uuid::new_v4().simple().to_string()[..12]);
    admin
        .batch_execute(&format!("CREATE DATABASE {name}"))
        .await
        .unwrap();
    let url = format!("{}/{name}", base.rsplit_once('/').unwrap().0);
    let owner = connect(&url).await;
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
    pub async fn store(&self) -> Store {
        let c = connect(&self.url).await;
        c.batch_execute("SET ROLE kubcode_worker").await.unwrap();
        Store::new(c)
    }

    pub async fn user(&self, owner: bool) -> Uuid {
        self.owner
            .query_one(
                "INSERT INTO kubcode_accounts.users (is_owner) VALUES ($1) RETURNING id",
                &[&owner],
            )
            .await
            .unwrap()
            .get(0)
    }

    pub async fn drop(self) {
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

/// Every asset opens as the fake's small video/cover.
pub struct FakeOpener;

#[async_trait]
impl MediaOpener for FakeOpener {
    fn open(
        &self,
        _video_key: &str,
        _video: &MediaMeta,
        _cover: Option<(&str, &MediaMeta)>,
    ) -> Box<dyn MediaSource> {
        Box::new(FakeMedia)
    }
}

pub fn registry(fake: &Arc<FakeProvider>) -> Registry {
    Registry {
        zernio: Some(ProviderSet {
            connect: fake.clone(),
            publisher: fake.clone(),
            events: fake.clone(),
        }),
    }
}

pub fn cfg() -> PublishingConfig {
    PublishingConfig::default()
}
