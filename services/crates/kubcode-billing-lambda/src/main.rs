//! Lambda entry point: one Function URL. Secrets come from SSM (cached five
//! minutes); until they exist the function answers 503.

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use billing_lambda::http;
use billing_lambda::runtime::{secrets_from, Secrets, ALL_PARAMS};
use billing_lambda::service::{Config, Service};
use billing_lambda::stripe::{ReqwestTransport, Stripe, API_BASE};
use kubcode_billing_store::Store;
use lambda_http::{Body, Request, Response};
use oauth_connect::aws::AwsClient;
use serde_json::{json, Value};
use tokio::sync::Mutex;

const SECRETS_TTL: Duration = Duration::from_secs(300);

type Loaded = (Arc<Secrets>, Arc<Stripe<ReqwestTransport>>);

struct Env {
    aws: AwsClient,
    cfg: Config,
    cache: Mutex<Option<(Instant, Loaded)>>,
}

impl Env {
    async fn secrets(&self) -> Option<Loaded> {
        let mut slot = self.cache.lock().await;
        if let Some((at, (s, st))) = slot.as_ref() {
            if at.elapsed() < SECRETS_TTL {
                return Some((Arc::clone(s), Arc::clone(st)));
            }
        }
        let loaded = match self.aws.ssm_parameters(&ALL_PARAMS).await {
            Ok(found) => secrets_from(found, self.cfg.allow_live),
            Err(_) => Err("SSM_READ_FAILED"),
        };
        match loaded {
            Ok(s) => {
                let base = std::env::var("KUBCODE_STRIPE_BASE").unwrap_or_else(|_| API_BASE.into());
                let Ok(t) = ReqwestTransport::new(s.stripe_key.clone(), base) else {
                    println!("[billing] HTTP_CLIENT");
                    return None;
                };
                let s = Arc::new(s);
                let st = Arc::new(Stripe {
                    transport: Arc::new(t),
                });
                *slot = Some((Instant::now(), (Arc::clone(&s), Arc::clone(&st))));
                Some((s, st))
            }
            Err(code) => {
                println!("[billing] {code}");
                None
            }
        }
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

async fn serve(env: &Env, req: Request) -> Response<Body> {
    let unavailable = || json_response(503, &json!({"ok": false, "code": "unavailable"}));
    let Some((s, stripe)) = env.secrets().await else {
        return unavailable();
    };
    let Ok(client) = oauth_connect::db::connect(&s.db_url).await else {
        return unavailable();
    };
    let mut store = Store::new(client);
    let (parts, body) = req.into_parts();
    let mut svc = Service {
        store: &mut store,
        stripe: &stripe,
        cfg: &env.cfg,
        now: time::OffsetDateTime::now_utc(),
    };
    let r = http::handle(
        &mut svc,
        &s.hmac_key,
        &s.webhook_secrets,
        parts.method.as_str(),
        parts.uri.path(),
        &parts.headers,
        body.as_ref(),
        now(),
    )
    .await;
    json_response(r.status, &r.body)
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), lambda_runtime::Error> {
    let site_origin =
        std::env::var("KUBCODE_SITE_ORIGIN").unwrap_or_else(|_| "https://kubcode.dev".into());
    let env = Env {
        aws: AwsClient::from_env().map_err(|_| "AWS_ENV_MISSING")?,
        // Live mode stays off until the owner's go-live (ADR 0008).
        cfg: Config {
            site_origin,
            allow_live: std::env::var("KUBCODE_STRIPE_ALLOW_LIVE").as_deref() == Ok("true"),
        },
        cache: Mutex::new(None),
    };
    let env = &env;
    lambda_http::run(lambda_http::service_fn(move |req: Request| async move {
        Ok::<_, lambda_http::Error>(serve(env, req).await)
    }))
    .await
}
