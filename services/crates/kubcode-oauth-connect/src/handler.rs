//! HTTP surface of the Function URL: POST /oauth/exchange and /oauth/revoke.
//! Order: method and path, size, HMAC, DB, nonce (replay), body, flow.
//! Responses carry fixed codes only.

use kubcode_envelope::{DekUnwrapper, WrapPublicKey};
use lambda_http::http::{Method, StatusCode};
use lambda_http::{Body, Request, RequestExt, Response};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::auth;
use crate::db;
use crate::flow::{self, Deps, Exchange, Revoke};
use crate::providers::{OAuthClient, Providers};

pub const PARAM_HMAC_KEY: &str = "/kubcode/prod/connect-hmac-key";
pub const PARAM_WORKER_DB_URL: &str = "/kubcode/prod/worker-db-url";
pub const PARAM_GOOGLE_CLIENT: &str = "/kubcode/prod/google-connect-client";
pub const MAX_BODY_BYTES: usize = 4096;
pub const MIN_HMAC_KEY_BYTES: usize = 32;

pub struct Secrets {
    pub hmac_key: Zeroizing<Vec<u8>>,
    pub db_url: Zeroizing<String>,
    /// kubcode's shared Google client; None until the owner sets it.
    pub google: Option<OAuthClient>,
}

