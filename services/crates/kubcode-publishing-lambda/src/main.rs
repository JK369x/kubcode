//! Lambda entry point. One binary, two functions (design §4):
//! `KUBCODE_PUBLISHING_MODE=url` serves the Function URL (web host + Zernio
//! webhooks); `ops` serves the owner's CLI through IAM invoke only. Secrets
//! come from SSM, cached five minutes; the function starts before they exist
//! and answers 503 until then.

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use kubcode_publishing::config::PublishingConfig;
use kubcode_publishing_store::Store;
use kubcode_publishing_zernio::events::ZernioEvents;
use kubcode_publishing_zernio::transport::ReqwestTransport;
use kubcode_publishing_zernio::{Zernio, ZernioConfig, PRODUCTION_BASE};
use lambda_http::{Body, Request, Response};
use lambda_runtime::{service_fn, LambdaEvent};
use oauth_connect::aws::AwsClient;
use publishing_lambda::runtime::{
    secrets_from, PgLimiter, S3Opener, Secrets, PARAM_HMAC_KEY, PARAM_OPS_KEY,
    PARAM_WEBHOOK_SECRET, PARAM_WEBHOOK_SECRET_PREVIOUS, PARAM_WORKER_DB_URL, PARAM_ZERNIO_KEY,
};
use publishing_lambda::service::{ProviderSet, Registry, Service};
use publishing_lambda::{http, ops, worker};
use serde_json::{json, Value};
use tokio::sync::Mutex;

const SECRETS_TTL: Duration = Duration::from_secs(300);

struct Env {
    aws: AwsClient,
    cfg: PublishingConfig,
    opener: S3Opener,
    cache: Mutex<Option<(Instant, Arc<Secrets>)>>,
}

impl Env {
    async fn secrets(&self) -> Option<Arc<Secrets>> {
        let mut slot = self.cache.lock().await;
        if let Some((at, s)) = slot.as_ref() {
            if at.elapsed() < SECRETS_TTL {
                return Some(Arc::clone(s));
            }
        }
        let names = [
            PARAM_WORKER_DB_URL,
            PARAM_HMAC_KEY,
            PARAM_ZERNIO_KEY,
            PARAM_WEBHOOK_SECRET,
            PARAM_WEBHOOK_SECRET_PREVIOUS,
            PARAM_OPS_KEY,
        ];
        let loaded = match self.aws.ssm_parameters(&names).await {
            Ok(found) => secrets_from(found),
            Err(_) => Err("SSM_READ_FAILED"),
        };
        match loaded {
            Ok(s) => {
                let s = Arc::new(s);
                *slot = Some((Instant::now(), Arc::clone(&s)));
                Some(s)
            }
            Err(code) => {
                println!("[publishing] {code}");
                None
            }
        }
    }

    fn registry(&self, s: &Secrets) -> Registry {
        let zernio = s.zernio_key.as_ref().map(|key| {
            let base =
                std::env::var("KUBCODE_ZERNIO_BASE").unwrap_or_else(|_| PRODUCTION_BASE.into());
            let z = Arc::new(Zernio::new(
                ZernioConfig {
                    base_url: base,
                    api_key: key.to_string(),
                },
                Arc::new(ReqwestTransport::new(Duration::from_secs(240))),
                Arc::new(PgLimiter::new(s.db_url.clone(), self.cfg.api_per_minute)),
            ));
            ProviderSet {
                connect: z.clone(),
                publisher: z.clone(),
                inbox: Some(z),
                events: Arc::new(ZernioEvents::new(s.webhook_secrets.clone())),
            }
        });
        Registry { zernio }
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn json_response(status: u16, body: &Value) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::Text(body.to_string()))
        .expect("static response")
}

async fn store(s: &Secrets) -> Option<Store> {
    oauth_connect::db::connect(&s.db_url)
        .await
        .ok()
        .map(Store::new)
}

async fn serve_url(env: &Env, req: Request) -> Response<Body> {
    let unavailable = || json_response(503, &json!({"ok": false, "code": "unavailable"}));
    let Some(s) = env.secrets().await else {
        return unavailable();
    };
    let Some(mut st) = store(&s).await else {
        return unavailable();
    };
    let reg = env.registry(&s);
    let (parts, body) = req.into_parts();
    let mut svc = Service {
        store: &mut st,
        reg: &reg,
        cfg: &env.cfg,
        media: &env.opener,
        now: time::OffsetDateTime::now_utc(),
    };
    let r = http::handle(
        &mut svc,
        &s.hmac_key,
        parts.method.as_str(),
        parts.uri.path(),
        &parts.headers,
        body.as_ref(),
        now(),
    )
    .await;
    json_response(r.status, &r.body)
}

async fn serve_ops(env: &Env, event: Value) -> Value {
    let Some(s) = env.secrets().await else {
        return json!({"ok": false, "code": "unavailable"});
    };
    let Some(mut st) = store(&s).await else {
        return json!({"ok": false, "code": "unavailable"});
    };
    let reg = env.registry(&s);
    let mut svc = Service {
        store: &mut st,
        reg: &reg,
        cfg: &env.cfg,
        media: &env.opener,
        now: time::OffsetDateTime::now_utc(),
    };
    ops::run_signed(
        &mut svc,
        s.ops_key.as_deref().map(|k| k.as_slice()),
        event,
        &env.opener.bucket,
        now(),
    )
    .await
}

/// The scheduled comment → DM worker (EventBridge Scheduler, every minute).
async fn serve_worker(env: &Env) -> Value {
    let Some(s) = env.secrets().await else {
        return json!({"ok": false, "code": "unavailable"});
    };
    let Some(mut st) = store(&s).await else {
        return json!({"ok": false, "code": "unavailable"});
    };
    let reg = env.registry(&s);
    let now = time::OffsetDateTime::now_utc();
    let mut svc = Service {
        store: &mut st,
        reg: &reg,
        cfg: &env.cfg,
        media: &env.opener,
        now,
    };
    let out = worker::run(&mut svc, now.minute()).await;
    println!("[automations] worker {out}");
    out
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), lambda_runtime::Error> {
    let region = std::env::var("AWS_REGION").map_err(|_| "AWS_REGION_MISSING")?;
    let bucket = std::env::var("KUBCODE_MEDIA_BUCKET").map_err(|_| "MEDIA_BUCKET_MISSING")?;
    let env = Env {
        aws: AwsClient::from_env().map_err(|_| "AWS_ENV_MISSING")?,
        cfg: PublishingConfig::from_env().map_err(|e| e.0)?,
        opener: S3Opener {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(240))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| "HTTP_CLIENT")?,
            bucket,
            region,
        },
        cache: Mutex::new(None),
    };
    let env = &env;
    match std::env::var("KUBCODE_PUBLISHING_MODE").as_deref() {
        Ok("worker") => {
            lambda_runtime::run(service_fn(move |_: LambdaEvent<Value>| async move {
                Ok::<_, lambda_runtime::Error>(serve_worker(env).await)
            }))
            .await
        }
        Ok("ops") => {
            lambda_runtime::run(service_fn(move |e: LambdaEvent<Value>| async move {
                Ok::<_, lambda_runtime::Error>(serve_ops(env, e.payload).await)
            }))
            .await
        }
        _ => {
            lambda_http::run(lambda_http::service_fn(move |req: Request| async move {
                Ok::<_, lambda_http::Error>(serve_url(env, req).await)
            }))
            .await
        }
    }
}
