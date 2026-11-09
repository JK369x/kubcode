//! Local runner for the publishing Function URL (docs/dev/local-e2e.md).
//!
//! Serves the same `http::handle` as the Lambda on 127.0.0.1, against a
//! loopback PostgreSQL and the real Zernio API. Secrets live in this process
//! only: the Zernio key is the first line of stdin (pipe it from the vault),
//! everything else comes from env and is local-only.
//!
//!   KUBCODE_LOCAL_PORT           port to listen on (127.0.0.1)
//!   KUBCODE_LOCAL_WORKER_DB_URL  loopback postgres URL for kubcode_worker
//!   KUBCODE_LOCAL_HMAC_KEY       the key the local Next server signs with
//!
//! Publish mode (scripts/local-e2e/publish.ts) adds:
//!   KUBCODE_LOCAL_OPS_KEY        hex; enables POST /ops (the CLI's ops function)
//!   KUBCODE_LOCAL_MEDIA_DIR      stands in for the media bucket (`clips/...` keys)
//!   KUBCODE_LOCAL_PROTECT_ACCOUNTS=1  refuses connect, complete and disconnect,
//!       so a real account seeded from production is never changed or deleted
//!
//! Run: secret.sh get zernio-api-key | cargo run --example publishing_local

use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use kubcode_publishing::config::PublishingConfig;
use kubcode_publishing::domain::{MediaKind, MediaMeta, Platform, ProviderKind, ProviderRef};
use kubcode_publishing::errors::{ErrorClass, PublishError};
use kubcode_publishing::ports::{
    CallbackParams, ConnectProvider, ConnectStart, ConnectedAccount, ConnectionHealth,
    ConnectionRef, MediaBody, MediaSource, WorkspaceCtx,
};
use kubcode_publishing_store::Store;
use kubcode_publishing_zernio::events::ZernioEvents;
use kubcode_publishing_zernio::limiter::Limiter;
use kubcode_publishing_zernio::transport::ReqwestTransport;
use kubcode_publishing_zernio::{Zernio, ZernioConfig, PRODUCTION_BASE};
use publishing_lambda::runtime::{
    secrets_from, Secrets, PARAM_HMAC_KEY, PARAM_WORKER_DB_URL, PARAM_ZERNIO_KEY,
};
use publishing_lambda::service::{MediaOpener, ProviderSet, Registry, Service};
use publishing_lambda::{http, ops};
use serde_json::json;
use std::path::PathBuf;
use tokio::net::TcpListener;
use zeroize::Zeroizing;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} is required"))
}

fn loopback(url: &str) -> bool {
    url.contains("@127.0.0.1:") || url.contains("@localhost:")
}

/// The Lambda's shared Postgres limiter (same `rate_acquire`), over the
/// loopback connection the local database allows (no TLS).
struct LocalLimiter {
    url: Zeroizing<String>,
    per_minute: u32,
}

#[async_trait]
impl Limiter for LocalLimiter {
    async fn acquire(&self) -> Result<(), PublishError> {
        let unavailable = || PublishError::new(ErrorClass::Temporary, "limiter_unavailable");
        let (client, conn) = tokio_postgres::connect(&self.url, tokio_postgres::NoTls)
            .await
            .map_err(|_| unavailable())?;
        tokio::spawn(conn);
        match Store::new(client)
            .rate_acquire("zernio:api", self.per_minute, time::Duration::minutes(1))
            .await
        {
            Ok(true) => Ok(()),
            Ok(false) => Err(PublishError::new(
                ErrorClass::RateLimited {
                    retry_after_secs: 60,
                },
                "client_rate_limited",
            )),
            Err(_) => Err(unavailable()),
        }
    }
}

/// Publish mode: the account is real and belongs to production. Nothing here
/// may connect, complete or disconnect; health checks pass through.
struct Protected(Arc<dyn ConnectProvider>);

fn protected() -> PublishError {
    PublishError::new(ErrorClass::Rejected, "protected_account")
}

#[async_trait]
impl ConnectProvider for Protected {
    fn kind(&self) -> ProviderKind {
        self.0.kind()
    }
    async fn start(
        &self,
        _ws: &WorkspaceCtx,
        _platform: Platform,
        _callback_url: &str,
    ) -> Result<ConnectStart, PublishError> {
        Err(protected())
    }
    async fn complete(
        &self,
        _profile: &ProviderRef,
        _platform: Platform,
        _cb: &CallbackParams,
    ) -> Result<ConnectedAccount, PublishError> {
        Err(protected())
    }
    async fn disconnect(&self, _conn: &ConnectionRef) -> Result<(), PublishError> {
        Err(protected())
    }
    async fn health(&self, profile: &ProviderRef) -> Result<Vec<ConnectionHealth>, PublishError> {
        self.0.health(profile).await
    }
}

