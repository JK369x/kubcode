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
use kubcode_publishing::errors::{ErrorClass, PublishError};
use kubcode_publishing_store::Store;
use kubcode_publishing_zernio::events::ZernioEvents;
use kubcode_publishing_zernio::limiter::Limiter;
use kubcode_publishing_zernio::transport::ReqwestTransport;
use kubcode_publishing_zernio::{Zernio, ZernioConfig, PRODUCTION_BASE};
use publishing_lambda::http;
use publishing_lambda::runtime::{
    secrets_from, S3Opener, Secrets, PARAM_HMAC_KEY, PARAM_WORKER_DB_URL, PARAM_ZERNIO_KEY,
};
use publishing_lambda::service::{ProviderSet, Registry, Service};
use serde_json::json;
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

struct Local {
    secrets: Secrets,
    registry: Registry,
    cfg: PublishingConfig,
    opener: S3Opener,
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
    let registry = Registry {
        zernio: Some(ProviderSet {
            connect: z.clone(),
            publisher: z,
            // Webhooks are not part of the local loop: nothing verifies.
            events: Arc::new(ZernioEvents::new(Vec::new())),
        }),
    };
    let opener = S3Opener {
        http: reqwest::Client::new(),
        bucket: "local-no-media".into(),
        region: "ap-southeast-1".into(),
    };
    let local = Arc::new(Local {
        secrets,
        registry,
        cfg,
        opener,
    });

    let listener = TcpListener::bind(("127.0.0.1", port)).await.expect("bind");
    println!("[publishing-local] listening on http://127.0.0.1:{port}");
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
