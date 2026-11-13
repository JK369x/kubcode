//! The Lambda's use cases (design §4, §5). HTTP (web host), ops (owner CLI)
//! and webhooks are thin wrappers around these. Every failure is a fixed
//! code; provider or database text never leaves this module.

use std::sync::Arc;

use kubcode_publishing::automation::choose;
use kubcode_publishing::config::PublishingConfig;
use kubcode_publishing::domain::{
    Capability, ChannelId, DeliveryId, DeliveryStatus, MediaAssetId, MediaKind, MediaMeta,
    Platform, PostId, ProviderKind, ProviderRef, WorkspaceId,
};
use kubcode_publishing::errors::PublishError;
use kubcode_publishing::events::{EventSource, Headers, IncomingComment, ProviderEvent};
use kubcode_publishing::ports::{
    check, CallbackParams, ConnectProvider, ConnectionRef, DeliveryRequest, Inbox, MediaSource,
    OwnPost, PrivateReply, Publisher, WorkspaceCtx,
};
use kubcode_publishing::routing::{resolve, ConnectionView, Resolution};
use kubcode_publishing::validate::DeliveryDraft;
use kubcode_publishing_store::{
    ChannelRow, DeliverySummary, DmState, NewAsset, NewDelivery, NewIntent, NewPost, PublishedPost,
    Store, StoreError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::summary::{digest, ScheduleRequest};

/// Where the provider sends the creator back after consent.
pub const CALLBACK_BASE: &str = "https://kubcode.dev/api/channels/callback?i=";
pub const INTENT_TTL: Duration = Duration::minutes(10);

pub struct ProviderSet {
    pub connect: Arc<dyn ConnectProvider>,
    pub publisher: Arc<dyn Publisher>,
    pub events: Arc<dyn EventSource>,
    /// Comment replies (comment → DM); None for a provider without them.
    pub inbox: Option<Arc<dyn Inbox>>,
}

/// The providers this build can use. Native adapters join here in phase 2.
pub struct Registry {
    pub zernio: Option<ProviderSet>,
}

impl Registry {
    pub fn get(&self, kind: ProviderKind) -> Option<&ProviderSet> {
        match kind {
            ProviderKind::Zernio => self.zernio.as_ref(),
            ProviderKind::Native => None,
        }
    }
}

/// Opens a delivery's files (S3 in production).
pub trait MediaOpener: Send + Sync {
    fn open(
        &self,
        video_key: &str,
        video: &MediaMeta,
        cover: Option<(&str, &MediaMeta)>,
    ) -> Box<dyn MediaSource>;
}

/// A fixed `[a-z_]` code for the caller.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Fail {
    pub code: String,
}

impl Fail {
    fn new(code: &str) -> Self {
        Self { code: code.into() }
    }
}

impl From<StoreError> for Fail {
    fn from(e: StoreError) -> Self {
        match e {
            StoreError::IntentInvalid => Fail::new("intent_invalid"),
            StoreError::Conflict => Fail::new("channel_conflict"),
            StoreError::Db(_) | StoreError::Corrupt => Fail::new("store_unavailable"),
        }
    }
}

impl From<PublishError> for Fail {
    fn from(e: PublishError) -> Self {
        Fail::new(e.code.as_str())
    }
}

pub type Result<T> = std::result::Result<T, Fail>;

/// At most this many posts in the picker.
pub const POSTS_MAX: usize = 24;
/// The provider's list is reused this long per channel (warm Lambda only).
pub const POSTS_CACHE_TTL: Duration = Duration::seconds(60);

type PostsKey = (ChannelId, String);
type PostsCache = std::collections::HashMap<PostsKey, (OffsetDateTime, Vec<OwnPost>)>;
static POSTS_CACHE: std::sync::Mutex<Option<PostsCache>> = std::sync::Mutex::new(None);

fn posts_cache_get(key: &PostsKey, now: OffsetDateTime) -> Option<Vec<OwnPost>> {
    let mut slot = POSTS_CACHE.lock().ok()?;
    let cache = slot.get_or_insert_with(Default::default);
    cache.retain(|_, (at, _)| now - *at < POSTS_CACHE_TTL && *at <= now);
    cache.get(key).map(|(_, p)| p.clone())
}

fn posts_cache_put(key: PostsKey, now: OffsetDateTime, posts: Vec<OwnPost>) {
    if let Ok(mut slot) = POSTS_CACHE.lock() {
        slot.get_or_insert_with(Default::default)
            .insert(key, (now, posts));
    }
}

/// One post in the picker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PickerPost {
    #[serde(rename = "platformPostId")]
    pub platform_post_id: String,
    pub permalink: Option<String>,
    #[serde(rename = "thumbnailUrl")]
    pub thumbnail_url: Option<String>,
    pub caption: String,
    #[serde(rename = "createdAt", with = "time::serde::rfc3339::option")]
    pub created_at: Option<OffsetDateTime>,
    /// Published through kubcode.
    pub kubcode: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ChannelPosts {
    pub posts: Vec<PickerPost>,
    /// False when the platform's own list could not be read.
    pub complete: bool,
}