/// Stands in for the media bucket: `<dir>/<key>` for keys the service wrote.
struct LocalOpener {
    dir: Option<PathBuf>,
}

/// The same shape the S3 opener accepts (`clips/...`, no `..`).
fn key_ok(key: &str) -> bool {
    key.starts_with("clips/")
        && !key.contains("..")
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/._-".contains(&b))
}

struct LocalMedia {
    dir: Option<PathBuf>,
    video: (String, MediaMeta),
    cover: Option<(String, MediaMeta)>,
}

impl MediaOpener for LocalOpener {
    fn open(
        &self,
        video_key: &str,
        video: &MediaMeta,
        cover: Option<(&str, &MediaMeta)>,
    ) -> Box<dyn MediaSource> {
        Box::new(LocalMedia {
            dir: self.dir.clone(),
            video: (video_key.to_owned(), video.clone()),
            cover: cover.map(|(k, m)| (k.to_owned(), m.clone())),
        })
    }
}

#[async_trait]
impl MediaSource for LocalMedia {
    async fn open(&self, kind: MediaKind) -> Result<MediaBody, PublishError> {
        let (key, meta) = match kind {
            MediaKind::Video => &self.video,
            MediaKind::Cover => self
                .cover
                .as_ref()
                .ok_or_else(|| PublishError::new(ErrorClass::Rejected, "cover_missing"))?,
        };
        let dir = self
            .dir
            .as_ref()
            .ok_or_else(|| PublishError::new(ErrorClass::Temporary, "no_local_media_dir"))?;
        if !key_ok(key) {
            return Err(PublishError::new(ErrorClass::Bug, "bad_media_key"));
        }
        let bytes = tokio::fs::read(dir.join(key))
            .await
            .map_err(|_| PublishError::new(ErrorClass::Rejected, "media_missing"))?;
        let filename = key.rsplit('/').next().unwrap_or("media").to_owned();
        let body = futures::stream::once(async move { Ok(Bytes::from(bytes)) });
        Ok(MediaBody {
            meta: meta.clone(),
            filename,
            body: Box::pin(body),
        })
    }
}

struct Local {
    secrets: Secrets,
    registry: Registry,
    cfg: PublishingConfig,
    opener: LocalOpener,
    ops_key: Option<Zeroizing<Vec<u8>>>,
}

