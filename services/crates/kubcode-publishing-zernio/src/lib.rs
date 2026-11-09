//! Zernio adapter for the publishing core (docs/design/publishing-core.md §5).
//! Zernio ids live only inside this crate and the `provider_ref` columns.

pub mod errors;
pub mod events;
pub mod limiter;
pub mod parse;
pub mod transport;

use std::sync::Arc;

use async_trait::async_trait;
use kubcode_publishing::domain::{MediaKind, Platform, ProviderKind, ProviderRef, Visibility};
use kubcode_publishing::errors::{ErrorClass, PublishError, Result};
use kubcode_publishing::ports::{
    CallbackParams, Checked, ConnectProvider, ConnectStart, ConnectedAccount, ConnectionHealth,
    ConnectionRef, DeliveryState, MediaSource, Publisher, WorkspaceCtx,
};
use kubcode_publishing::validate::{DeliveryDraft, Violation};
use serde_json::{json, Value};
use time::format_description::well_known::Rfc3339;
use time::UtcOffset;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::errors::map_error;
use crate::limiter::Limiter;
use crate::transport::{HttpRequest, Method, RequestBody, Transport};

/// Zernio's documented production base.
pub const PRODUCTION_BASE: &str = "https://zernio.com/api";
/// Our callback must be on our own domain (no open redirect through Zernio).
const CALLBACK_PREFIX: &str = "https://kubcode.dev/";
/// Zernio's presign cap for every media type.
const PROVIDER_MAX_BYTES: u64 = 5 * 1024 * 1024 * 1024;

pub struct ZernioConfig {
    pub base_url: String,
    pub api_key: String,
}

pub struct Zernio {
    base: String,
    key: Zeroizing<String>,
    transport: Arc<dyn Transport>,
    limiter: Arc<dyn Limiter>,
}

fn e(class: ErrorClass, code: &str) -> PublishError {
    PublishError::new(class, code)
}

fn bad_response() -> PublishError {
    e(ErrorClass::Bug, "zernio_bad_response")
}

/// Zernio's name for a platform (X is "twitter" in Zernio's quickstart).
fn platform_name(p: Platform) -> &'static str {
    match p {
        Platform::X => "twitter",
        other => other.as_str(),
    }
}

/// Ids go into URL paths, so only plain id characters are accepted.
fn path_id(r: &ProviderRef) -> Result<&str> {
    let ok = (1..=64).contains(&r.0.len())
        && r.0
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    if ok {
        Ok(&r.0)
    } else {
        Err(e(ErrorClass::Bug, "bad_provider_ref"))
    }
}

struct Reply {
    status: u16,
    retry_after: Option<u32>,
    body: Value,
}

impl Zernio {
    pub fn new(
        cfg: ZernioConfig,
        transport: Arc<dyn Transport>,
        limiter: Arc<dyn Limiter>,
    ) -> Self {
        Self {
            base: cfg.base_url.trim_end_matches('/').to_owned(),
            key: Zeroizing::new(cfg.api_key),
            transport,
            limiter,
        }
    }

    fn url(&self, path: &str, query: &[(&str, &str)]) -> String {
        let mut url = format!("{}{path}", self.base);
        if !query.is_empty() {
            let q = url::form_urlencoded::Serializer::new(String::new())
                .extend_pairs(query)
                .finish();
            url.push('?');
            url.push_str(&q);
        }
        url
    }

