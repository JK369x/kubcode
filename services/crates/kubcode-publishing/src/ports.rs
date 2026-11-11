//! One trait per capability (design §3). Adapters implement them; the core
//! and the Lambda only talk to these traits. Inbox, Automations and Analytics
//! ports are added with the slices that use them.

use std::pin::Pin;

use async_trait::async_trait;
use bytes::Bytes;
use futures::Stream;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::config::PublishingConfig;
use crate::domain::{
    ConnectionStatus, DeliveryId, DeliveryStatus, MediaKind, MediaMeta, Platform, ProviderKind,
    ProviderRef, WorkspaceId,
};
use crate::errors::{PublishError, Result};
use crate::validate::{validate_core, DeliveryDraft, Velocity, Violation};

// ------------------------------------------------------------------ connect

/// A workspace as a provider sees it. `profile` is the provider's own
/// workspace object (a Zernio profile), absent before the first connect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceCtx {
    pub workspace: WorkspaceId,
    pub profile: Option<ProviderRef>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectStart {
    /// Where the creator's browser goes next (the platform's consent screen).
    pub auth_url: String,
    /// The provider profile used; the caller stores it if it is new.
    pub profile: ProviderRef,
}

/// The query string the provider sent back to our callback, minus our own
/// parameters. Never trusted on its own: adapters confirm it with the provider.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CallbackParams(pub Vec<(String, String)>);