async fn handle(
    local: Arc<Local>,
    req: Request<Incoming>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let (parts, body) = req.into_parts();
    let reply = |status: u16, body: String| {
        let r = Response::builder()
            .status(status)
            .header("content-type", "application/json")
            .body(Full::new(Bytes::from(body)))
            .expect("static response");
        Ok(r)
    };
    let Ok(body) = Limited::new(body, http::MAX_WEBHOOK_BODY + 1)
        .collect()
        .await
    else {
        return reply(413, json!({"ok": false, "code": "too_large"}).to_string());
    };
    let body = body.to_bytes();
    let Ok((client, conn)) =
        tokio_postgres::connect(&local.secrets.db_url, tokio_postgres::NoTls).await
    else {
        return reply(503, json!({"ok": false, "code": "unavailable"}).to_string());
    };
    tokio::spawn(conn);
    let mut store = Store::new(client);
    let mut svc = Service {
        store: &mut store,
        reg: &local.registry,
        cfg: &local.cfg,
        media: &local.opener,
        now: time::OffsetDateTime::now_utc(),
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if parts.uri.path() == "/ops" {
        // The CLI's ops function (IAM invoke in production; loopback here).
        if parts.method != hyper::Method::POST {
            return reply(
                405,
                json!({"ok": false, "code": "method_not_allowed"}).to_string(),
            );
        }
        let Ok(event) = serde_json::from_slice(&body) else {
            return reply(400, json!({"ok": false, "code": "bad_request"}).to_string());
        };
        let key = local.ops_key.as_ref().map(|k| k.as_slice());
        let answer = ops::run_signed(&mut svc, key, event, "local-media", now).await;
        return reply(200, answer.to_string());
    }
    let r = http::handle(
        &mut svc,
        &local.secrets.hmac_key,
        parts.method.as_str(),
        parts.uri.path(),
        &parts.headers,
        &body,
        now,
    )
    .await;
    reply(r.status, r.body.to_string())
}

#[tokio::main]
async fn main() {
    let port: u16 = env("KUBCODE_LOCAL_PORT")
        .parse()
        .expect("KUBCODE_LOCAL_PORT");
    let db_url = env("KUBCODE_LOCAL_WORKER_DB_URL");
    assert!(
        loopback(&db_url),
        "local runner only talks to a loopback database"
    );

    let mut key = String::new();
    std::io::stdin().read_line(&mut key).expect("stdin");
    let mut found: HashMap<String, Zeroizing<String>> = HashMap::new();
    found.insert(PARAM_WORKER_DB_URL.into(), Zeroizing::new(db_url));
    found.insert(
        PARAM_HMAC_KEY.into(),
        Zeroizing::new(env("KUBCODE_LOCAL_HMAC_KEY")),
    );
    found.insert(
        PARAM_ZERNIO_KEY.into(),
        Zeroizing::new(key.trim().to_owned()),
    );
    key.clear();
    let secrets = secrets_from(found).expect("local secrets");
    let zernio_key = secrets
        .zernio_key
        .as_ref()
        .expect("stdin must carry the Zernio key (sk_ or zrk_)")
        .to_string();

    let cfg = PublishingConfig::from_env().expect("publishing config");
    let base = std::env::var("KUBCODE_ZERNIO_BASE").unwrap_or_else(|_| PRODUCTION_BASE.into());
    let z = Arc::new(Zernio::new(
        ZernioConfig {
            base_url: base,
            api_key: zernio_key,
        },
        Arc::new(ReqwestTransport::new(Duration::from_secs(240))),
        Arc::new(LocalLimiter {
            url: secrets.db_url.clone(),
            per_minute: cfg.api_per_minute,
        }),
    ));
    let protect = std::env::var("KUBCODE_LOCAL_PROTECT_ACCOUNTS").as_deref() == Ok("1");
    let connect: Arc<dyn ConnectProvider> = if protect {
        Arc::new(Protected(z.clone()))
    } else {
        z.clone()
    };
    let registry = Registry {
        zernio: Some(ProviderSet {
            connect,
            publisher: z,
            // Webhooks are not part of the local loop: nothing verifies.
            events: Arc::new(ZernioEvents::new(Vec::new())),
        }),
    };
    let opener = LocalOpener {
        dir: std::env::var_os("KUBCODE_LOCAL_MEDIA_DIR").map(PathBuf::from),
    };
    let ops_key = std::env::var("KUBCODE_LOCAL_OPS_KEY")
        .ok()
        .map(|h| Zeroizing::new(hex::decode(h).expect("KUBCODE_LOCAL_OPS_KEY is hex")));
    let local = Arc::new(Local {
        secrets,
        registry,
        cfg,
        opener,
        ops_key,
    });

    let listener = TcpListener::bind(("127.0.0.1", port)).await.expect("bind");
    println!(
        "[publishing-local] listening on http://127.0.0.1:{port}{}",
        if protect { " (accounts protected)" } else { "" }
    );
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            continue;
        };
        let local = Arc::clone(&local);
        tokio::spawn(async move {
            let svc = hyper::service::service_fn(move |req| handle(Arc::clone(&local), req));
            let _ = http1::Builder::new()
                .serve_connection(TokioIo::new(stream), svc)
                .await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Any call that reaches it fails the test.
    struct Tripwire;

    #[async_trait]
    impl ConnectProvider for Tripwire {
        fn kind(&self) -> ProviderKind {
            ProviderKind::Zernio
        }
        async fn start(
            &self,
            _: &WorkspaceCtx,
            _: Platform,
            _: &str,
        ) -> Result<ConnectStart, PublishError> {
            panic!("start reached the provider")
        }
        async fn complete(
            &self,
            _: &ProviderRef,
            _: Platform,
            _: &CallbackParams,
        ) -> Result<ConnectedAccount, PublishError> {
            panic!("complete reached the provider")
        }
        async fn disconnect(&self, _: &ConnectionRef) -> Result<(), PublishError> {
            panic!("disconnect reached the provider")
        }
        async fn health(&self, _: &ProviderRef) -> Result<Vec<ConnectionHealth>, PublishError> {
            Ok(Vec::new())
        }
    }

    #[tokio::test]
    async fn protected_accounts_are_never_connected_or_disconnected() {
        let p = Protected(Arc::new(Tripwire));
        let profile = ProviderRef("prod-profile".into());
        let conn = ConnectionRef {
            platform: Platform::YouTube,
            profile: profile.clone(),
            account: ProviderRef("prod-account".into()),
        };
        let code = |e: PublishError| e.code.as_str().to_owned();
        assert_eq!(
            code(p.disconnect(&conn).await.unwrap_err()),
            "protected_account"
        );
        assert_eq!(
            code(
                p.complete(&profile, Platform::YouTube, &CallbackParams(Vec::new()))
                    .await
                    .unwrap_err()
            ),
            "protected_account"
        );
        assert!(
            p.health(&profile).await.unwrap().is_empty(),
            "health passes through"
        );
    }

    #[test]
    fn media_keys_stay_under_clips() {
        assert!(key_ok("clips/0b6f/clip-1/ab12.mp4"));
        for bad in [
            "../etc/passwd",
            "clips/../x",
            "other/x.mp4",
            "clips/a b.mp4",
            "/clips/x",
        ] {
            assert!(!key_ok(bad), "{bad}");
        }
    }
}
