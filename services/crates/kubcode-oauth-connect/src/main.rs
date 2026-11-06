//! Lambda entry point. Secrets are read from SSM (never environment
//! variables) and cached for five minutes, so a rotated HMAC key or DB URL
//! takes effect without a redeploy, and the function starts even before the
//! owner has set them (requests get 503 until then). The Function URL's only
//! auth is the HMAC.

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use kubcode_envelope::keys::{WRAP_KEY_V1_PEM, WRAP_KEY_V1_SLOT};
use kubcode_envelope::WrapPublicKey;
use lambda_http::http::StatusCode;
use lambda_http::{service_fn, Body, Error, Request, Response};
use oauth_connect::aws::AwsClient;
use oauth_connect::handler::{
    self, App, Secrets, MIN_HMAC_KEY_BYTES, PARAM_GOOGLE_CLIENT, PARAM_HMAC_KEY,
    PARAM_WORKER_DB_URL,
};
use oauth_connect::providers::{HttpProviders, OAuthClient};
use oauth_connect::unwrap::KmsUnwrapper;
use tokio::sync::Mutex;
use zeroize::Zeroizing;

const SECRETS_TTL: Duration = Duration::from_secs(300);

async fn load_secrets(aws: &AwsClient) -> Result<Secrets, &'static str> {
    let mut found = aws
        .ssm_parameters(&[PARAM_HMAC_KEY, PARAM_WORKER_DB_URL, PARAM_GOOGLE_CLIENT])
        .await
        .map_err(|_| "SSM_READ_FAILED")?;
    let hmac = found.remove(PARAM_HMAC_KEY).ok_or("SSM_HMAC_KEY_MISSING")?;
    if hmac.len() < MIN_HMAC_KEY_BYTES {
        return Err("SSM_HMAC_KEY_TOO_SHORT");
    }
    let db_url = found
        .remove(PARAM_WORKER_DB_URL)
        .ok_or("SSM_WORKER_DB_URL_MISSING")?;
    let google = match found.remove(PARAM_GOOGLE_CLIENT) {
        None => None,
        Some(json) => {
            let v: serde_json::Value =
                serde_json::from_str(&json).map_err(|_| "SSM_GOOGLE_CLIENT_MALFORMED")?;
            let (Some(id), Some(secret)) = (v["client_id"].as_str(), v["client_secret"].as_str())
            else {
                return Err("SSM_GOOGLE_CLIENT_MALFORMED");
            };
            Some(OAuthClient {
                client_id: id.to_owned(),
                client_secret: Zeroizing::new(secret.to_owned()),
            })
        }
    };
    Ok(Secrets {
        hmac_key: Zeroizing::new(hmac.as_bytes().to_vec()),
        db_url,
        google,
    })
}

/// The cached secrets, reloaded after the TTL. A failed load is not cached.
async fn secrets(
    aws: &AwsClient,
    cache: &Mutex<Option<(Instant, Arc<Secrets>)>>,
) -> Option<Arc<Secrets>> {
    let mut slot = cache.lock().await;
    if let Some((at, s)) = slot.as_ref() {
        if at.elapsed() < SECRETS_TTL {
            return Some(Arc::clone(s));
        }
    }
    match load_secrets(aws).await {
        Ok(s) => {
            let s = Arc::new(s);
            *slot = Some((Instant::now(), Arc::clone(&s)));
            Some(s)
        }
        Err(code) => {
            println!("[oauth-connect] {code}");
            None
        }
    }
}

fn unavailable() -> Response<Body> {
    Response::builder()
        .status(StatusCode::SERVICE_UNAVAILABLE)
        .header("content-type", "application/json")
        .body(Body::Text(r#"{"ok":false,"code":"unavailable"}"#.into()))
        .expect("static response")
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Error> {
    let wrap_key = WrapPublicKey::from_spki_pem(WRAP_KEY_V1_SLOT, WRAP_KEY_V1_PEM)
        .map_err(|_| "WRAP_KEY_INVALID")?;
    let app = App {
        unwrapper: KmsUnwrapper::new(AwsClient::from_env().map_err(|_| "AWS_ENV_MISSING")?),
        providers: HttpProviders::new(),
        wrap_key,
    };
    let aws = AwsClient::from_env().map_err(|_| "AWS_ENV_MISSING")?;
    let cache = Mutex::new(None);
    let (app, aws, cache) = (&app, &aws, &cache);
    lambda_http::run(service_fn(move |req: Request| async move {
        let Some(s) = secrets(aws, cache).await else {
            return Ok::<_, Error>(unavailable());
        };
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Ok(handler::handle(app, &s, req, now).await)
    }))
    .await
}
