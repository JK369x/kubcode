//! The Function URL (design §4): `/api/*` for the web host, proven by
//! KUBCODE-HMAC-V1 (the connect Lambda's scheme, nonce table shared), and
//! `/webhooks/zernio`, proven by Zernio's signature. Responses carry fixed
//! codes only.

use kubcode_publishing::domain::{ChannelId, Platform, ProviderKind};
use kubcode_publishing::events::Headers;
use kubcode_publishing::ports::CallbackParams;
use lambda_http::http::HeaderMap;
use oauth_connect::auth;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::service::{Service, WebhookResult};

pub const MAX_API_BODY: usize = 16 * 1024;
pub const MAX_WEBHOOK_BODY: usize = 1024 * 1024;

pub struct Reply {
    pub status: u16,
    pub body: Value,
}

fn reply(status: u16, body: Value) -> Reply {
    Reply { status, body }
}

fn fail(status: u16, code: &str) -> Reply {
    reply(status, json!({"ok": false, "code": code}))
}

fn hex32(s: &str) -> Option<[u8; 32]> {
    if s.len() != 64
        || !s
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return None;
    }
    hex::decode(s).ok()?.try_into().ok()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StartBody {
    user_id: Uuid,
    platform: String,
    state: String,
    cookie_hash: String,
    session_binding_hash: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CompleteBody {
    state: String,
    params: Vec<(String, String)>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DisconnectBody {
    user_id: Uuid,
    channel_id: Uuid,
}

/// Our own query parameter on the callback; never passed to the provider.
const OWN_PARAMS: &[&str] = &["i"];

pub async fn handle(
    svc: &mut Service<'_>,
    hmac_key: &[u8],
    method: &str,
    path: &str,
    headers: &HeaderMap,
    body: &[u8],
    now: u64,
) -> Reply {
    if method != "POST" {
        return fail(405, "method_not_allowed");
    }
    if path == "/webhooks/zernio" {
        if body.len() > MAX_WEBHOOK_BODY {
            return fail(413, "too_large");
        }
        let h = Headers(
            headers
                .iter()
                .filter_map(|(k, v)| Some((k.as_str().to_owned(), v.to_str().ok()?.to_owned())))
                .collect(),
        );
        return match svc.webhook(ProviderKind::Zernio, &h, body).await {
            WebhookResult::Accepted => reply(200, json!({"ok": true})),
            WebhookResult::Unauthorized => fail(401, "unauthorized"),
            WebhookResult::Retry => fail(500, "retry"),
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
        Err(_) => return fail(503, "unavailable"),
    }
    let result = match path {
        "/api/connect/start" => {
            let Ok(b) = serde_json::from_slice::<StartBody>(body) else {
                return fail(400, "bad_request");
            };
            let (Some(platform), Some(state), Some(cookie), Some(binding)) = (
                Platform::parse(&b.platform),
                hex32(&b.state),
                hex32(&b.cookie_hash),
                hex32(&b.session_binding_hash),
            ) else {
                return fail(400, "bad_request");
            };
            svc.connect_start(b.user_id, platform, &state, &cookie, &binding)
                .await
                .map(|url| json!({"ok": true, "auth_url": url}))
        }
        "/api/connect/complete" => {
            let Ok(b) = serde_json::from_slice::<CompleteBody>(body) else {
                return fail(400, "bad_request");
            };
            let Some(state) = hex32(&b.state) else {
                return fail(400, "bad_request");
            };
            let params = b
                .params
                .into_iter()
                .filter(|(k, _)| !OWN_PARAMS.contains(&k.as_str()))
                .take(32)
                .collect();
            svc.connect_complete(&state, CallbackParams(params))
                .await
                .map(|ch| json!({"ok": true, "channel_id": ch.0}))
        }
        "/api/channels/disconnect" => {
            let Ok(b) = serde_json::from_slice::<DisconnectBody>(body) else {
                return fail(400, "bad_request");
            };
            svc.disconnect(b.user_id, ChannelId(b.channel_id))
                .await
                .map(|()| json!({"ok": true}))
        }
        _ => return fail(404, "not_found"),
    };
    match result {
        Ok(v) => reply(200, v),
        // A refused business step is a 200 with ok=false, so the web host
        // can map the code to Thai copy; transport failures stay 5xx.
        Err(f) if f.code == "store_unavailable" => fail(503, "unavailable"),
        Err(f) => reply(200, json!({"ok": false, "code": f.code})),
    }
}