impl CallbackParams {
    pub fn get(&self, key: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectedAccount {
    pub account: ProviderRef,
    pub platform: Platform,
    pub display_name: String,
    pub handle: Option<String>,
    /// The platform's own id (YouTube channel id, IG user id) when the
    /// provider exposes it. Used to match a reconnect to the same channel.
    pub platform_account_id: Option<String>,
}

/// One connection, as an adapter needs it to act on the channel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectionRef {
    pub platform: Platform,
    pub profile: ProviderRef,
    pub account: ProviderRef,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectionHealth {
    pub account: ProviderRef,
    pub status: ConnectionStatus,
}

#[async_trait]
pub trait ConnectProvider: Send + Sync {
    fn kind(&self) -> ProviderKind;
    async fn start(
        &self,
        ws: &WorkspaceCtx,
        platform: Platform,
        callback_url: &str,
    ) -> Result<ConnectStart>;
    async fn complete(
        &self,
        profile: &ProviderRef,
        platform: Platform,
        cb: &CallbackParams,
    ) -> Result<ConnectedAccount>;
    /// Idempotent: disconnecting an already removed account succeeds.
    async fn disconnect(&self, conn: &ConnectionRef) -> Result<()>;
    async fn health(&self, profile: &ProviderRef) -> Result<Vec<ConnectionHealth>>;
}

// ------------------------------------------------------------------ publish

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeliveryRequest {
    pub delivery: DeliveryId,
    /// Made once at confirm time; the provider dedupes on it.
    pub idempotency_key: Uuid,
    pub draft: DeliveryDraft,
}

/// A delivery that passed the core rules and the adapter's own rules. Only
/// [`check`] can make one.
#[derive(Debug, Clone, PartialEq)]
pub struct Checked {
    request: DeliveryRequest,
}

impl Checked {
    pub fn request(&self) -> &DeliveryRequest {
        &self.request
    }
}

/// Runs the core rules, then the adapter's, and reports every violation.
pub fn check(
    request: DeliveryRequest,
    now: OffsetDateTime,
    velocity: Velocity,
    cfg: &PublishingConfig,
    publisher: &dyn Publisher,
) -> std::result::Result<Checked, Vec<Violation>> {
    let mut v = validate_core(&request.draft, now, velocity, cfg);
    v.extend(publisher.validate(&request.draft));
    if v.is_empty() {
        Ok(Checked { request })
    } else {
        Err(v)
    }
}

pub type MediaStream = Pin<Box<dyn Stream<Item = std::io::Result<Bytes>> + Send>>;

pub struct MediaBody {
    pub meta: MediaMeta,
    /// A plain file name such as `video.mp4`; never an S3 key.
    pub filename: String,
    pub body: MediaStream,
}

/// The delivery's files, opened as streams (S3 in the Lambda, memory in tests).
#[async_trait]
pub trait MediaSource: Send + Sync {
    async fn open(&self, kind: MediaKind) -> Result<MediaBody>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeliveryState {
    pub status: DeliveryStatus,
    pub platform_post_id: Option<String>,
    pub platform_url: Option<String>,
    pub error: Option<PublishError>,
}

/// The provider's answer when it takes a delivery: its post and the state it
/// reported. Usually `Scheduled`; a publish time that is already due is
/// attempted inline and can come back published or failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Accepted {
    pub post: ProviderRef,
    pub state: DeliveryState,
}

#[async_trait]
pub trait Publisher: Send + Sync {
    fn kind(&self) -> ProviderKind;
    /// Provider-only limits on top of the core rules. Pure, no network.
    fn validate(&self, draft: &DeliveryDraft) -> Vec<Violation>;
    /// Hands the delivery over; returns the provider's post and the state it
    /// reported. Idempotent on the request's `idempotency_key`.
    async fn schedule(
        &self,
        conn: &ConnectionRef,
        delivery: &Checked,
        media: &dyn MediaSource,
    ) -> Result<Accepted>;
    /// Idempotent: cancelling an already cancelled post succeeds.
    async fn cancel(&self, conn: &ConnectionRef, post: &ProviderRef) -> Result<()>;
    async fn status(&self, conn: &ConnectionRef, post: &ProviderRef) -> Result<DeliveryState>;
}

/// What became of a private reply (docs/design/ig-comment-dm.md §4.3).
/// Instagram allows one per comment and the provider offers no idempotency,
/// so only `Failed` may ever be followed by another attempt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrivateReply {
    Sent,
    /// The comment's one private reply is spent (an earlier reply, or a
    /// refused one that still counted).
    Consumed,
    /// Refused without spending the reply (too old, declined, rate limited).
    Failed(PublishError),
    /// No clear answer (502, timeout, lost connection): it may have been
    /// delivered.
    Unknown,
}

/// One of the account's own posts as the platform lists it (the automation
/// page's post picker). Only plain values: the caller shows them as text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnPost {
    /// The id a rule and the comment webhook use (Instagram media id, TikTok
    /// video id).
    pub platform_post_id: String,
    pub permalink: Option<String>,
    pub thumbnail_url: Option<String>,
    /// At most 120 characters of the first caption line.
    pub caption: String,
    pub created_at: Option<OffsetDateTime>,
}

/// The first line of a caption, at most 120 characters.
pub fn caption_line(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_control())
        .take(120)
        .collect()
}

/// Replies to comments: the comment → DM engine's capability.
#[async_trait]
pub trait Inbox: Send + Sync {
    /// A plain-text DM to the comment's author.
    async fn private_reply(
        &self,
        account: &ProviderRef,
        platform_post_id: &str,
        comment_id: &str,
        text: &str,
    ) -> PrivateReply;
    /// Catch-up: the platform ids of the account's most recently commented
    /// posts.
    async fn recent_posts(&self, account: &ProviderRef, limit: u32) -> Result<Vec<String>>;
    /// The account's own most recent posts, newest first (at most `limit`).
    async fn account_posts(&self, account: &ProviderRef, limit: u32) -> Result<Vec<OwnPost>>;
    /// Catch-up: a post's top-level comments (replies are not answered).
    async fn post_comments(
        &self,
        account: &ProviderRef,
        platform_post_id: &str,
    ) -> Result<Vec<crate::events::IncomingComment>>;
    /// A public reply under the comment; `key` makes a retry harmless.
    async fn public_reply(
        &self,
        account: &ProviderRef,
        platform_post_id: &str,
        comment_id: &str,
        text: &str,
        key: &str,
    ) -> Result<()>;
}