pub struct App<U: DekUnwrapper, P: Providers> {
    pub unwrapper: U,
    pub providers: P,
    pub wrap_key: WrapPublicKey,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Call {
    Upload(UploadBody),
    Exchange { state: String, code: String },
    Revoke { connection_id: Uuid, user_id: Uuid },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExchangeBody {
    state: String,
    code: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RevokeBody {
    connection_id: Uuid,
    user_id: Uuid,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UploadBody {
    pub connection_id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub size: u64,
    pub made_for_kids: bool,
}

/// Exact body shapes; anything else is a 400.
pub fn parse_call(path: &str, body: &[u8]) -> Option<Call> {
    match path {
        "/youtube/private-upload" => {
            let b: UploadBody = serde_json::from_slice(body).ok()?;
            let valid = !b.title.trim().is_empty()
                && b.title.chars().count() <= 100
                && !b.title.contains(['<', '>'])
                && (1..=100 * 1024 * 1024).contains(&b.size);
            valid.then_some(Call::Upload(b))
        }
        "/oauth/exchange" => {
            let b: ExchangeBody = serde_json::from_slice(body).ok()?;
            let ok = (1..=128).contains(&b.state.len()) && (1..=2048).contains(&b.code.len());
            ok.then_some(Call::Exchange {
                state: b.state,
                code: b.code,
            })
        }
        "/oauth/revoke" => {
            let b: RevokeBody = serde_json::from_slice(body).ok()?;
            Some(Call::Revoke {
                connection_id: b.connection_id,
                user_id: b.user_id,
            })
        }
        _ => None,
    }
}

fn reply(status: StatusCode, body: serde_json::Value) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .header("cache-control", "no-store")
        .body(Body::Text(body.to_string()))
        .expect("static response")
}

fn reject(status: StatusCode, code: &str) -> Response<Body> {
    reply(status, json!({ "ok": false, "code": code }))
}

pub async fn handle<U: DekUnwrapper + Sync, P: Providers>(
    app: &App<U, P>,
    secrets: &Secrets,
    req: Request,
    now: u64,
) -> Response<Body> {
    if req.method() != Method::POST {
        return reject(StatusCode::METHOD_NOT_ALLOWED, "method_not_allowed");
    }
    let path = req.raw_http_path().to_owned();
    if path != "/oauth/exchange" && path != "/oauth/revoke" && path != "/youtube/private-upload" {
        return reject(StatusCode::NOT_FOUND, "not_found");
    }
    let body: &[u8] = req.body().as_ref();
    if body.len() > MAX_BODY_BYTES {
        return reject(StatusCode::PAYLOAD_TOO_LARGE, "too_large");
    }
    let Ok(nonce) = auth::verify(&secrets.hmac_key, &path, req.headers(), body, now) else {
        return reject(StatusCode::UNAUTHORIZED, "unauthorized");
    };
    let Ok(client) = db::connect(&secrets.db_url).await else {
        println!("[oauth-connect] DB_CONNECT_FAILED");
        return reject(StatusCode::SERVICE_UNAVAILABLE, "unavailable");
    };
    match flow::accept_nonce(&client, &nonce).await {
        Ok(true) => {}
        Ok(false) => return reject(StatusCode::UNAUTHORIZED, "unauthorized"),
        Err(_) => return reject(StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
    }
    let Some(call) = parse_call(&path, body) else {
        return reject(StatusCode::BAD_REQUEST, "bad_request");
    };
    let deps = Deps {
        unwrapper: &app.unwrapper,
        providers: &app.providers,
        wrap_key: &app.wrap_key,
        kubcode_google: secrets.google.as_ref(),
    };
    match call {
        Call::Upload(b) => match flow::private_upload(&client, &deps, &b).await {
            Ok((url, channel)) => reply(
                StatusCode::OK,
                json!({"ok":true,"sessionUrl":url,"channelId":channel}),
            ),
            Err(code) => reply(StatusCode::OK, json!({"ok":false,"code":code})),
        },
        Call::Exchange { state, code } => match flow::exchange(&client, &deps, &state, &code).await
        {
            Ok(Exchange::Connected { label }) => {
                reply(StatusCode::OK, json!({ "ok": true, "label": label }))
            }
            Ok(Exchange::Failed(code)) => {
                println!("[oauth-connect] EXCHANGE_FAILED {code}");
                reply(StatusCode::OK, json!({ "ok": false, "code": code }))
            }
            Err(_) => reject(StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
        },
        Call::Revoke {
            connection_id,
            user_id,
        } => match flow::revoke(&client, &deps, connection_id, user_id).await {
            Ok(Revoke::Done { revoked }) => {
                reply(StatusCode::OK, json!({ "ok": true, "revoked": revoked }))
            }
            Ok(Revoke::NotFound) => {
                reply(StatusCode::OK, json!({ "ok": false, "code": "not_found" }))
            }
            Err(_) => reject(StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_upload_body_cannot_override_visibility() {
        let body = br#"{"connectionId":"0b0e8a1e-0000-4000-8000-0000000000c1","userId":"6f0f5e1c-0000-4000-8000-00000000f1a1","title":"hello","size":128,"madeForKids":false}"#;
        assert!(parse_call("/youtube/private-upload", body).is_some());
        let extra = String::from_utf8(body.to_vec())
            .unwrap()
            .replace("128,", "128,\"privacyStatus\":\"public\",");
        assert!(parse_call("/youtube/private-upload", extra.as_bytes()).is_none());
    }

    #[test]
    fn exchange_and_revoke_bodies_must_match_exactly() {
        assert_eq!(
            parse_call("/oauth/exchange", br#"{"state":"s","code":"c"}"#),
            Some(Call::Exchange {
                state: "s".into(),
                code: "c".into()
            })
        );
        assert_eq!(
            parse_call("/oauth/exchange", br#"{"state":"s","code":"c","x":1}"#),
            None
        );
        assert_eq!(
            parse_call("/oauth/exchange", br#"{"state":"","code":"c"}"#),
            None
        );
        let long = format!(r#"{{"state":"s","code":"{}"}}"#, "c".repeat(2049));
        assert_eq!(parse_call("/oauth/exchange", long.as_bytes()), None);
        let id = "0b0e8a1e-0000-4000-8000-0000000000c1";
        let user = "6f0f5e1c-0000-4000-8000-00000000f1a1";
        let revoke = format!(r#"{{"connectionId":"{id}","userId":"{user}"}}"#);
        assert_eq!(
            parse_call("/oauth/revoke", revoke.as_bytes()),
            Some(Call::Revoke {
                connection_id: id.parse().unwrap(),
                user_id: user.parse().unwrap()
            })
        );
        assert_eq!(
            parse_call("/oauth/revoke", br#"{"connectionId":"nope","userId":"x"}"#),
            None
        );
        assert_eq!(parse_call("/oauth/other", b"{}"), None);
    }
}
