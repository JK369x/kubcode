//! What only exists inside AWS: SSM secrets, S3 media streams and the
//! Postgres-backed limiter. Kept small and free of business rules.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::SystemTime;

use async_trait::async_trait;
use aws_credential_types::Credentials;
use aws_sigv4::http_request::{
    sign, PayloadChecksumKind, SignableBody, SignableRequest, SigningSettings,
};
use aws_sigv4::sign::v4;
use futures::TryStreamExt;
use kubcode_publishing::domain::{MediaKind, MediaMeta};
use kubcode_publishing::errors::{ErrorClass, PublishError, Result};
use kubcode_publishing::ports::{MediaBody, MediaSource};
use kubcode_publishing_store::Store;
use kubcode_publishing_zernio::limiter::Limiter;
use tokio::sync::Mutex;
use zeroize::Zeroizing;

use crate::service::MediaOpener;

pub const PARAM_WORKER_DB_URL: &str = "/kubcode/prod/worker-db-url";
pub const PARAM_HMAC_KEY: &str = "/kubcode/prod/publishing-hmac-key";
pub const PARAM_ZERNIO_KEY: &str = "/kubcode/prod/zernio-api-key";
pub const PARAM_WEBHOOK_SECRET: &str = "/kubcode/prod/zernio-webhook-secret";
/// Accepted for a day after a rotation (design §5.4).
pub const PARAM_WEBHOOK_SECRET_PREVIOUS: &str = "/kubcode/prod/zernio-webhook-secret-previous";
/// Signs the owner CLI's commands (ops function); also in the owner's vault.
pub const PARAM_OPS_KEY: &str = "/kubcode/prod/publishing-ops-key";
pub const MIN_HMAC_KEY_BYTES: usize = 32;

pub struct Secrets {
    pub db_url: Zeroizing<String>,
    pub hmac_key: Zeroizing<Vec<u8>>,
    /// Absent until the owner's key is in SSM: Zernio calls answer
    /// `provider_not_configured` until then.
    pub zernio_key: Option<Zeroizing<String>>,
    pub webhook_secrets: Vec<Vec<u8>>,
    /// Absent until the admin creates it: the ops function answers unavailable.
    pub ops_key: Option<Zeroizing<Vec<u8>>>,
}

/// Turns the SSM map into secrets, with fixed codes for what is missing.
pub fn secrets_from(
    mut found: HashMap<String, Zeroizing<String>>,
) -> Result<Secrets, &'static str> {
    let db_url = found
        .remove(PARAM_WORKER_DB_URL)
        .ok_or("SSM_WORKER_DB_URL_MISSING")?;
    let hmac = found.remove(PARAM_HMAC_KEY).ok_or("SSM_HMAC_KEY_MISSING")?;
    if hmac.len() < MIN_HMAC_KEY_BYTES {
        return Err("SSM_HMAC_KEY_TOO_SHORT");
    }
    let zernio_key = found
        .remove(PARAM_ZERNIO_KEY)
        .filter(|k| k.starts_with("sk_") || k.starts_with("zrk_"));
    let webhook_secrets = [PARAM_WEBHOOK_SECRET, PARAM_WEBHOOK_SECRET_PREVIOUS]
        .iter()
        .filter_map(|n| found.remove(*n))
        .filter(|s| s.len() >= MIN_HMAC_KEY_BYTES)
        .map(|s| s.as_bytes().to_vec())
        .collect();
    let ops_key = found
        .remove(PARAM_OPS_KEY)
        .filter(|k| k.len() >= MIN_HMAC_KEY_BYTES)
        .map(|k| Zeroizing::new(k.as_bytes().to_vec()));
    Ok(Secrets {
        db_url,
        hmac_key: Zeroizing::new(hmac.as_bytes().to_vec()),
        zernio_key,
        webhook_secrets,
        ops_key,
    })
}

fn credentials() -> Option<Credentials> {
    let id = std::env::var("AWS_ACCESS_KEY_ID").ok()?;
    let secret = std::env::var("AWS_SECRET_ACCESS_KEY").ok()?;
    let token = std::env::var("AWS_SESSION_TOKEN").ok();
    Some(Credentials::new(id, secret, token, None, "lambda-env"))
}

fn unavailable(code: &str) -> PublishError {
    PublishError::new(ErrorClass::Temporary, code)
}

/// Streams objects from our private media bucket with a SigV4-signed GET.
pub struct S3Opener {
    pub http: reqwest::Client,
    pub bucket: String,
    pub region: String,
}

struct S3Media {
    http: reqwest::Client,
    bucket: String,
    region: String,
    video: (String, MediaMeta),
    cover: Option<(String, MediaMeta)>,
}

impl MediaOpener for S3Opener {
    fn open(
        &self,
        video_key: &str,
        video: &MediaMeta,
        cover: Option<(&str, &MediaMeta)>,
    ) -> Box<dyn MediaSource> {
        Box::new(S3Media {
            http: self.http.clone(),
            bucket: self.bucket.clone(),
            region: self.region.clone(),
            video: (video_key.to_owned(), video.clone()),
            cover: cover.map(|(k, m)| (k.to_owned(), m.clone())),
        })
    }
}

/// Keys are written by us (`clips/<uuid>/<clip>/<sha>.<ext>`); refuse anything
/// else so nothing can be read outside the prefix.
fn key_ok(key: &str) -> bool {
    key.starts_with("clips/")
        && !key.contains("..")
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/._-".contains(&b))
}