    async fn send(
        &self,
        method: Method,
        url: String,
        body: Option<&Value>,
        idempotency_key: Option<&str>,
    ) -> Result<Reply> {
        self.limiter.acquire().await?;
        let mut headers = vec![("authorization".to_owned(), format!("Bearer {}", *self.key))];
        if let Some(k) = idempotency_key {
            headers.push(("idempotency-key".into(), k.to_owned()));
        }
        let body = match body {
            Some(v) => RequestBody::Json(serde_json::to_vec(v).expect("json")),
            None => RequestBody::Empty,
        };
        let resp = self
            .transport
            .send(HttpRequest {
                method,
                url,
                headers,
                body,
            })
            .await
            .map_err(|_| e(ErrorClass::Temporary, "provider_unreachable"))?;
        let retry_after = resp
            .header("retry-after")
            .and_then(|v| v.trim().parse::<u32>().ok());
        let body = if resp.body.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&resp.body).unwrap_or(Value::Null)
        };
        Ok(Reply {
            status: resp.status,
            retry_after,
            body,
        })
    }

    /// A call whose only success is 2xx.
    async fn call(
        &self,
        method: Method,
        url: String,
        body: Option<&Value>,
        idempotency_key: Option<&str>,
    ) -> Result<Value> {
        let r = self.send(method, url, body, idempotency_key).await?;
        if (200..300).contains(&r.status) {
            Ok(r.body)
        } else {
            Err(map_error(r.status, r.retry_after, &r.body))
        }
    }

    /// One Zernio profile per workspace, found again by `externalId` if our
    /// stored ref was lost.
    async fn ensure_profile(&self, ws: &WorkspaceCtx) -> Result<ProviderRef> {
        if let Some(p) = &ws.profile {
            return Ok(p.clone());
        }
        let external = ws.workspace.0.to_string();
        let name = format!("kubcode-{}", &ws.workspace.0.simple().to_string()[..8]);
        let body = json!({"name": name, "externalId": external});
        let r = self
            .send(
                Method::Post,
                self.url("/v1/profiles", &[]),
                Some(&body),
                Some(&external),
            )
            .await?;
        let id = match r.status {
            200..=299 => parse::profile_id(&r.body),
            409 if r.body.get("code").and_then(Value::as_str)
                == Some("profile_external_id_conflict") =>
            {
                match parse::conflicting_profile_id(&r.body) {
                    Some(id) => Some(id),
                    None => {
                        let list = self
                            .call(
                                Method::Get,
                                self.url("/v1/profiles", &[("externalId", &external)]),
                                None,
                                None,
                            )
                            .await?;
                        parse::profile_id(&list)
                    }
                }
            }
            _ => return Err(map_error(r.status, r.retry_after, &r.body)),
        };
        id.map(ProviderRef).ok_or_else(bad_response)
    }

    async fn upload(&self, media: &dyn MediaSource, kind: MediaKind) -> Result<String> {
        let m = media.open(kind).await?;
        let presign = self
            .call(
                Method::Post,
                self.url("/v1/media/presign", &[]),
                Some(&json!({
                    "filename": m.filename,
                    "contentType": m.meta.content_type,
                    "size": m.meta.bytes,
                })),
                None,
            )
            .await?;
        let p = parse::presign(&presign).ok_or_else(bad_response)?;
        let resp = self
            .transport
            .send(HttpRequest {
                method: Method::Put,
                url: p.upload_url,
                headers: vec![("content-type".into(), m.meta.content_type.clone())],
                body: RequestBody::Stream {
                    stream: m.body,
                    len: m.meta.bytes,
                },
            })
            .await
            .map_err(|_| e(ErrorClass::Temporary, "upload_failed"))?;
        if !(200..300).contains(&resp.status) {
            return Err(e(ErrorClass::Temporary, "upload_failed"));
        }
        Ok(p.public_url)
    }

    fn post_body(
        conn: &ConnectionRef,
        d: &DeliveryDraft,
        platform: &str,
        video_url: &str,
        cover_url: Option<&str>,
    ) -> Value {
        let scheduled = d
            .publish_at
            .to_offset(UtcOffset::UTC)
            .format(&Rfc3339)
            .expect("RFC 3339 formats any UTC time");
        let mut media = json!({"type": "video", "url": video_url});
        let psd = match d.platform {
            Platform::YouTube => {
                if let Some(c) = cover_url {
                    media["thumbnail"] = json!(c);
                }
                json!({
                    "title": d.title,
                    "visibility": d.visibility.as_str(),
                    "categoryId": "22",
                    "madeForKids": false,
                })
            }
            Platform::Instagram => json!({
                "instagramThumbnail": cover_url,
                "shareToFeed": true,
            }),
            _ => json!({}),
        };
        let mut body = json!({
            "content": d.description,
            "mediaItems": [media],
            "platforms": [{
                "platform": platform,
                "accountId": conn.account.0,
                "platformSpecificData": psd,
            }],
            "scheduledFor": scheduled,
            "timezone": "UTC",
        });
        if d.platform == Platform::YouTube && !d.tags.is_empty() {
            body["tags"] = json!(d.tags);
        }
        body
    }
}

