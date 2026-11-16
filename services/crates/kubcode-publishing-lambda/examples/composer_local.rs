//! Local preview runner for the web composer (no real posts):
//!   127.0.0.1:$KUBCODE_LOCAL_PORT        the Function URL (`http::handle_with`) with the
//!                                         FAKE provider (kubcode-publishing `contract`)
//!   127.0.0.1:$KUBCODE_LOCAL_MEDIA_PORT  an S3 stand-in that takes the presigned PUT,
//!                                         checks the SHA-256 header, writes to $KUBCODE_LOCAL_MEDIA_DIR
//! Env (local only): KUBCODE_LOCAL_WORKER_DB_URL (loopback), KUBCODE_LOCAL_HMAC_KEY.
//! POST /seed-account {"user_id", "platform"} connects a fake channel (preview setup).

use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use base64::Engine;
use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use kubcode_publishing::config::PublishingConfig;
use kubcode_publishing::domain::{MediaKind, MediaMeta, Platform, ProviderKind};
use kubcode_publishing::errors::{ErrorClass, PublishError};
use kubcode_publishing::fake::FakeProvider;
use kubcode_publishing::ports::{CallbackParams, MediaBody, MediaSource};
use kubcode_publishing_store::Store;
use publishing_lambda::http::{self, Uploader};
use publishing_lambda::service::{MediaOpener, ProviderSet, Registry, Service};
use publishing_lambda::upload::PresignedPut;
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::net::TcpListener;

fn env(n: &str) -> String {
    std::env::var(n).unwrap_or_else(|_| panic!("{n} is required"))
}

struct LocalUploads {
    origin: String,
}
impl Uploader for LocalUploads {
    fn presign_put(
        &self,
        key: &str,
        content_type: &str,
        sha: &[u8; 32],
        _now: u64,
    ) -> Option<PresignedPut> {
        Some(PresignedPut {
            url: format!("{}/{key}", self.origin),
            headers: vec![
                ("content-type".into(), content_type.into()),
                (
                    "x-amz-checksum-sha256".into(),
                    base64::engine::general_purpose::STANDARD.encode(sha),
                ),
            ],
        })
    }
}

/// Reads what the browser uploaded to the S3 stand-in (proves the round trip).
struct Opener {
    dir: PathBuf,
}
struct Media {
    dir: PathBuf,
    video: (String, MediaMeta),
    cover: Option<(String, MediaMeta)>,
}
impl MediaOpener for Opener {
    fn open(&self, k: &str, v: &MediaMeta, c: Option<(&str, &MediaMeta)>) -> Box<dyn MediaSource> {
        Box::new(Media {
            dir: self.dir.clone(),
            video: (k.to_owned(), v.clone()),
            cover: c.map(|(k, m)| (k.to_owned(), m.clone())),
        })
    }
}
#[async_trait]
impl MediaSource for Media {
    async fn open(&self, kind: MediaKind) -> Result<MediaBody, PublishError> {
        let (key, meta) = match kind {
            MediaKind::Video => &self.video,
            MediaKind::Cover => self
                .cover
                .as_ref()
                .ok_or_else(|| PublishError::new(ErrorClass::Rejected, "cover_missing"))?,
        };
        if !key.starts_with("clips/") || key.contains("..") {
            return Err(PublishError::new(ErrorClass::Bug, "bad_media_key"));
        }
        let bytes = tokio::fs::read(self.dir.join(key))
            .await
            .map_err(|_| PublishError::new(ErrorClass::Rejected, "media_missing"))?;
        let body = futures::stream::once(async move { Ok(Bytes::from(bytes)) });
        Ok(MediaBody {
            meta: meta.clone(),
            filename: key.rsplit('/').next().unwrap_or("media").to_owned(),
            body: Box::pin(body),
        })
    }
}

struct Local {
    db_url: String,
    hmac: Vec<u8>,
    registry: Registry,
    fake: Arc<FakeProvider>,
    cfg: PublishingConfig,
    uploads: LocalUploads,
    media_dir: PathBuf,
    opener: Opener,
}

