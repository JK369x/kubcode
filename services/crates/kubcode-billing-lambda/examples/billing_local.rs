//! Local runner for the billing Function URL (docs/dev/local-e2e.md, "Billing").
//!
//! Serves the same `http::handle` as the Lambda on 127.0.0.1, against a
//! loopback PostgreSQL (role kubcode_billing) and the real Stripe API in TEST
//! mode. Secrets live in this process only, read from stdin:
//!   line 1: the Stripe test key (sk_test_/rk_test_; live keys are refused)
//!   line 2: the webhook signing secret printed by `stripe listen` (whsec_…)
//! Everything else comes from env and is local-only:
//!   KUBCODE_LOCAL_PORT             port on 127.0.0.1
//!   KUBCODE_LOCAL_BILLING_DB_URL   loopback postgres URL that runs as kubcode_billing
//!   KUBCODE_LOCAL_HMAC_KEY         the key the local Next server signs with
//!   KUBCODE_LOCAL_SITE_ORIGIN      Checkout return URLs (default https://kubcode.dev)

use std::collections::HashMap;
use std::convert::Infallible;
use std::io::BufRead;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use billing_lambda::http;
use billing_lambda::runtime::{
    secrets_from, PARAM_DB_URL, PARAM_HMAC_KEY, PARAM_STRIPE_KEY, PARAM_WEBHOOK_SECRET,
};
use billing_lambda::service::{Config, Service};
use billing_lambda::stripe::{ReqwestTransport, Stripe, API_BASE};
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use kubcode_billing_store::Store;
use serde_json::json;
use tokio::net::TcpListener;
use zeroize::Zeroizing;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} is required"))
}

fn loopback(url: &str) -> bool {
    url.contains("@127.0.0.1:") || url.contains("@localhost:")
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let port: u16 = env("KUBCODE_LOCAL_PORT").parse().expect("port");
    let db_url = env("KUBCODE_LOCAL_BILLING_DB_URL");
    assert!(loopback(&db_url), "local database only");
    let mut lines = std::io::stdin().lock().lines();
    let stripe_key = Zeroizing::new(
        lines
            .next()
            .expect("line 1: Stripe test key")
            .expect("stdin"),
    );
    let whsec = Zeroizing::new(
        lines
            .next()
            .expect("line 2: whsec from stripe listen")
            .expect("stdin"),
    );
    let mut found: HashMap<String, Zeroizing<String>> = HashMap::new();
    found.insert(PARAM_DB_URL.into(), Zeroizing::new(db_url.clone()));
    found.insert(
        PARAM_HMAC_KEY.into(),
        Zeroizing::new(env("KUBCODE_LOCAL_HMAC_KEY")),
    );
    found.insert(
        PARAM_STRIPE_KEY.into(),
        Zeroizing::new(stripe_key.trim().to_owned()),
    );
    found.insert(
        PARAM_WEBHOOK_SECRET.into(),
        Zeroizing::new(whsec.trim().to_owned()),
    );
    // allow_live = false: a live key aborts here.
    let secrets = Arc::new(secrets_from(found, false).unwrap_or_else(|code| panic!("{code}")));
    let stripe = Arc::new(Stripe {
        transport: Arc::new(
            ReqwestTransport::new(secrets.stripe_key.clone(), API_BASE.into())
                .expect("http client"),
        ),
    });
    let cfg = Arc::new(Config {
        site_origin: std::env::var("KUBCODE_LOCAL_SITE_ORIGIN")
            .unwrap_or_else(|_| "https://kubcode.dev".into()),
        allow_live: false,
    });
    let listener = TcpListener::bind(("127.0.0.1", port)).await.expect("bind");
    println!("billing_local: READY on 127.0.0.1:{port} (test mode)");
    loop {
        let (stream, _) = listener.accept().await.expect("accept");
        let (secrets, stripe, cfg, db_url) = (
            Arc::clone(&secrets),
            Arc::clone(&stripe),
            Arc::clone(&cfg),
            db_url.clone(),
        );
        tokio::spawn(async move {
            let svc = hyper::service::service_fn(move |req: Request<Incoming>| {
                let (secrets, stripe, cfg, db_url) = (
                    Arc::clone(&secrets),
                    Arc::clone(&stripe),
                    Arc::clone(&cfg),
                    db_url.clone(),
                );
                async move {
                    let (parts, body) = req.into_parts();
                    let bytes = match Limited::new(body, http::MAX_WEBHOOK_BODY).collect().await {
                        Ok(b) => b.to_bytes(),
                        Err(_) => {
                            return Ok::<_, Infallible>(
                                Response::builder()
                                    .status(413)
                                    .body(Full::new(Bytes::from_static(b"{}")))
                                    .unwrap(),
                            )
                        }
                    };
                    let reply = match tokio_postgres::connect(&db_url, tokio_postgres::NoTls).await
                    {
                        Ok((client, conn)) => {
                            tokio::spawn(conn);
                            let mut store = Store::new(client);
                            let mut s = Service {
                                store: &mut store,
                                stripe: &stripe,
                                cfg: &cfg,
                                now: time::OffsetDateTime::now_utc(),
                            };
                            let now = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap()
                                .as_secs();
                            http::handle(
                                &mut s,
                                &secrets.hmac_key,
                                &secrets.webhook_secrets,
                                parts.method.as_str(),
                                parts.uri.path(),
                                &parts.headers,
                                &bytes,
                                now,
                            )
                            .await
                        }
                        Err(_) => http::Reply {
                            status: 503,
                            body: json!({"ok": false, "code": "unavailable"}),
                        },
                    };
                    Ok(Response::builder()
                        .status(reply.status)
                        .header("content-type", "application/json")
                        .body(Full::new(Bytes::from(reply.body.to_string())))
                        .unwrap())
                }
            });
            let _ = http1::Builder::new()
                .serve_connection(TokioIo::new(stream), svc)
                .await;
        });
    }
}
