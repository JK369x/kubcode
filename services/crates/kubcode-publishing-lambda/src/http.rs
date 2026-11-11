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

use crate::service::{log_safe, Service, WebhookResult};

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

/// The web host's timer sends `{}`: nothing else is a tick.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WorkerBody {}

/// Disconnect and the post list: one of the member's channels.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DisconnectBody {
    user_id: Uuid,
    channel_id: Uuid,
}

/// Our own query parameter on the callback; never passed to the provider.
const OWN_PARAMS: &[&str] = &["i"];

/// One log line per API call: the path, the outcome code and, for the
/// callback, the parameter names the provider sent (never their values, which
/// carry account ids and tokens).
pub fn api_log_line(path: &str, code: Option<&str>, param_keys: Option<&[&str]>) -> String {
    let mut line = format!(
        "[publishing] api path={path} outcome={}",
        code.map_or("ok", log_safe)
    );
    if let Some(keys) = param_keys {
        let mut names: Vec<&str> = keys
            .iter()
            .map(|k| {
                let ok = (1..=40).contains(&k.len())
                    && k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_');
                if ok {
                    *k
                } else {
                    "other"
                }
            })
            .collect();
        names.sort_unstable();
        line.push_str(" params=");
        line.push_str(&names.join(","));
    }
    line
}

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
    if path == "/api/worker" {
        if serde_json::from_slice::<WorkerBody>(body).is_err() {
            return fail(400, "bad_request");
        }
        let out = tick(svc).await;
        // One line per tick: counts and codes only.
        println!("[automations] tick {out}");
        return reply(200, out);
    }
    let mut param_keys: Option<Vec<String>> = None;
    let (route, result) = match path {
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
            let r = svc
                .connect_start(b.user_id, platform, &state, &cookie, &binding)
                .await
                .map(|url| json!({"ok": true, "auth_url": url}));
            ("/api/connect/start", r)
        }
        "/api/connect/complete" => {
            let Ok(b) = serde_json::from_slice::<CompleteBody>(body) else {
                return fail(400, "bad_request");
            };
            let Some(state) = hex32(&b.state) else {
                return fail(400, "bad_request");
            };
            let params: Vec<(String, String)> = b
                .params
                .into_iter()
                .filter(|(k, _)| !OWN_PARAMS.contains(&k.as_str()))
                .take(32)
                .collect();
            param_keys = Some(params.iter().map(|(k, _)| k.clone()).collect());
            let r = svc
                .connect_complete(&state, CallbackParams(params))
                .await
                .map(|ch| json!({"ok": true, "channel_id": ch.0}));
            ("/api/connect/complete", r)
        }
        "/api/channels/disconnect" => {
            let Ok(b) = serde_json::from_slice::<DisconnectBody>(body) else {
                return fail(400, "bad_request");
            };
            let r = svc
                .disconnect(b.user_id, ChannelId(b.channel_id))
                .await
                .map(|()| json!({"ok": true}));
            ("/api/channels/disconnect", r)
        }
        "/api/channels/posts" => {
            // The web host's GET /api/channels/{id}/posts. Signed requests are
            // POSTs (KUBCODE-HMAC-V1 signs the method as POST); this one reads
            // only.
            let Ok(b) = serde_json::from_slice::<DisconnectBody>(body) else {
                return fail(400, "bad_request");
            };
            let r = svc
                .channel_posts(b.user_id, ChannelId(b.channel_id))
                .await
                .map(|p| json!({"ok": true, "posts": p.posts, "complete": p.complete}));
            ("/api/channels/posts", r)
        }
        _ => return fail(404, "not_found"),
    };
    let keys: Option<Vec<&str>> = param_keys
        .as_ref()
        .map(|v| v.iter().map(String::as_str).collect());
    println!(
        "{}",
        api_log_line(
            route,
            result.as_ref().err().map(|f| f.code.as_str()),
            keys.as_deref()
        )
    );
    match result {
        Ok(v) => reply(200, v),
        // A refused business step is a 200 with ok=false, so the web host
        // can map the code to Thai copy; transport failures stay 5xx.
        Err(f) if f.code == "store_unavailable" => fail(503, "unavailable"),
        Err(f) => reply(200, json!({"ok": false, "code": f.code})),
    }
}

/// One worker tick, never two at once (an advisory lock across instances;
/// the ledger claim already stops a second DM).
async fn tick(svc: &mut Service<'_>) -> Value {
    match svc.store.try_worker_lock().await {
        Ok(true) => {}
        Ok(false) => return json!({"ok": true, "code": "busy"}),
        Err(_) => return json!({"ok": false, "code": "unavailable"}),
    }
    let out = crate::worker::run(svc, svc.now.minute()).await;
    // The connection closes after the request anyway; release explicitly.
    let _ = svc.store.release_worker_lock().await;
    out
}

#[cfg(test)]
mod tests {
    use super::api_log_line;

    #[test]
    fn api_lines_carry_path_outcome_and_param_names_only() {
        assert_eq!(
            api_log_line("/api/connect/start", None, None),
            "[publishing] api path=/api/connect/start outcome=ok"
        );
        let keys = ["connected", "profileId", "accountId", "username"];
        assert_eq!(
            api_log_line("/api/connect/complete", Some("connect_incomplete"), Some(&keys)),
            "[publishing] api path=/api/connect/complete outcome=connect_incomplete params=accountId,connected,profileId,username"
        );
    }

    #[test]
    fn hostile_names_and_codes_never_reach_the_logs() {
        let keys = ["error", "x\nforged", "", &"k".repeat(41)];
        assert_eq!(
            api_log_line("/api/connect/complete", Some("Bad Code\n"), Some(&keys)),
            "[publishing] api path=/api/connect/complete outcome=other params=error,other,other,other"
        );
        assert_eq!(
            api_log_line("/api/connect/complete", None, Some(&[])),
            "[publishing] api path=/api/connect/complete outcome=ok params="
        );
    }
}