/// The platform's list first (it has thumbnails), kubcode's posts added
/// when missing from it, newest first, at most POSTS_MAX.
pub fn merge_posts(
    listed: Option<&[OwnPost]>,
    ours: &[PublishedPost],
    complete: bool,
) -> ChannelPosts {
    let mut posts: Vec<PickerPost> = Vec::new();
    for p in listed.unwrap_or_default() {
        if posts
            .iter()
            .any(|x| x.platform_post_id == p.platform_post_id)
        {
            continue;
        }
        let mine = ours
            .iter()
            .any(|o| o.platform_post_id == p.platform_post_id);
        posts.push(PickerPost {
            platform_post_id: p.platform_post_id.clone(),
            permalink: p.permalink.clone(),
            thumbnail_url: p.thumbnail_url.clone(),
            caption: p.caption.clone(),
            created_at: p.created_at,
            kubcode: mine,
        });
    }
    for o in ours {
        if posts
            .iter()
            .any(|x| x.platform_post_id == o.platform_post_id)
        {
            continue;
        }
        let caption = kubcode_publishing::ports::caption_line(&o.description);
        posts.push(PickerPost {
            platform_post_id: o.platform_post_id.clone(),
            permalink: o.platform_url.clone(),
            thumbnail_url: None,
            caption: if caption.is_empty() {
                kubcode_publishing::ports::caption_line(&o.title)
            } else {
                caption
            },
            created_at: Some(o.published_at),
            kubcode: true,
        });
    }
    // Newest first; a post without a date goes last, in listed order.
    posts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    posts.truncate(POSTS_MAX);
    ChannelPosts { posts, complete }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AssetRequest {
    pub clip_ref: String,
    pub kind: MediaKind,
    /// Lowercase hex SHA-256 of the file.
    pub sha256: String,
    pub ext: String,
    pub meta: MediaMeta,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeliveryResult {
    pub channel: Uuid,
    pub delivery: Option<DeliveryId>,
    pub status: DeliveryStatus,
    pub codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ScheduleResult {
    pub post: PostId,
    pub deliveries: Vec<DeliveryResult>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebhookResult {
    Accepted,
    /// Bad signature or body: answer 401 (Zernio does not retry 4xx).
    Unauthorized,
    /// Our side failed: answer 500 so the provider retries.
    Retry,
}

/// An event type as it may appear in logs: `[a-z0-9_.]`, at most 60 chars.
pub fn log_safe(t: &str) -> &str {
    let ok = (1..=60).contains(&t.len())
        && t.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'.');
    if ok {
        t
    } else {
        "other"
    }
}

fn clip_ref_ok(c: &str) -> bool {
    (1..=120).contains(&c.len())
        && c.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

pub struct Service<'a> {
    pub store: &'a mut Store,
    pub reg: &'a Registry,
    pub cfg: &'a PublishingConfig,
    pub media: &'a dyn MediaOpener,
    pub now: OffsetDateTime,
}

impl Service<'_> {
    fn providers(&self, kind: ProviderKind) -> Result<&ProviderSet> {
        self.reg
            .get(kind)
            .ok_or_else(|| Fail::new("provider_not_configured"))
    }

    async fn own_channel(&self, ws: WorkspaceId, channel: ChannelId) -> Result<ChannelRow> {
        match self.store.channel(channel).await? {
            Some(c) if c.workspace == ws => Ok(c),
            _ => Err(Fail::new("channel_not_found")),
        }
    }

    async fn own_asset(
        &self,
        ws: WorkspaceId,
        id: Uuid,
        kind: MediaKind,
        clip_ref: &str,
    ) -> Result<kubcode_publishing_store::AssetRow> {
        match self.store.asset(MediaAssetId(id)).await? {
            Some(a) if a.workspace == ws && a.kind == kind && a.clip_ref == clip_ref => Ok(a),
            _ => Err(Fail::new("asset_not_found")),
        }
    }

    // ------------------------------------------------------------ connect

    /// `state` is the raw random value the web host also keeps in its cookie
    /// flow; only its hash is stored.
    pub async fn connect_start(
        &mut self,
        user: Uuid,
        platform: Platform,
        state: &[u8; 32],
        cookie_hash: &[u8; 32],
        session_binding_hash: &[u8; 32],
    ) -> Result<String> {
        let ws = self.store.owner_workspace(user).await?;
        let routes = self.store.routes().await?;
        let kind = routes
            .get(platform, Capability::Connect)
            .ok_or_else(|| Fail::new("not_routed"))?
            .provider;
        let connect = Arc::clone(&self.providers(kind)?.connect);
        let profile = self.store.profile(ws, kind).await?;
        self.store
            .open_intent(&NewIntent {
                workspace: ws,
                user,
                platform,
                provider: kind,
                state_hash: Sha256::digest(state).into(),
                cookie_hash: *cookie_hash,
                session_binding_hash: *session_binding_hash,
                ttl: INTENT_TTL,
            })
            .await?;
        let callback = format!("{CALLBACK_BASE}{}", hex::encode(state));
        let start = connect
            .start(
                &WorkspaceCtx {
                    workspace: ws,
                    profile: profile.clone(),
                },
                platform,
                &callback,
            )
            .await?;
        if profile.is_none() {
            self.store.save_profile(ws, kind, &start.profile).await?;
        }
        Ok(start.auth_url)
    }

    pub async fn connect_complete(
        &mut self,
        state: &[u8; 32],
        params: CallbackParams,
    ) -> Result<ChannelId> {
        let hash: [u8; 32] = Sha256::digest(state).into();
        let intent = self.store.take_intent(&hash).await?;
        let outcome = async {
            let connect = Arc::clone(&self.providers(intent.provider)?.connect);
            let profile = self
                .store
                .profile(intent.workspace, intent.provider)
                .await?
                .ok_or_else(|| Fail::new("profile_missing"))?;
            Ok::<_, Fail>(connect.complete(&profile, intent.platform, &params).await?)
        }
        .await;
        match outcome {
            Ok(acct) => Ok(self.store.attach_connection(&intent, &acct).await?),
            Err(f) => {
                self.store.fail_intent(intent.id, &f.code).await?;
                Err(f)
            }
        }
    }

    pub async fn disconnect(&mut self, user: Uuid, channel: ChannelId) -> Result<()> {
        let ws = self.store.owner_workspace(user).await?;
        let ch = self.own_channel(ws, channel).await?;
        for c in self.store.connections(channel).await? {
            if c.status == kubcode_publishing::domain::ConnectionStatus::Revoked {
                continue;
            }
            let set = self.providers(c.provider)?;
            let profile = self
                .store
                .profile(ws, c.provider)
                .await?
                .ok_or_else(|| Fail::new("profile_missing"))?;
            set.connect
                .disconnect(&ConnectionRef {
                    platform: ch.platform,
                    profile,
                    account: c.provider_ref.clone(),
                })
                .await?;
            self.store.revoke_connection(c.id).await?;
        }
        Ok(())
    }

    /// The channel's own recent posts for the automation page's post picker:
    /// what the platform lists (through the provider, cached briefly) plus
    /// what kubcode published there, so a post just published shows before
    /// the provider lists it. A provider failure still answers with ours,
    /// marked incomplete.
    pub async fn channel_posts(&mut self, user: Uuid, channel: ChannelId) -> Result<ChannelPosts> {
        let ws = self.store.owner_workspace(user).await?;
        let ch = self.own_channel(ws, channel).await?;
        if !matches!(ch.platform, Platform::Instagram | Platform::TikTok) {
            return Err(Fail::new("channel_not_found"));
        }
        let ours = self
            .store
            .published_posts(channel, POSTS_MAX as i64)
            .await?;
        let listed = self.listed_posts(channel).await;
        Ok(merge_posts(
            listed.as_ref().ok().map(Vec::as_slice),
            &ours,
            listed.is_ok(),
        ))
    }

    async fn listed_posts(&mut self, channel: ChannelId) -> Result<Vec<OwnPost>> {
        let conn = self
            .store
            .connections(channel)
            .await?
            .into_iter()
            .find(|k| k.status != kubcode_publishing::domain::ConnectionStatus::Revoked)
            .ok_or_else(|| Fail::new("no_connection"))?;
        let key = (channel, conn.provider_ref.0.clone());
        if let Some(hit) = posts_cache_get(&key, self.now) {
            return Ok(hit);
        }
        let inbox = self
            .providers(conn.provider)?
            .inbox
            .clone()
            .ok_or_else(|| Fail::new("no_inbox"))?;
        let posts = inbox
            .account_posts(&conn.provider_ref, POSTS_MAX as u32)
            .await?;
        posts_cache_put(key, self.now, posts.clone());
        Ok(posts)
    }

    pub async fn channels(&mut self, user: Uuid) -> Result<Vec<ChannelRow>> {
        let ws = self.store.owner_workspace(user).await?;
        Ok(self.store.channels_of(ws).await?)
    }

    // ------------------------------------------------------------ media

    /// Registers one file of a clip and returns where the CLI must upload it.
    pub async fn register_asset(
        &mut self,
        user: Uuid,
        a: AssetRequest,
    ) -> Result<(MediaAssetId, String)> {
        let sha: [u8; 32] = hex::decode(&a.sha256)
            .ok()
            .filter(|_| {
                a.sha256
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            })
            .and_then(|v| v.try_into().ok())
            .ok_or_else(|| Fail::new("bad_sha256"))?;
        let ext_ok = (2..=5).contains(&a.ext.len())
            && a.ext
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit());
        if !clip_ref_ok(&a.clip_ref) || !ext_ok {
            return Err(Fail::new("bad_asset"));
        }
        let ws = self.store.owner_workspace(user).await?;
        let key = format!("clips/{}/{}/{}.{}", ws.0, a.clip_ref, a.sha256, a.ext);
        let id = self
            .store
            .register_asset(&NewAsset {
                workspace: ws,
                clip_ref: a.clip_ref,
                kind: a.kind,
                s3_key: key.clone(),
                sha256: sha,
                meta: a.meta,
            })
            .await
            .map_err(|e| match e {
                StoreError::Db(_) => Fail::new("bad_asset"),
                other => other.into(),
            })?;
        Ok((id, key))
    }

    // ------------------------------------------------------------ publish

    /// Creates the post, confirms it against the digest the creator saw, and
    /// hands each target to its routed provider.
    pub async fn schedule(
        &mut self,
        user: Uuid,
        req: ScheduleRequest,
        confirmed: [u8; 32],
    ) -> Result<ScheduleResult> {
        if digest(&req) != confirmed {
            return Err(Fail::new("digest_mismatch"));
        }
        let ws = self.store.owner_workspace(user).await?;
        let video = self
            .own_asset(ws, req.video_asset, MediaKind::Video, &req.clip_ref)
            .await?;
        let cover = match req.cover_asset {
            Some(id) => Some(
                self.own_asset(ws, id, MediaKind::Cover, &req.clip_ref)
                    .await?,
            ),
            None => None,
        };
        let post = self
            .store
            .create_post(&NewPost {
                workspace: ws,
                clip_ref: req.clip_ref.clone(),
                video: video.id,
                cover: cover.as_ref().map(|c| c.id),
                title: req.title.clone(),
                description: req.description.clone(),
                tags: req.tags.clone(),
            })
            .await?;
        self.store.confirm_post(post, &confirmed, user).await?;
        let routes = self.store.routes().await?;

        let mut out = Vec::new();
        for t in &req.targets {
            let fail = |codes: Vec<String>, status| DeliveryResult {
                channel: t.channel,
                delivery: None,
                status,
                codes,
            };
            let Ok(ch) = self.own_channel(ws, ChannelId(t.channel)).await else {
                out.push(fail(
                    vec!["channel_not_found".into()],
                    DeliveryStatus::Rejected,
                ));
                continue;
            };
            // Billing (ADR 0008): a paused channel takes no new deliveries.
            if self.store.channel_paused(ch.id).await? {
                out.push(fail(
                    vec!["channel_paused".into()],
                    DeliveryStatus::Rejected,
                ));
                continue;
            }
            let conns = self.store.connections(ch.id).await?;
            let views: Vec<ConnectionView> = conns
                .iter()
                .map(|c| ConnectionView {
                    id: c.id,
                    provider: c.provider,
                    status: c.status,
                })
                .collect();
            let (connection, kind) =
                match resolve(&routes, ch.platform, Capability::Publish, &views) {
                    Resolution::Use {
                        connection,
                        provider,
                    } => (connection, provider),
                    Resolution::NeedsReconnect { .. } => {
                        out.push(fail(
                            vec!["needs_reconnect".into()],
                            DeliveryStatus::Rejected,
                        ));
                        continue;
                    }
                    Resolution::NotRouted => {
                        out.push(fail(vec!["not_routed".into()], DeliveryStatus::Rejected));
                        continue;
                    }
                };
            let account = conns
                .iter()
                .find(|c| c.id == connection)
                .map(|c| c.provider_ref.clone())
                .expect("resolved from this list");
            let key = Uuid::new_v4();
            let delivery = self
                .store
                .create_delivery(&NewDelivery {
                    post,
                    channel: ch.id,
                    connection,
                    provider: kind,
                    platform: ch.platform,
                    publish_at: t.publish_at,
                    visibility: t.visibility,
                    idempotency_key: key,
                })
                .await?;
            let result = self
                .hand_over(
                    ws, &ch, kind, account, delivery, key, &req, t, &video, &cover,
                )
                .await?;
            out.push(result);
        }
        Ok(ScheduleResult {
            post,
            deliveries: out,
        })
    }

    #[allow(clippy::too_many_arguments)]
    async fn hand_over(
        &mut self,
        ws: WorkspaceId,
        ch: &ChannelRow,
        kind: ProviderKind,
        account: ProviderRef,
        delivery: DeliveryId,
        key: Uuid,
        req: &ScheduleRequest,
        t: &crate::summary::Target,
        video: &kubcode_publishing_store::AssetRow,
        cover: &Option<kubcode_publishing_store::AssetRow>,
    ) -> Result<DeliveryResult> {
        let result = |status, codes: Vec<String>| DeliveryResult {
            channel: ch.id.0,
            delivery: Some(delivery),
            status,
            codes,
        };
        let request = DeliveryRequest {
            delivery,
            idempotency_key: key,
            draft: DeliveryDraft {
                platform: ch.platform,
                title: req.title.clone(),
                description: req.description.clone(),
                tags: req.tags.clone(),
                video: video.meta.clone(),
                cover: cover.as_ref().map(|c| c.meta.clone()),
                publish_at: t.publish_at,
                visibility: t.visibility,
            },
        };
        let set = match self.providers(kind) {
            Ok(s) => s,
            Err(f) => {
                self.store
                    .transition(delivery, DeliveryStatus::Rejected, Some(&f.code))
                    .await?;
                return Ok(result(DeliveryStatus::Rejected, vec![f.code]));
            }
        };
        let publisher = Arc::clone(&set.publisher);
        let velocity = self.store.velocity(ch.id, t.publish_at).await?;
        let checked = match check(request, self.now, velocity, self.cfg, publisher.as_ref()) {
            Ok(c) => c,
            Err(violations) => {
                let codes: Vec<String> = violations.iter().map(|v| v.code.to_owned()).collect();
                self.store
                    .transition(delivery, DeliveryStatus::Rejected, Some(&codes[0]))
                    .await?;
                return Ok(result(DeliveryStatus::Rejected, codes));
            }
        };
        let profile = self
            .store
            .profile(ws, kind)
            .await?
            .ok_or_else(|| Fail::new("profile_missing"))?;
        let conn = ConnectionRef {
            platform: ch.platform,
            profile,
            account,
        };
        let media = self.media.open(
            &video.s3_key,
            &video.meta,
            cover.as_ref().map(|c| (c.s3_key.as_str(), &c.meta)),
        );
        match publisher.schedule(&conn, &checked, media.as_ref()).await {
            Ok(taken) => {
                self.store.mark_scheduled(delivery, &taken.post).await?;
                // A due time is attempted inline: record what the provider said.
                match taken.state.status {
                    DeliveryStatus::Failed => {
                        let code = taken
                            .state
                            .error
                            .map(|e| e.code.as_str().to_owned())
                            .unwrap_or_else(|| "platform_rejected".into());
                        self.store
                            .transition(delivery, DeliveryStatus::Failed, Some(&code))
                            .await?;
                        Ok(result(DeliveryStatus::Failed, vec![code]))
                    }
                    // On its way; the receipt (post id, URL) comes with the webhook.
                    DeliveryStatus::Published | DeliveryStatus::Publishing => {
                        self.store
                            .transition(delivery, DeliveryStatus::Publishing, None)
                            .await?;
                        Ok(result(DeliveryStatus::Publishing, Vec::new()))
                    }
                    _ => Ok(result(DeliveryStatus::Scheduled, Vec::new())),
                }
            }
            Err(e) => {
                let code = e.code.as_str().to_owned();
                self.store
                    .transition(delivery, DeliveryStatus::Failed, Some(&code))
                    .await?;
                Ok(result(DeliveryStatus::Failed, vec![code]))
            }
        }
    }

    pub async fn status(&mut self, user: Uuid, post: PostId) -> Result<Vec<DeliverySummary>> {
        let ws = self.store.owner_workspace(user).await?;
        if self.store.post_workspace(post).await? != Some(ws) {
            return Err(Fail::new("post_not_found"));
        }
        Ok(self.store.post_deliveries(post).await?)
    }

    /// Records the owner's thumbnail check on a published delivery.
    pub async fn record_cover_check(
        &mut self,
        user: Uuid,
        delivery: DeliveryId,
        check: &str,
    ) -> Result<()> {
        if !matches!(check, "ok" | "mismatch") {
            return Err(Fail::new("bad_request"));
        }
        let ws = self.store.owner_workspace(user).await?;
        match self.store.delivery(delivery).await? {
            Some(d) if d.workspace == ws => {}
            _ => return Err(Fail::new("delivery_not_found")),
        }
        if self.store.set_cover_check(delivery, check).await? {
            Ok(())
        } else {
            Err(Fail::new("no_receipt"))
        }
    }

    pub async fn cancel(&mut self, user: Uuid, delivery: DeliveryId) -> Result<()> {
        let ws = self.store.owner_workspace(user).await?;
        let d = match self.store.delivery(delivery).await? {
            Some(d) if d.workspace == ws => d,
            _ => return Err(Fail::new("delivery_not_found")),
        };
        if d.status.is_final() || !d.status.can_move_to(DeliveryStatus::Cancelled) {
            return Err(Fail::new("already_final"));
        }
        if let (Some(post_ref), Some(profile)) = (&d.provider_ref, &d.profile) {
            let publisher = Arc::clone(&self.providers(d.provider)?.publisher);
            publisher
                .cancel(
                    &ConnectionRef {
                        platform: d.platform,
                        profile: profile.clone(),
                        account: d.account.clone(),
                    },
                    post_ref,
                )
                .await?;
        }
        self.store
            .transition(delivery, DeliveryStatus::Cancelled, None)
            .await?;
        Ok(())
    }

    // ------------------------------------------------------------ webhooks

    pub async fn webhook(
        &mut self,
        kind: ProviderKind,
        headers: &Headers,
        body: &[u8],
    ) -> WebhookResult {
        let Ok(set) = self.providers(kind) else {
            println!(
                "[publishing] webhook provider={} outcome=not_configured",
                kind.as_str()
            );
            return WebhookResult::Unauthorized;
        };
        let events = Arc::clone(&set.events);
        let v = match events.verify(headers, body) {
            Ok(v) => v,
            Err(e) => {
                println!(
                    "[publishing] webhook provider={} outcome=refused code={}",
                    kind.as_str(),
                    e.code.as_str()
                );
                return WebhookResult::Unauthorized;
            }
        };
        let translated = events.translate(&v);
        // Comments first: recording is idempotent by comment id, so a failure
        // here can answer Retry before the event is marked as seen.
        for e in &translated {
            if let ProviderEvent::CommentReceived(c) = e {
                if self.record_comment(kind, c, false).await.is_err() {
                    log_comment(None, "retry");
                    return WebhookResult::Retry;
                }
            }
        }
        // Event type and outcome only: never the body, ids or provider text.
        let log = |outcome: &str| {
            println!(
                "[publishing] webhook provider={} event={} outcome={outcome}",
                kind.as_str(),
                log_safe(&v.event_type)
            )
        };
        match self.store.apply_event(kind, &v, &translated).await {
            Ok(o) => {
                log(match o {
                    kubcode_publishing_store::ApplyOutcome::Applied => "applied",
                    kubcode_publishing_store::ApplyOutcome::Duplicate => "duplicate",
                    kubcode_publishing_store::ApplyOutcome::IdReuse => "id_reuse",
                });
                WebhookResult::Accepted
            }
            Err(_) => {
                log("retry");
                WebhookResult::Retry
            }
        }
    }
}

/// One line per comment: the channel and the outcome code, never the text,
/// ids or usernames (docs/design/ig-comment-dm.md §4.5).
fn log_comment(channel: Option<ChannelId>, outcome: &str) {
    match channel {
        Some(c) => println!("[automations] channel={} outcome={outcome}", c.0),
        None => println!("[automations] outcome={outcome}"),
    }
}

/// Instagram allows a private reply within 7 days of the comment; TikTok
/// comments older than that are not answered either.
const PRIVATE_REPLY_WINDOW: Duration = Duration::days(7);
/// A ledger row left in dm_sending this long (a crash or a lost answer)
/// becomes dm_unknown.
const SENDING_TIMEOUT: Duration = Duration::minutes(2);
/// ADR 0008: a channel paused this long is disconnected from the provider.
pub const DISCONNECT_AFTER_PAUSE: Duration = Duration::days(14);
/// Comments handled per worker run.
const WORK_BATCH: i64 = 25;
/// Catch-up reads this many recently commented posts per channel,
const CATCH_UP_POSTS: usize = 10;
/// and accepts a post rule's post when it is among this many listed ones.
const CATCH_UP_LISTED: u32 = 50;

impl Service<'_> {
    /// Keeps a comment for the worker when an active rule matches it; anything
    /// else is only logged, so no commenter ids are stored for it.
    async fn record_comment(
        &mut self,
        kind: ProviderKind,
        c: &IncomingComment,
        quiet: bool,
    ) -> std::result::Result<bool, StoreError> {
        // `quiet` (catch-up) logs only what it keeps, so rescans stay silent.
        let log = |channel, outcome| {
            if !quiet {
                log_comment(channel, outcome)
            }
        };
        let Some(channel) = self.store.comment_channel(kind, &c.account).await? else {
            log(None, "no_channel");
            return Ok(false);
        };
        let skipped = if c.own_account {
            Some("own_account")
        } else if c.is_reply {
            Some("thread_reply")
        } else if c
            .created_at
            .is_some_and(|t| self.now - t > PRIVATE_REPLY_WINDOW)
        {
            Some("too_old")
        } else {
            None
        };
        if let Some(code) = skipped {
            log(Some(channel), code);
            return Ok(false);
        }
        let rows = self.store.rules_of(channel).await?;
        let rules: Vec<_> = rows.iter().map(|r| r.rule.clone()).collect();
        let Some(rule) = choose(&rules, &c.platform_post_id, &c.text) else {
            log(Some(channel), "no_rule");
            return Ok(false);
        };
        let rule_id = rows.iter().find(|r| r.rule.id == rule.id).map(|r| r.id);
        let new = self
            .store
            .record_comment(channel, kind, c, rule_id, None)
            .await?;
        if new {
            log_comment(Some(channel), "matched");
        }
        Ok(new)
    }

    /// Reads recent comments of channels with active rules and keeps the ones
    /// the webhook did not deliver. Returns how many were newly kept.
    pub async fn catch_up(&mut self) -> Result<usize> {
        let mut kept = 0;
        for (channel, rule_posts) in self.store.rule_channels().await? {
            let Some(conn) = self
                .store
                .connections(channel)
                .await?
                .into_iter()
                .find(|k| k.status != kubcode_publishing::domain::ConnectionStatus::Revoked)
            else {
                continue;
            };
            let Some(inbox) = self.providers(conn.provider)?.inbox.clone() else {
                continue;
            };
            // Only posts the account itself lists: its recent ones, and a post
            // rule's post when it is among them (a rule cannot point the
            // account at someone else's post).
            let listed = match inbox
                .recent_posts(&conn.provider_ref, CATCH_UP_LISTED)
                .await
            {
                Ok(l) => l,
                Err(e) => {
                    log_comment(Some(channel), &format!("catch_up_{}", e.code.as_str()));
                    continue;
                }
            };
            let mut posts: Vec<String> = listed.iter().take(CATCH_UP_POSTS).cloned().collect();
            posts.extend(rule_posts.into_iter().filter(|p| listed.contains(p)));
            posts.sort();
            posts.dedup();
            for post in posts {
                let comments = match inbox.post_comments(&conn.provider_ref, &post).await {
                    Ok(c) => c,
                    Err(e) => {
                        log_comment(Some(channel), &format!("catch_up_{}", e.code.as_str()));
                        continue;
                    }
                };
                for c in &comments {
                    if self.record_comment(conn.provider, c, true).await? {
                        kept += 1;
                    }
                }
            }
        }
        Ok(kept)
    }

    /// The worker: sends what was recorded, oldest first. Returns
    /// (comment id, outcome) per comment handled, for tests and the caller.
    /// Billing sweep, publishing half (ADR 0008 §5): cancel pending/scheduled
    /// deliveries on paused channels at the provider, and disconnect channels
    /// paused for 14 days (the provider bills per connected account). The
    /// billing Lambda decides who is paused; this Lambda holds the Zernio key.
    /// Our rows stay: cancelled deliveries and revoked connections are kept.
    pub async fn billing_sweep(&mut self) -> Result<(usize, usize)> {
        let mut cancelled = 0;
        for d in self.store.deliveries_on_paused_channels(WORK_BATCH).await? {
            let Some(row) = self.store.delivery(d).await? else {
                continue;
            };
            if row.status.is_final() || !row.status.can_move_to(DeliveryStatus::Cancelled) {
                continue;
            }
            if let (Some(post_ref), Some(profile)) = (&row.provider_ref, &row.profile) {
                let publisher = Arc::clone(&self.providers(row.provider)?.publisher);
                publisher
                    .cancel(
                        &ConnectionRef {
                            platform: row.platform,
                            profile: profile.clone(),
                            account: row.account.clone(),
                        },
                        post_ref,
                    )
                    .await?;
            }
            self.store
                .transition(d, DeliveryStatus::Cancelled, Some("channel_paused"))
                .await?;
            cancelled += 1;
        }
        let mut disconnected = 0;
        for (channel, ws) in self
            .store
            .paused_channels_due(DISCONNECT_AFTER_PAUSE, self.now, WORK_BATCH)
            .await?
        {
            let Ok(ch) = self.own_channel(ws, channel).await else {
                continue;
            };
            for c in self.store.connections(channel).await? {
                if c.status == kubcode_publishing::domain::ConnectionStatus::Revoked {
                    continue;
                }
                let set = self.providers(c.provider)?;
                let Some(profile) = self.store.profile(ws, c.provider).await? else {
                    continue;
                };
                set.connect
                    .disconnect(&ConnectionRef {
                        platform: ch.platform,
                        profile,
                        account: c.provider_ref.clone(),
                    })
                    .await?;
                self.store.revoke_connection(c.id).await?;
            }
            disconnected += 1;
        }
        Ok((cancelled, disconnected))
    }

    pub async fn work(&mut self) -> Result<Vec<(String, &'static str)>> {
        self.store.stale_sending_to_unknown(SENDING_TIMEOUT).await?;
        let mut done = Vec::new();
        for c in self.store.pending_comments(WORK_BATCH).await? {
            let outcome = self.handle_comment(&c).await?;
            self.store.finish_comment(c.id, outcome).await?;
            log_comment(Some(c.channel), outcome);
            done.push((c.comment_id.clone(), outcome));
        }
        Ok(done)
    }

    async fn handle_comment(
        &mut self,
        c: &kubcode_publishing_store::PendingComment,
    ) -> Result<&'static str> {
        if c.commented_at
            .is_some_and(|t| self.now - t > PRIVATE_REPLY_WINDOW)
        {
            return Ok("too_old");
        }
        // Billing (ADR 0008): no automation runs on a paused channel.
        if self.store.channel_paused(c.channel).await? {
            return Ok("channel_paused");
        }
        let rules = self.store.rules_of(c.channel).await?;
        let Some(rule) = rules
            .iter()
            .find(|r| Some(r.id) == c.rule_id && r.rule.active)
        else {
            return Ok("rule_gone");
        };
        let Some(conn) = self
            .store
            .connections(c.channel)
            .await?
            .into_iter()
            .find(|k| {
                k.provider == c.provider
                    && k.status != kubcode_publishing::domain::ConnectionStatus::Revoked
            })
        else {
            return Ok("no_connection");
        };
        let Some(inbox) = self.providers(c.provider)?.inbox.clone() else {
            return Ok("no_inbox");
        };
        let platform = match self.store.channel(c.channel).await? {
            Some(ch) => ch.platform,
            None => return Ok("no_connection"),
        };
        if platform.public_reply_only() {
            return self
                .public_only(c, rule, &conn.provider_ref, inbox.as_ref())
                .await;
        }
        let used = self.store.dms_this_month(c.channel, self.now).await?;
        if used >= i64::from(self.cfg.dm_cap_per_month) {
            return Ok("cap_reached");
        }
        let Some(ledger) = self.store.claim_dm(c, rule.id).await? else {
            return Ok("duplicate");
        };
        // Written before the call: a crash from here on can never resend.
        if !self
            .store
            .move_dm(ledger, DmState::Claimed, DmState::DmSending, None)
            .await?
        {
            return Ok("duplicate");
        }
        let dm = inbox
            .private_reply(
                &conn.provider_ref,
                &c.platform_post_id,
                &c.comment_id,
                &rule.dm_text,
            )
            .await;
        let (state, code, outcome) = match &dm {
            PrivateReply::Sent => (DmState::DmSent, None, "dm_sent"),
            PrivateReply::Consumed => (DmState::DmConsumed, Some("reply_consumed"), "dm_consumed"),
            PrivateReply::Unknown => (DmState::DmUnknown, Some("no_answer"), "dm_unknown"),
            PrivateReply::Failed(e) => (DmState::DmFailed, Some(e.code.as_str()), "dm_failed"),
        };
        self.store
            .move_dm(ledger, DmState::DmSending, state, code)
            .await?;
        let reply = match (&rule.public_reply, &dm) {
            (Some(text), PrivateReply::Sent) => Some(text),
            (Some(text), _) if !rule.reply_after_dm => Some(text),
            _ => None,
        };
        let reply_state = match reply {
            None => "skipped",
            Some(text) => {
                let key = format!("kubcode-reply-{}", c.comment_id);
                match inbox
                    .public_reply(
                        &conn.provider_ref,
                        &c.platform_post_id,
                        &c.comment_id,
                        text,
                        &key,
                    )
                    .await
                {
                    Ok(()) => "sent",
                    Err(_) => "failed",
                }
            }
        };
        self.store.set_reply(ledger, reply_state).await?;
        Ok(outcome)
    }

    /// TikTok: no private reply to a comment exists, so the matched comment
    /// gets only the public reply (docs/design/tiktok-channel.md §3). Same
    /// ledger key (one answer per person per post) and the same monthly cap,
    /// counted in public replies. The reply carries an idempotency key, so
    /// a run interrupted after the claim may send it again safely.
    async fn public_only(
        &mut self,
        c: &kubcode_publishing_store::PendingComment,
        rule: &kubcode_publishing_store::RuleRow,
        account: &ProviderRef,
        inbox: &dyn Inbox,
    ) -> Result<&'static str> {
        let Some(text) = rule.public_reply.as_deref().filter(|t| !t.is_empty()) else {
            return Ok("no_public_reply");
        };
        // This comment's own claim from an interrupted run is finished, not
        // counted again.
        let ledger = match self.store.unfinished_reply(c).await? {
            Some(l) => l,
            None => {
                let used = self
                    .store
                    .public_replies_this_month(c.channel, self.now)
                    .await?;
                if used >= i64::from(self.cfg.dm_cap_per_month) {
                    return Ok("cap_reached");
                }
                match self.store.claim_dm(c, rule.id).await? {
                    Some(l) => l,
                    None => return Ok("duplicate"),
                }
            }
        };
        let key = format!("kubcode-reply-{}", c.comment_id);
        let sent = inbox
            .public_reply(account, &c.platform_post_id, &c.comment_id, text, &key)
            .await;
        let (state, outcome) = match sent {
            Ok(()) => ("sent", "reply_sent"),
            Err(_) => ("failed", "reply_failed"),
        };
        self.store.set_reply(ledger, state).await?;
        Ok(outcome)
    }
}

