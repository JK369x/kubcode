//! Zernio webhooks (design §5.4). `X-Zernio-Signature` is the lowercase hex
//! HMAC-SHA256 of the raw body with our endpoint secret. Zernio signs no
//! timestamp, so replays are stopped by the store: unique event id plus the
//! body hash.

use hmac::{Hmac, Mac};
use kubcode_publishing::domain::{ProviderKind, ProviderRef};
use kubcode_publishing::errors::{ErrorClass, ErrorCode, PublishError};
use kubcode_publishing::events::{
    EventSource, Headers, IncomingComment, ProviderEvent, VerifiedDelivery,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use zeroize::Zeroizing;

use crate::parse::platform_error_code;

pub const MAX_BODY: usize = 1024 * 1024;

type HmacSha256 = Hmac<Sha256>;

/// Hex HMAC-SHA256, as Zernio sends it. Also used by the register script and tests.
pub fn sign(secret: &[u8], raw: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC takes any key length");
    mac.update(raw);
    hex::encode(mac.finalize().into_bytes())
}

/// The digest in a signature header. Zernio sends lowercase hex today (seen
/// on real deliveries); the spec does not fix the encoding, so an optional
/// `sha256=` prefix and base64 are accepted too.
fn digest_of(header: &str) -> Option<Vec<u8>> {
    use base64::Engine as _;
    let v = header.trim();
    let v = v.strip_prefix("sha256=").unwrap_or(v);
    if v.len() == 64 {
        if let Ok(d) = hex::decode(v.to_ascii_lowercase()) {
            return Some(d);
        }
    }
    base64::engine::general_purpose::STANDARD
        .decode(v)
        .ok()
        .filter(|d| d.len() == 32)
}

/// Constant-time check against each secret (current first, then the previous
/// one during a rotation).
pub fn signature_matches<S: AsRef<[u8]>>(secrets: &[S], header: &str, raw: &[u8]) -> bool {
    let Some(given) = digest_of(header) else {
        return false;
    };
    secrets.iter().any(|secret| {
        let mut mac =
            HmacSha256::new_from_slice(secret.as_ref()).expect("HMAC takes any key length");
        mac.update(raw);
        mac.verify_slice(&given).is_ok()
    })
}

pub struct ZernioEvents {
    secrets: Vec<Zeroizing<Vec<u8>>>,
}

impl ZernioEvents {
    pub fn new(secrets: Vec<Vec<u8>>) -> Self {
        Self {
            secrets: secrets.into_iter().map(Zeroizing::new).collect(),
        }
    }
}

fn rejected(code: &str) -> PublishError {
    PublishError::new(ErrorClass::Rejected, code)
}

fn s(v: &Value, ptr: &str) -> Option<String> {
    v.pointer(ptr)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

fn code(c: &str) -> ErrorCode {
    ErrorCode::new(c).expect("adapter codes are valid")
}

impl EventSource for ZernioEvents {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Zernio
    }

    fn verify(&self, headers: &Headers, raw: &[u8]) -> Result<VerifiedDelivery, PublishError> {
        if raw.len() > MAX_BODY {
            return Err(rejected("body_too_large"));
        }
        let Some(sig) = headers.get("x-zernio-signature") else {
            return Err(rejected("bad_signature"));
        };
        let secrets: Vec<&[u8]> = self.secrets.iter().map(|s| s.as_slice()).collect();
        if !signature_matches(&secrets, sig, raw) {
            return Err(rejected("bad_signature"));
        }
        let body: Value = serde_json::from_slice(raw).map_err(|_| rejected("bad_body"))?;
        let body_sha256: [u8; 32] = Sha256::digest(raw).into();
        // Identity and meaning come only from the signed body: headers are
        // not covered by the signature, so a replayed body with a new
        // X-Zernio-Event-Id must still dedupe. No id → the body hash.
        let event_id =
            s(&body, "/id").unwrap_or_else(|| format!("sha256:{}", hex::encode(body_sha256)));
        let event_type = s(&body, "/event").ok_or_else(|| rejected("bad_body"))?;
        Ok(VerifiedDelivery {
            event_id,
            body_sha256,
            event_type,
            body,
        })
    }

    fn translate(&self, d: &VerifiedDelivery) -> Vec<ProviderEvent> {
        let b = &d.body;
        let post = || {
            s(b, "/post/id")
                .or_else(|| s(b, "/post/_id"))
                .map(ProviderRef)
        };
        let account = || s(b, "/account/accountId").map(ProviderRef);
        let ignored = || {
            vec![ProviderEvent::Ignored {
                event_type: d.event_type.clone(),
            }]
        };
        let event = match d.event_type.as_str() {
            // TikTok reports its video id and URL late, as their own event
            // with the post.platform.published shape (OpenAPI
            // post.tiktok.url_resolved); the store fills the receipt then.
            "post.platform.published" | "post.published" | "post.tiktok.url_resolved" => post()
                .map(|post| {
                    // The `platform` object on post.platform.*; the first entry on post.*.
                    let p = b
                        .get("platform")
                        .filter(|v| v.is_object())
                        .or_else(|| b.pointer("/post/platforms/0"));
                    let field = |k: &str| p.and_then(|p| p.get(k)?.as_str()).map(str::to_owned);
                    ProviderEvent::PostPublished {
                        post,
                        platform_post_id: field("platformPostId"),
                        url: field("publishedUrl").or_else(|| field("platformPostUrl")),
                        at: s(b, "/post/publishedAt")
                            .and_then(|t| OffsetDateTime::parse(&t, &Rfc3339).ok()),
                    }
                }),
            "post.platform.failed" | "post.failed" => post().map(|post| {
                let category = s(b, "/platform/errorCategory")
                    .or_else(|| s(b, "/post/platforms/0/errorCategory"));
                ProviderEvent::PostFailed {
                    post,
                    code: code(&platform_error_code(category.as_deref())),
                }
            }),
            "comment.received" => (|| {
                let c = b.get("comment")?;
                let field = |k: &str| {
                    c.get(k)?
                        .as_str()
                        .filter(|v| !v.is_empty())
                        .map(str::to_owned)
                };
                Some(ProviderEvent::CommentReceived(IncomingComment {
                    account: s(b, "/account/accountId")
                        .or_else(|| s(b, "/account/id"))
                        .map(ProviderRef)?,
                    comment_id: field("id")?,
                    platform_post_id: field("platformPostId")?,
                    author_id: s(c, "/author/id")?,
                    own_account: c.pointer("/author/isOwnAccount").and_then(|v| v.as_bool())
                        == Some(true),
                    is_reply: c.get("isReply").and_then(|v| v.as_bool()) == Some(true),
                    created_at: field("createdAt")
                        .and_then(|t| OffsetDateTime::parse(&t, &Rfc3339).ok()),
                    text: c
                        .get("text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_owned(),
                }))
            })(),
            "account.connected" => {
                account().map(|account| ProviderEvent::AccountConnected { account })
            }
            "account.disconnected" => account().map(|account| {
                let intentional =
                    s(b, "/account/disconnectionType").as_deref() == Some("intentional");
                ProviderEvent::AccountLost {
                    account,
                    code: code(if intentional {
                        "account_disconnected"
                    } else {
                        "account_lost"
                    }),
                }
            }),
            _ => None,
        };
        event.map(|e| vec![e]).unwrap_or_else(ignored)
    }
}