fn json_reply(status: u16, body: String) -> Result<Response<Full<Bytes>>, Infallible> {
    Ok(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .header("access-control-allow-origin", "*")
        .body(Full::new(Bytes::from(body)))
        .unwrap())
}

async fn api(
    local: Arc<Local>,
    req: Request<Incoming>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let (parts, body) = req.into_parts();
    let Ok(body) = Limited::new(body, 2 * 1024 * 1024).collect().await else {
        return json_reply(413, "{}".into());
    };
    let body = body.to_bytes();
    let Ok((client, conn)) = tokio_postgres::connect(&local.db_url, tokio_postgres::NoTls).await
    else {
        return json_reply(503, json!({"ok": false, "code": "unavailable"}).to_string());
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
    if parts.uri.path() == "/seed-account" {
        // Preview setup only: connect a fake channel for a user.
        let v: serde_json::Value = serde_json::from_slice(&body).unwrap_or_default();
        let user: uuid::Uuid = v["user_id"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or_default();
        let platform =
            Platform::parse(v["platform"].as_str().unwrap_or("")).unwrap_or(Platform::TikTok);
        let state = *uuid::Uuid::new_v4().as_bytes();
        let state: [u8; 32] = [state, state].concat().try_into().unwrap();
        if svc
            .connect_start(user, platform, &state, &[1; 32], &[2; 32])
            .await
            .is_err()
        {
            return json_reply(500, "{}".into());
        }
        let ws = svc.store.owner_workspace(user).await.unwrap();
        let profile = svc
            .store
            .profile(ws, ProviderKind::Zernio)
            .await
            .unwrap()
            .unwrap();
        let account = local.fake.add_account(&profile, platform);
        let ch = svc
            .connect_complete(
                &state,
                CallbackParams(vec![("accountId".into(), account.0)]),
            )
            .await;
        return json_reply(
            200,
            json!({"ok": ch.is_ok(), "channel": ch.ok().map(|c| c.0)}).to_string(),
        );
    }
    if parts.uri.path() == "/seed-comments" {
        // Preview setup only: own posts and their comments on the fake provider.
        let v: serde_json::Value = serde_json::from_slice(&body).unwrap_or_default();
        let account =
            kubcode_publishing::domain::ProviderRef(v["account"].as_str().unwrap_or("").to_owned());
        let now = time::OffsetDateTime::now_utc();
        let mut own = Vec::new();
        for p in v["posts"].as_array().cloned().unwrap_or_default() {
            let id = p["id"].as_str().unwrap_or("0").to_owned();
            own.push(kubcode_publishing::ports::OwnPost {
                platform_post_id: id.clone(),
                permalink: None,
                thumbnail_url: None,
                caption: p["caption"].as_str().unwrap_or("").to_owned(),
                created_at: Some(now - time::Duration::days(p["days_ago"].as_i64().unwrap_or(0))),
            });
            let comments = p["comments"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .iter()
                .enumerate()
                .map(|(i, c)| kubcode_publishing::events::IncomingComment {
                    account: account.clone(),
                    comment_id: format!("{id}-{i}"),
                    platform_post_id: id.clone(),
                    author_id: format!("viewer-{i}"),
                    own_account: c["own"].as_bool().unwrap_or(false),
                    is_reply: c["reply"].as_bool().unwrap_or(false),
                    created_at: Some(
                        now - time::Duration::days(c["days_ago"].as_i64().unwrap_or(0)),
                    ),
                    text: c["text"].as_str().unwrap_or("").to_owned(),
                })
                .collect();
            local.fake.set_post_comments(&id, comments);
        }
        local.fake.set_own_posts(own);
        return json_reply(200, json!({"ok": true}).to_string());
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let r = http::handle_with(
        &mut svc,
        &local.hmac,
        &local.uploads,
        parts.method.as_str(),
        parts.uri.path(),
        &parts.headers,
        &body,
        now,
    )
    .await;
    json_reply(r.status, r.body.to_string())
}

/// The S3 stand-in: CORS preflight, then PUT with the signed checksum.
async fn media(
    local: Arc<Local>,
    req: Request<Incoming>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let cors = |b: hyper::http::response::Builder| {
        b.header("access-control-allow-origin", "*")
            .header("access-control-allow-methods", "PUT")
            .header("access-control-allow-headers", "content-type, x-amz-checksum-sha256, x-amz-server-side-encryption, x-amz-sdk-checksum-algorithm")
    };
    if req.method() == hyper::Method::OPTIONS {
        return Ok(cors(Response::builder())
            .status(204)
            .body(Full::new(Bytes::new()))
            .unwrap());
    }
    let key = req.uri().path().trim_start_matches('/').to_owned();
    let ok_key = key.starts_with("clips/")
        && !key.contains("..")
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/._-".contains(&b));
    let want = req
        .headers()
        .get("x-amz-checksum-sha256")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    if req.method() != hyper::Method::PUT || !ok_key || want.is_none() {
        return Ok(cors(Response::builder())
            .status(400)
            .body(Full::new(Bytes::new()))
            .unwrap());
    }
    let Ok(body) = Limited::new(req.into_body(), 600 * 1024 * 1024)
        .collect()
        .await
    else {
        return Ok(cors(Response::builder())
            .status(413)
            .body(Full::new(Bytes::new()))
            .unwrap());
    };
    let body = body.to_bytes();
    let got = base64::engine::general_purpose::STANDARD.encode(Sha256::digest(&body));
    if Some(got) != want {
        return Ok(cors(Response::builder())
            .status(400)
            .body(Full::new(Bytes::from_static(b"BadDigest")))
            .unwrap());
    }
    let path = local.media_dir.join(&key);
    tokio::fs::create_dir_all(path.parent().unwrap()).await.ok();
    tokio::fs::write(&path, &body).await.ok();
    Ok(cors(Response::builder())
        .status(200)
        .header("etag", "\"local\"")
        .body(Full::new(Bytes::new()))
        .unwrap())
}

async fn serve<F, Fut>(port: u16, local: Arc<Local>, f: F)
where
    F: Fn(Arc<Local>, Request<Incoming>) -> Fut + Copy + Send + 'static,
    Fut: std::future::Future<Output = Result<Response<Full<Bytes>>, Infallible>> + Send + 'static,
{
    let l = TcpListener::bind(("127.0.0.1", port)).await.expect("bind");
    loop {
        let (s, _) = l.accept().await.expect("accept");
        let local = local.clone();
        tokio::spawn(async move {
            let svc = hyper::service::service_fn(move |r| f(local.clone(), r));
            let _ = http1::Builder::new()
                .serve_connection(TokioIo::new(s), svc)
                .await;
        });
    }
}

#[tokio::main]
async fn main() {
    let db_url = env("KUBCODE_LOCAL_WORKER_DB_URL");
    assert!(
        db_url.contains("@127.0.0.1:") || db_url.contains("@localhost:"),
        "loopback database only"
    );
    let port: u16 = env("KUBCODE_LOCAL_PORT").parse().unwrap();
    let media_port: u16 = env("KUBCODE_LOCAL_MEDIA_PORT").parse().unwrap();
    let fake = Arc::new(FakeProvider::default());
    let local = Arc::new(Local {
        db_url,
        hmac: env("KUBCODE_LOCAL_HMAC_KEY").into_bytes(),
        registry: Registry {
            zernio: Some(ProviderSet {
                connect: fake.clone(),
                publisher: fake.clone(),
                events: fake.clone(),
                inbox: Some(fake.clone()),
            }),
        },
        fake,
        cfg: PublishingConfig::default(),
        uploads: LocalUploads {
            origin: format!("http://127.0.0.1:{media_port}"),
        },
        media_dir: PathBuf::from(env("KUBCODE_LOCAL_MEDIA_DIR")),
        opener: Opener {
            dir: PathBuf::from(env("KUBCODE_LOCAL_MEDIA_DIR")),
        },
    });
    println!(
        "composer_local: READY api=127.0.0.1:{port} media=127.0.0.1:{media_port} (fake provider)"
    );
    tokio::join!(
        serve(port, local.clone(), api),
        serve(media_port, local, media)
    );
}
