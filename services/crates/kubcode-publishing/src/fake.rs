//! In-memory provider for unit tests of the core and the Lambda handlers. It
//! passes the same contract suite as the real adapters (tests/contract_fake.rs).

use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;
use bytes::Bytes;
use time::macros::datetime;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::contract::{ConnectHarness, EventHarness, Fault, PublisherHarness};
use crate::domain::{
    ConnectionStatus, DeliveryStatus, MediaKind, MediaMeta, Platform, ProviderKind, ProviderRef,
};
use crate::errors::{ErrorClass, ErrorCode, PublishError, Result};
use crate::events::{EventSource, Headers, IncomingComment, ProviderEvent, VerifiedDelivery};
use crate::ports::{
    Accepted, CallbackParams, Checked, ConnectProvider, ConnectStart, ConnectedAccount,
    ConnectionHealth, ConnectionRef, DeliveryState, Inbox, MediaBody, MediaSource, PrivateReply,
    Publisher, WorkspaceCtx,
};
use crate::validate::{DeliveryDraft, Violation};

const SIGNATURE_HEADER: &str = "x-fake-signature";

#[derive(Default)]
struct State {
    profiles: HashMap<Uuid, ProviderRef>,
    accounts: HashMap<ProviderRef, (ProviderRef, Platform, bool)>,
    posts: HashMap<ProviderRef, DeliveryStatus>,
    keys: HashMap<Uuid, ProviderRef>,
    fault: Option<Fault>,
    reject_title: Option<String>,
    /// The state the next new schedule reports instead of `Scheduled`.
    next_state: Option<DeliveryState>,
    /// Inbox calls: (kind, post, comment, text).
    inbox: Vec<(String, String, String, String)>,
    /// The next private replies' outcomes (default Sent).
    next_private: std::collections::VecDeque<PrivateReply>,
    next: u64,
}

fn plain(status: DeliveryStatus) -> DeliveryState {
    DeliveryState {
        status,
        platform_post_id: None,
        platform_url: None,
        error: None,
    }
}

pub struct FakeProvider {
    state: Mutex<State>,
    secret: String,
}

impl Default for FakeProvider {
    fn default() -> Self {
        Self {
            state: Mutex::default(),
            secret: "fake-secret".into(),
        }
    }
}

fn rejected(code: &str) -> PublishError {
    PublishError::new(ErrorClass::Rejected, code)
}

impl FakeProvider {
    fn with<T>(&self, f: impl FnOnce(&mut State) -> T) -> T {
        f(&mut self.state.lock().expect("fake state"))
    }

    fn fresh(&self, prefix: &str) -> ProviderRef {
        self.with(|s| {
            s.next += 1;
            ProviderRef(format!("{prefix}-{}", s.next))
        })
    }

    /// Makes the adapter-level `validate` refuse titles containing `word`.
    pub fn reject_titles_containing(&self, word: &str) {
        self.with(|s| s.reject_title = Some(word.to_owned()));
    }

    pub fn inject(&self, fault: Fault) {
        self.with(|s| s.fault = Some(fault));
    }

    /// The next private reply answers `outcome` instead of `Sent`.
    pub fn answer_next_private(&self, outcome: PrivateReply) {
        self.with(|s| s.next_private.push_back(outcome));
    }

    /// Every inbox call so far: (kind, post, comment, text).
    pub fn inbox_calls(&self) -> Vec<(String, String, String, String)> {
        self.with(|s| s.inbox.clone())
    }

    /// The next new schedule reports `state` (e.g. an inline failure).
    pub fn answer_next_schedule(&self, state: DeliveryState) {
        self.with(|s| s.next_state = Some(state));
    }

    /// Adds an account to `profile` as if the creator approved the consent.
    pub fn add_account(&self, profile: &ProviderRef, platform: Platform) -> ProviderRef {
        let account = self.fresh("acct");
        self.with(|s| {
            s.accounts
                .insert(account.clone(), (profile.clone(), platform, true))
        });
        account
    }

    pub fn post_count(&self) -> usize {
        self.with(|s| s.posts.len())
    }

    pub fn set_post_status(&self, post: &ProviderRef, status: DeliveryStatus) {
        self.with(|s| s.posts.insert(post.clone(), status));
    }