#[async_trait]
impl MediaSource for S3Media {
    async fn open(&self, kind: MediaKind) -> Result<MediaBody> {
        let (key, meta) = match kind {
            MediaKind::Video => &self.video,
            MediaKind::Cover => self
                .cover
                .as_ref()
                .ok_or_else(|| PublishError::new(ErrorClass::Rejected, "cover_missing"))?,
        };
        if !key_ok(key) {
            return Err(PublishError::new(ErrorClass::Bug, "bad_media_key"));
        }
        let url = format!(
            "https://{}.s3.{}.amazonaws.com/{key}",
            self.bucket, self.region
        );
        let identity = credentials()
            .ok_or_else(|| unavailable("aws_env_missing"))?
            .into();
        let mut settings = SigningSettings::default();
        settings.payload_checksum_kind = PayloadChecksumKind::XAmzSha256;
        let params = v4::SigningParams::builder()
            .identity(&identity)
            .region(&self.region)
            .name("s3")
            .time(SystemTime::now())
            .settings(settings)
            .build()
            .map_err(|_| unavailable("sign_failed"))?
            .into();
        let signable = SignableRequest::new(
            "GET",
            &url,
            std::iter::empty(),
            SignableBody::UnsignedPayload,
        )
        .map_err(|_| unavailable("sign_failed"))?;
        let (instructions, _) = sign(signable, &params)
            .map_err(|_| unavailable("sign_failed"))?
            .into_parts();
        let mut req = self.http.get(&url);
        for (k, v) in instructions.headers() {
            req = req.header(k, v);
        }
        let resp = req
            .send()
            .await
            .map_err(|_| unavailable("media_unreachable"))?;
        if !resp.status().is_success() {
            // Most likely the CLI never finished the upload.
            return Err(PublishError::new(ErrorClass::Rejected, "media_missing"));
        }
        let filename = key.rsplit('/').next().unwrap_or("media").to_owned();
        let body = resp.bytes_stream().map_err(std::io::Error::other);
        Ok(MediaBody {
            meta: meta.clone(),
            filename,
            body: Box::pin(body),
        })
    }
}

/// The team-wide Zernio limit, shared by every Lambda instance through
/// Postgres (design §5.6). It uses its own connection.
pub struct PgLimiter {
    pub url: Zeroizing<String>,
    pub per_minute: u32,
    pub store: Mutex<Option<Arc<Store>>>,
}

impl PgLimiter {
    pub fn new(url: Zeroizing<String>, per_minute: u32) -> Self {
        Self {
            url,
            per_minute,
            store: Mutex::new(None),
        }
    }
}

#[async_trait]
impl Limiter for PgLimiter {
    async fn acquire(&self) -> Result<()> {
        let store = {
            let mut slot = self.store.lock().await;
            if slot.is_none() {
                *slot = oauth_connect::db::connect(&self.url)
                    .await
                    .ok()
                    .map(|c| Arc::new(Store::new(c)));
            }
            slot.clone()
                .ok_or_else(|| unavailable("limiter_unavailable"))?
        };
        match store
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
            Err(_) => Err(unavailable("limiter_unavailable")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, Zeroizing<String>> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), Zeroizing::new(v.to_string())))
            .collect()
    }

    #[test]
    fn secrets_need_the_db_url_and_a_long_hmac_key() {
        let long = "k".repeat(32);
        assert_eq!(
            secrets_from(map(&[(PARAM_HMAC_KEY, &long)])).err(),
            Some("SSM_WORKER_DB_URL_MISSING")
        );
        assert_eq!(
            secrets_from(map(&[
                (PARAM_WORKER_DB_URL, "postgres://x"),
                (PARAM_HMAC_KEY, "short")
            ]))
            .err(),
            Some("SSM_HMAC_KEY_TOO_SHORT")
        );
        let s = secrets_from(map(&[
            (PARAM_WORKER_DB_URL, "postgres://x"),
            (PARAM_HMAC_KEY, &long),
        ]))
        .unwrap();
        assert!(
            s.zernio_key.is_none(),
            "the function starts before the key exists"
        );
        assert!(s.webhook_secrets.is_empty());
    }

    #[test]
    fn only_zernio_shaped_keys_and_long_webhook_secrets_are_used() {
        let long = "k".repeat(32);
        let s = secrets_from(map(&[
            (PARAM_WORKER_DB_URL, "postgres://x"),
            (PARAM_HMAC_KEY, &long),
            (PARAM_ZERNIO_KEY, "not-a-key"),
            (PARAM_WEBHOOK_SECRET, &long),
            (PARAM_WEBHOOK_SECRET_PREVIOUS, "short"),
        ]))
        .unwrap();
        assert!(s.zernio_key.is_none());
        assert_eq!(s.webhook_secrets.len(), 1);
    }

    #[test]
    fn media_keys_stay_under_clips() {
        assert!(key_ok(
            "clips/0f8fad5b-d9cb-469f-a165-70867728950e/clip-1/ab.mp4"
        ));
        for bad in [
            "packages/x.zip",
            "clips/../packages/x.zip",
            "clips/a b.mp4",
            "clips/x?y",
        ] {
            assert!(!key_ok(bad), "{bad}");
        }
    }
}
