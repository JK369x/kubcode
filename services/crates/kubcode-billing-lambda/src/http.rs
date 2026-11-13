//! Routing for the Function URL. Fixed codes only in responses and logs;
//! nothing from a request body, and never a Stripe id, is echoed to logs.

use kubcode_billing::quote::Kind;
use lambda_http::http::HeaderMap;
use oauth_connect::auth;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::service::{BillingStore, Refusal, Service};
use crate::stripe::Transport;
use crate::webhook::{self, Event};

pub const MAX_API_BODY: usize = 4 * 1024;
pub const MAX_WEBHOOK_BODY: usize = 256 * 1024;

pub struct Reply {
    pub status: u16,
    pub body: Value,
}

fn fail(status: u16, code: &str) -> Reply {
    Reply {
        status,
        body: json!({"ok": false, "code": code}),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusBody {
    user_id: Uuid,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CheckoutBody {
    user_id: Uuid,
    kind: String,
    slots: u32,
    #[serde(default)]
    email: Option<String>,
}

/// The timer sends `{}`: nothing else is a sweep.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SweepBody {}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FulfilBody {
    user_id: Uuid,
    session_id: String,
}

/// The replay guard for signed API calls (the store's nonce table).
#[async_trait::async_trait]
pub trait Nonces {
    async fn use_nonce(&self, hash: &[u8; 32]) -> Result<bool, ()>;
}

#[async_trait::async_trait]
impl Nonces for kubcode_billing_store::Store {
    async fn use_nonce(&self, hash: &[u8; 32]) -> Result<bool, ()> {
        kubcode_billing_store::Store::use_nonce(self, hash)
            .await
            .map_err(|_| ())
    }
}

fn log(route: &str, outcome: &str) {
    let safe = |s: &str| {
        if s.len() <= 40
            && s.bytes()
                .all(|b| b.is_ascii_lowercase() || b == b'_' || b == b'.')
        {
            s.to_owned()
        } else {
            "other".into()
        }
    };
    println!("[billing] route={} outcome={}", safe(route), safe(outcome));
}

fn refusal_reply(r: Refusal) -> Reply {
    match r.0 {
        "store_unavailable" | "stripe_unavailable" => fail(503, "unavailable"),
        code => Reply {
            status: 200,
            body: json!({"ok": false, "code": code}),
        },
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn handle<S: BillingStore + Nonces, T: Transport + ?Sized>(
    svc: &mut Service<'_, S, T>,
    hmac_key: &[u8],
    webhook_secrets: &[Vec<u8>],
    method: &str,
    path: &str,
    headers: &HeaderMap,
    body: &[u8],
    now: u64,
) -> Reply {
    if method != "POST" {
        return fail(405, "method_not_allowed");
    }
    if path == "/stripe/webhook" {
        if body.len() > MAX_WEBHOOK_BODY {
            return fail(413, "too_large");
        }
        let sig = headers
            .get("stripe-signature")
            .and_then(|v| v.to_str().ok());
        if webhook::verify(webhook_secrets, sig, body, now).is_err() {
            log("webhook", "bad_signature");
            return fail(400, "bad_signature");
        }
        let Ok(ev) = serde_json::from_slice::<Event>(body) else {
            log("webhook", "malformed");
            return fail(400, "malformed");
        };
        if !webhook::valid_event_id(&ev.id) {
            return fail(400, "malformed");
        }
        return match svc.webhook(&ev).await {
            Ok(code) => {
                log("webhook", code);
                Reply {
                    status: 200,
                    body: json!({"ok": true}),
                }
            }
            Err(r) => {
                // A 5xx makes Stripe retry with backoff.
                log("webhook", r.0);
                fail(500, "retry")
            }
        };
    }
    if !path.starts_with("/api/") {
        return fail(404, "not_found");
    }
    if body.len() > MAX_API_BODY {
        return fail(413, "too_large");
    }
    let Ok(nonce) = auth::verify(hmac_key, path, headers, body, now) else {
        return fail(401, "unauthorized");
    };
    match svc
        .store
        .use_nonce(&Sha256::digest(nonce.as_bytes()).into())
        .await
    {
        Ok(true) => {}
        Ok(false) => return fail(401, "unauthorized"),
        Err(()) => return fail(503, "unavailable"),
    }
    let (route, result) = match path {
        "/api/status" => {
            let Ok(b) = serde_json::from_slice::<StatusBody>(body) else {
                return fail(400, "bad_request");
            };
            ("status", svc.status(b.user_id).await)
        }
        "/api/checkout" => {
            let Ok(b) = serde_json::from_slice::<CheckoutBody>(body) else {
                return fail(400, "bad_request");
            };
            let Some(kind) = Kind::parse(&b.kind).filter(|k| *k != Kind::Renew) else {
                return fail(400, "bad_request");
            };
            let email = b
                .email
                .as_deref()
                .filter(|e| e.len() <= 254 && e.contains('@') && !e.contains(char::is_whitespace));
            // "new" means "a month pass": the quote picks new or renew itself.
            (
                "checkout",
                svc.checkout(b.user_id, kind, b.slots, email).await,
            )
        }
        "/api/sweep" => {
            if serde_json::from_slice::<SweepBody>(body).is_err() {
                return fail(400, "bad_request");
            }
            ("sweep", svc.sweep().await)
        }
        "/api/fulfil" => {
            let Ok(b) = serde_json::from_slice::<FulfilBody>(body) else {
                return fail(400, "bad_request");
            };
            (
                "fulfil",
                svc.fulfil_from_page(b.user_id, &b.session_id).await,
            )
        }
        _ => return fail(404, "not_found"),
    };
    match result {
        Ok(v) => {
            log(route, "ok");
            Reply {
                status: 200,
                body: v,
            }
        }
        Err(r) => {
            log(route, r.0);
            refusal_reply(r)
        }
    }
}