    /// A signed webhook body, the way the fake "provider" would send it.
    pub fn signed(&self, body: serde_json::Value) -> (Headers, Vec<u8>) {
        let raw = serde_json::to_vec(&body).expect("json");
        (self.sign_with(&self.secret, &raw), raw)
    }

    fn sign_with(&self, secret: &str, raw: &[u8]) -> Headers {
        Headers(vec![(
            SIGNATURE_HEADER.into(),
            format!("{secret}:{:016x}", fnv1a(raw)),
        )])
    }

    fn take_fault(&self) -> Option<PublishError> {
        self.with(|s| s.fault.take()).map(|f| match f {
            Fault::TokenExpired => PublishError::new(ErrorClass::NeedsReconnect, "token_expired"),
            Fault::RateLimited { retry_after_secs } => {
                PublishError::new(ErrorClass::RateLimited { retry_after_secs }, "rate_limited")
            }
            Fault::ServerError => PublishError::new(ErrorClass::Temporary, "provider_unavailable"),
            Fault::Billing => PublishError::new(ErrorClass::ProviderBilling, "payment_required"),
        })
    }
}

fn fnv1a(raw: &[u8]) -> u64 {
    raw.iter().fold(0xcbf2_9ce4_8422_2325, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3)
    })
}

#[async_trait]
impl ConnectProvider for FakeProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Zernio
    }

    async fn start(
        &self,
        ws: &WorkspaceCtx,
        platform: Platform,
        _callback_url: &str,
    ) -> Result<ConnectStart> {
        let profile = match &ws.profile {
            Some(p) => p.clone(),
            None => match self.with(|s| s.profiles.get(&ws.workspace.0).cloned()) {
                Some(p) => p,
                None => {
                    let p = self.fresh("profile");
                    self.with(|s| s.profiles.insert(ws.workspace.0, p.clone()));
                    p
                }
            },
        };
        Ok(ConnectStart {
            auth_url: format!("https://fake.example/connect/{}", platform.as_str()),
            profile,
        })
    }

    async fn complete(
        &self,
        profile: &ProviderRef,
        platform: Platform,
        cb: &CallbackParams,
    ) -> Result<ConnectedAccount> {
        if cb.get("error").is_some() {
            return Err(rejected("connect_denied"));
        }
        let account = ProviderRef(cb.get("accountId").unwrap_or_default().to_owned());
        let Some((p, plat, _)) = self.with(|s| s.accounts.get(&account).cloned()) else {
            return Err(rejected("account_not_in_profile"));
        };
        if &p != profile {
            return Err(rejected("account_not_in_profile"));
        }
        if plat != platform {
            return Err(rejected("platform_mismatch"));
        }
        Ok(ConnectedAccount {
            account,
            platform,
            display_name: "Fake channel".into(),
            handle: Some("fake".into()),
            platform_account_id: None,
        })
    }

    async fn disconnect(&self, conn: &ConnectionRef) -> Result<()> {
        self.with(|s| {
            if let Some(a) = s.accounts.get_mut(&conn.account) {
                a.2 = false;
            }
        });
        Ok(())
    }

    async fn health(&self, profile: &ProviderRef) -> Result<Vec<ConnectionHealth>> {
        Ok(self.with(|s| {
            s.accounts
                .iter()
                .filter(|(_, (p, _, _))| p == profile)
                .map(|(a, (_, _, active))| ConnectionHealth {
                    account: a.clone(),
                    status: if *active {
                        ConnectionStatus::Active
                    } else {
                        ConnectionStatus::Revoked
                    },
                })
                .collect()
        }))
    }
}