#[async_trait]
impl ConnectProvider for Zernio {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Zernio
    }

    async fn start(
        &self,
        ws: &WorkspaceCtx,
        platform: Platform,
        callback_url: &str,
    ) -> Result<ConnectStart> {
        if !callback_url.starts_with(CALLBACK_PREFIX) {
            return Err(e(ErrorClass::Bug, "bad_callback_url"));
        }
        let name = platform_name(platform);
        let profile = self.ensure_profile(ws).await?;
        let resp = self
            .call(
                Method::Get,
                self.url(
                    &format!("/v1/connect/{name}"),
                    &[
                        ("profileId", &profile.0),
                        ("redirect_url", callback_url),
                        ("headless", "true"),
                    ],
                ),
                None,
                None,
            )
            .await?;
        let auth_url = parse::auth_url(&resp).ok_or_else(bad_response)?;
        Ok(ConnectStart { auth_url, profile })
    }

    async fn complete(
        &self,
        profile: &ProviderRef,
        platform: Platform,
        cb: &CallbackParams,
    ) -> Result<ConnectedAccount> {
        let rejected = |code| e(ErrorClass::Rejected, code);
        if cb.get("error").is_some() {
            return Err(rejected("connect_denied"));
        }
        // Headless flows that need a page/org choice (Facebook, LinkedIn) are
        // not wired yet; they come back without an account id.
        let account_id = cb
            .get("accountId")
            .ok_or_else(|| rejected("connect_incomplete"))?;
        if cb.get("profileId").is_some_and(|p| p != profile.0) {
            return Err(rejected("account_not_in_profile"));
        }
        // Never trust the query: the account must be in our profile.
        let list = self
            .call(
                Method::Get,
                self.url("/v1/accounts", &[("profileId", &profile.0)]),
                None,
                None,
            )
            .await?;
        let acct = parse::accounts(&list)
            .into_iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| rejected("account_not_in_profile"))?;
        // Fail closed: an account without a profile id is not proven ours.
        if acct.profile_id.as_deref() != Some(profile.0.as_str()) {
            return Err(rejected("account_not_in_profile"));
        }
        if acct.platform != platform_name(platform) {
            return Err(rejected("platform_mismatch"));
        }
        if !acct.active {
            return Err(rejected("account_inactive"));
        }
        let display_name = acct
            .display_name
            .clone()
            .or_else(|| acct.username.clone())
            .unwrap_or_else(|| platform.as_str().to_owned());
        Ok(ConnectedAccount {
            account: ProviderRef(acct.id),
            platform,
            display_name,
            handle: acct.username,
            platform_account_id: acct.platform_user_id,
        })
    }

    async fn disconnect(&self, conn: &ConnectionRef) -> Result<()> {
        let id = path_id(&conn.account)?;
        match self
            .call(
                Method::Delete,
                self.url(&format!("/v1/accounts/{id}"), &[]),
                None,
                None,
            )
            .await
        {
            Ok(_) => Ok(()),
            Err(err) if err.class == ErrorClass::NotFound => Ok(()),
            Err(err) if err.code.as_str() == "account_not_found" => Ok(()),
            Err(err) => Err(err),
        }
    }

    async fn health(&self, profile: &ProviderRef) -> Result<Vec<ConnectionHealth>> {
        let resp = self
            .call(
                Method::Get,
                self.url("/v1/accounts/health", &[("profileId", &profile.0)]),
                None,
                None,
            )
            .await?;
        Ok(parse::health(&resp)
            .into_iter()
            .map(|(id, status)| ConnectionHealth {
                account: ProviderRef(id),
                status,
            })
            .collect())
    }
}

#[async_trait]
impl Publisher for Zernio {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Zernio
    }

    fn validate(&self, d: &DeliveryDraft) -> Vec<Violation> {
        let mut v = Vec::new();
        if d.video.bytes > PROVIDER_MAX_BYTES {
            v.push(Violation {
                code: "provider_video_too_large",
            });
        }
        if d.visibility != Visibility::Public && d.platform != Platform::YouTube {
            v.push(Violation {
                code: "provider_visibility_unsupported",
            });
        }
        v
    }

    async fn schedule(
        &self,
        conn: &ConnectionRef,
        delivery: &Checked,
        media: &dyn MediaSource,
    ) -> Result<ProviderRef> {
        let req = delivery.request();
        let d = &req.draft;
        let name = platform_name(d.platform);
        let video_url = self.upload(media, MediaKind::Video).await?;
        let cover_url = match d.cover {
            Some(_) => Some(self.upload(media, MediaKind::Cover).await?),
            None => None,
        };
        let body = Self::post_body(conn, d, name, &video_url, cover_url.as_deref());
        let key: Uuid = req.idempotency_key;
        let resp = self
            .call(
                Method::Post,
                self.url("/v1/posts", &[]),
                Some(&body),
                Some(&key.to_string()),
            )
            .await?;
        let (id, _) = parse::post_state(&resp).ok_or_else(bad_response)?;
        Ok(ProviderRef(id))
    }

    async fn cancel(&self, _conn: &ConnectionRef, post: &ProviderRef) -> Result<()> {
        let id = path_id(post)?;
        match self
            .call(
                Method::Delete,
                self.url(&format!("/v1/posts/{id}"), &[]),
                None,
                None,
            )
            .await
        {
            Ok(_) => Ok(()),
            Err(err) if err.class == ErrorClass::NotFound => Ok(()),
            Err(err) if err.code.as_str() == "invalid_state" => {
                Err(e(ErrorClass::Rejected, "already_published"))
            }
            Err(err) => Err(err),
        }
    }

    async fn status(&self, _conn: &ConnectionRef, post: &ProviderRef) -> Result<DeliveryState> {
        let id = path_id(post)?;
        let resp = self
            .call(
                Method::Get,
                self.url(&format!("/v1/posts/{id}"), &[]),
                None,
                None,
            )
            .await?;
        parse::post_state(&resp)
            .map(|(_, st)| st)
            .ok_or_else(bad_response)
    }
}
