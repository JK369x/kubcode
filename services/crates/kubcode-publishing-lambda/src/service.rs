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
    PrivateReply, Publisher, WorkspaceCtx,
};
use kubcode_publishing::routing::{resolve, ConnectionView, Resolution};
use kubcode_publishing::validate::DeliveryDraft;
use kubcode_publishing_store::{
    ChannelRow, DeliverySummary, DmState, NewAsset, NewDelivery, NewIntent, NewPost, Store,
    StoreError,
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

/// Instagram allows a private reply within 7 days of the comment.
const PRIVATE_REPLY_WINDOW: Duration = Duration::days(7);
/// A ledger row left in dm_sending this long (a crash or a lost answer)
/// becomes dm_unknown.
const SENDING_TIMEOUT: Duration = Duration::minutes(2);
/// Comments handled per worker run.
const WORK_BATCH: i64 = 25;
/// Catch-up reads this many recently commented posts per channel.
const CATCH_UP_POSTS: u32 = 10;

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
            let mut posts = rule_posts;
            match inbox.recent_posts(&conn.provider_ref, CATCH_UP_POSTS).await {
                Ok(recent) => posts.extend(recent),
                Err(e) => log_comment(Some(channel), &format!("catch_up_{}", e.code.as_str())),
            }
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
}

#[cfg(test)]
mod tests {
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