#[async_trait]
impl Publisher for FakeProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Zernio
    }

    fn validate(&self, draft: &DeliveryDraft) -> Vec<Violation> {
        match self.with(|s| s.reject_title.clone()) {
            Some(w) if draft.title.contains(&w) => vec![Violation {
                code: "fake_title_rejected",
            }],
            _ => Vec::new(),
        }
    }

    async fn schedule(
        &self,
        _conn: &ConnectionRef,
        delivery: &Checked,
        media: &dyn MediaSource,
    ) -> Result<Accepted> {
        if let Some(e) = self.take_fault() {
            return Err(e);
        }
        let key = delivery.request().idempotency_key;
        if let Some(post) = self.with(|s| s.keys.get(&key).cloned()) {
            let status = self.with(|s| s.posts[&post]);
            return Ok(Accepted {
                post,
                state: plain(status),
            });
        }
        media.open(MediaKind::Video).await?;
        media.open(MediaKind::Cover).await?;
        let post = self.fresh("post");
        let state = self
            .with(|s| s.next_state.take())
            .unwrap_or_else(|| plain(DeliveryStatus::Scheduled));
        self.with(|s| {
            s.keys.insert(key, post.clone());
            s.posts.insert(post.clone(), state.status);
        });
        Ok(Accepted { post, state })
    }

    async fn cancel(&self, _conn: &ConnectionRef, post: &ProviderRef) -> Result<()> {
        self.with(|s| {
            if let Some(st) = s.posts.get_mut(post) {
                *st = DeliveryStatus::Cancelled;
            }
        });
        Ok(())
    }

    async fn status(&self, _conn: &ConnectionRef, post: &ProviderRef) -> Result<DeliveryState> {
        let Some(status) = self.with(|s| s.posts.get(post).copied()) else {
            return Err(PublishError::new(ErrorClass::NotFound, "post_not_found"));
        };
        let published = status == DeliveryStatus::Published;
        Ok(DeliveryState {
            status,
            platform_post_id: published.then(|| "fake-platform-id".into()),
            platform_url: published.then(|| "https://fake.example/p".into()),
            error: None,
        })
    }
}

impl EventSource for FakeProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Zernio
    }

    fn verify(&self, headers: &Headers, raw: &[u8]) -> Result<VerifiedDelivery> {
        let expected = self.sign_with(&self.secret, raw);
        if headers.get(SIGNATURE_HEADER) != expected.get(SIGNATURE_HEADER) {
            return Err(rejected("bad_signature"));
        }
        let body: serde_json::Value =
            serde_json::from_slice(raw).map_err(|_| rejected("bad_body"))?;
        let field = |k: &str| body.get(k).and_then(|v| v.as_str()).map(str::to_owned);
        let mut sha = [0u8; 32];
        for (i, chunk) in sha.chunks_mut(8).enumerate() {
            let h = fnv1a(&[raw, &[i as u8]].concat());
            chunk.copy_from_slice(&h.to_be_bytes());
        }
        Ok(VerifiedDelivery {
            event_id: field("id").ok_or_else(|| rejected("bad_body"))?,
            body_sha256: sha,
            event_type: field("event").ok_or_else(|| rejected("bad_body"))?,
            body,
        })
    }

    fn translate(&self, d: &VerifiedDelivery) -> Vec<ProviderEvent> {
        let post = d
            .body
            .get("post")
            .and_then(|v| v.as_str())
            .map(|p| ProviderRef(p.to_owned()));
        match (d.event_type.as_str(), post) {
            ("post.published", Some(post)) => vec![ProviderEvent::PostPublished {
                post,
                platform_post_id: None,
                url: None,
                at: None,
            }],
            ("post.failed", Some(post)) => vec![ProviderEvent::PostFailed {
                post,
                code: ErrorCode::new("platform_rejected").expect("valid code"),
            }],
            ("comment.received", Some(post)) => {
                let s = |k: &str| {
                    d.body
                        .get(k)
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_owned()
                };
                vec![ProviderEvent::CommentReceived(IncomingComment {
                    account: ProviderRef(s("account")),
                    comment_id: s("comment"),
                    platform_post_id: post.0,
                    author_id: s("author"),
                    own_account: d.body.get("own").and_then(|v| v.as_bool()) == Some(true),
                    is_reply: false,
                    created_at: Some(OffsetDateTime::now_utc()),
                    text: s("text"),
                })]
            }
            (other, _) => vec![ProviderEvent::Ignored {
                event_type: other.to_owned(),
            }],
        }
    }
}