#[cfg(test)]
mod tests {
    use super::{merge_posts, OwnPost, PublishedPost, POSTS_MAX};
    use time::macros::datetime;

    fn listed(id: &str, day: u8) -> OwnPost {
        OwnPost {
            platform_post_id: id.into(),
            permalink: Some(format!("https://www.instagram.com/reel/{id}/")),
            thumbnail_url: Some(format!("https://cdn.example/{id}.jpg")),
            caption: format!("caption {id}"),
            created_at: Some(datetime!(2026-11-01 00:00 UTC) + time::Duration::days(day.into())),
        }
    }

    fn ours(id: &str, day: u8, description: &str) -> PublishedPost {
        PublishedPost {
            platform_post_id: id.into(),
            platform_url: None,
            published_at: datetime!(2026-11-01 00:00 UTC) + time::Duration::days(day.into()),
            title: "Title line".into(),
            description: description.into(),
        }
    }

    #[test]
    fn a_post_published_through_kubcode_shows_before_the_platform_lists_it() {
        let out = merge_posts(
            Some(&[listed("2", 2), listed("1", 1)]),
            &[ours("3", 3, "\nใหม่ล่าสุด\nบรรทัดสอง"), ours("2", 2, "dup")],
            true,
        );
        let ids: Vec<&str> = out
            .posts
            .iter()
            .map(|p| p.platform_post_id.as_str())
            .collect();
        assert_eq!(ids, vec!["3", "2", "1"]);
        assert_eq!(out.posts[0].caption, "ใหม่ล่าสุด");
        assert!(out.posts[0].kubcode && out.posts[1].kubcode && !out.posts[2].kubcode);
        assert_eq!(
            out.posts[1].caption, "caption 2",
            "the platform's copy wins"
        );
        assert_eq!(out.posts[0].thumbnail_url, None);
        let none = merge_posts(None, &[ours("9", 1, "")], false);
        assert_eq!(
            none.posts[0].caption, "Title line",
            "the title when there is no description"
        );
        assert!(!none.complete);
    }

    #[test]
    fn at_most_24_posts() {
        let many: Vec<OwnPost> = (0..30).map(|i| listed(&i.to_string(), i)).collect();
        let out = merge_posts(Some(&many), &[], true);
        assert_eq!(out.posts.len(), POSTS_MAX);
        assert_eq!(out.posts[0].platform_post_id, "29");
        let json = serde_json::to_value(&out.posts[0]).unwrap();
        assert_eq!(json["platformPostId"], "29");
        assert_eq!(json["createdAt"], "2026-11-30T00:00:00Z");
        assert!(json.get("thumbnailUrl").is_some());
    }

    #[test]
    fn only_plain_event_types_reach_the_logs() {
        assert_eq!(super::log_safe("account.connected"), "account.connected");
        assert_eq!(
            super::log_safe("post.platform.published"),
            "post.platform.published"
        );
        for bad in [
            "",
            "Account.Connected",
            "x\nforged log line",
            &"a".repeat(61),
        ] {
            assert_eq!(super::log_safe(bad), "other", "{bad:?}");
        }
    }
}