#[async_trait]
impl Inbox for FakeProvider {
    async fn private_reply(
        &self,
        _account: &ProviderRef,
        platform_post_id: &str,
        comment_id: &str,
        text: &str,
    ) -> PrivateReply {
        self.with(|s| {
            s.inbox.push((
                "private".into(),
                platform_post_id.into(),
                comment_id.into(),
                text.into(),
            ));
            s.next_private.pop_front().unwrap_or(PrivateReply::Sent)
        })
    }

    async fn public_reply(
        &self,
        _account: &ProviderRef,
        platform_post_id: &str,
        comment_id: &str,
        text: &str,
        _key: &str,
    ) -> Result<()> {
        self.with(|s| {
            s.inbox.push((
                "public".into(),
                platform_post_id.into(),
                comment_id.into(),
                text.into(),
            ))
        });
        Ok(())
    }
}

/// Small in-memory video and cover.
pub struct FakeMedia;

#[async_trait]
impl MediaSource for FakeMedia {
    async fn open(&self, kind: MediaKind) -> Result<MediaBody> {
        let (name, ct, data): (&str, &str, &'static [u8]) = match kind {
            MediaKind::Video => ("video.mp4", "video/mp4", b"fake-video-bytes"),
            MediaKind::Cover => ("thumbnail.png", "image/png", b"fake-png-bytes"),
        };
        Ok(MediaBody {
            meta: MediaMeta {
                content_type: ct.into(),
                bytes: data.len() as u64,
                width: 1080,
                height: 1920,
                seconds: (kind == MediaKind::Video).then_some(59.0),
            },
            filename: name.into(),
            body: Box::pin(futures::stream::once(async move {
                Ok(Bytes::from_static(data))
            })),
        })
    }
}

#[derive(Default)]
pub struct FakeHarness {
    pub provider: FakeProvider,
}

#[async_trait]
impl ConnectHarness for FakeHarness {
    type P = FakeProvider;

    fn provider(&self) -> &FakeProvider {
        &self.provider
    }

    async fn approve(&self, profile: &ProviderRef, platform: Platform) -> CallbackParams {
        let account = self.provider.add_account(profile, platform);
        CallbackParams(vec![
            ("connected".into(), platform.as_str().into()),
            ("accountId".into(), account.0),
        ])
    }

    fn foreign_callback(&self, platform: Platform) -> CallbackParams {
        let other = self.provider.fresh("profile");
        let account = self.provider.add_account(&other, platform);
        CallbackParams(vec![("accountId".into(), account.0)])
    }

    fn denied_callback(&self, _platform: Platform) -> CallbackParams {
        CallbackParams(vec![("error".into(), "oauth_denied".into())])
    }
}

#[async_trait]
impl PublisherHarness for FakeHarness {
    type P = FakeProvider;

    fn publisher(&self) -> &FakeProvider {
        &self.provider
    }

    async fn connection(&self, platform: Platform) -> ConnectionRef {
        let profile = self.provider.fresh("profile");
        let account = self.provider.add_account(&profile, platform);
        ConnectionRef {
            platform,
            profile,
            account,
        }
    }

    fn media(&self) -> Box<dyn MediaSource> {
        Box::new(FakeMedia)
    }

    fn inject(&self, fault: Fault) {
        self.provider.inject(fault);
    }

    async fn provider_posts(&self) -> usize {
        self.provider.post_count()
    }

    async fn mark_published(&self, post: &ProviderRef) {
        self.provider
            .set_post_status(post, DeliveryStatus::Published);
    }

    fn now(&self) -> OffsetDateTime {
        datetime!(2026-11-09 12:00 +07:00)
    }
}

impl EventHarness for FakeHarness {
    type E = FakeProvider;

    fn source(&self) -> &FakeProvider {
        &self.provider
    }

    fn published(&self, post: &ProviderRef) -> (Headers, Vec<u8>) {
        self.provider.signed(serde_json::json!({
            "id": format!("evt-{}", post.0),
            "event": "post.published",
            "post": post.0,
        }))
    }

    fn unknown(&self) -> (Headers, Vec<u8>) {
        self.provider
            .signed(serde_json::json!({"id": "evt-x", "event": "analytics.synced"}))
    }

    fn wrong_secret(&self, body: &[u8]) -> Headers {
        self.provider.sign_with("other-secret", body)
    }
}
