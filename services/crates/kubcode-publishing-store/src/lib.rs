//! Postgres store for the publishing core (db/migrations/0007, 0008). Runs as
//! the Lambda role `kubcode_worker`. Provider refs are written and read here
//! and nowhere else outside the adapters.

use kubcode_publishing::domain::{
    ChannelId, ConnectionId, ConnectionStatus, DeliveryId, DeliveryStatus, MediaAssetId, MediaKind,
    MediaMeta, Platform, PostId, ProviderKind, ProviderRef, Visibility, WorkspaceId,
};
use kubcode_publishing::events::{ProviderEvent, VerifiedDelivery};
use kubcode_publishing::ports::ConnectedAccount;
use kubcode_publishing::routing::{Route, RouteTable};
use kubcode_publishing::validate::Velocity;
use time::{Duration, OffsetDateTime};
use tokio_postgres::Client;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("database error")]
    Db(#[from] tokio_postgres::Error),
    /// The intent is unknown, used, expired or replaced by a newer click.
    #[error("connect intent invalid")]
    IntentInvalid,
    /// The provider account already belongs to another workspace's channel,
    /// or the channel already has a different live account on this provider.
    #[error("connection conflict")]
    Conflict,
    /// A stored value no longer parses (a row written by a newer version).
    #[error("unexpected stored value")]
    Corrupt,
}

pub type Result<T> = std::result::Result<T, StoreError>;

pub struct NewIntent {
    pub workspace: WorkspaceId,
    pub user: Uuid,
    pub platform: Platform,
    pub provider: ProviderKind,
    pub state_hash: [u8; 32],
    pub cookie_hash: [u8; 32],
    pub session_binding_hash: [u8; 32],
    pub ttl: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Intent {
    pub id: Uuid,
    pub workspace: WorkspaceId,
    pub user: Uuid,
    pub platform: Platform,
    pub provider: ProviderKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredConnection {
    pub id: ConnectionId,
    pub provider: ProviderKind,
    pub provider_ref: ProviderRef,
    pub status: ConnectionStatus,
}

pub struct NewAsset {
    pub workspace: WorkspaceId,
    pub clip_ref: String,
    pub kind: MediaKind,
    pub s3_key: String,
    pub sha256: [u8; 32],
    pub meta: MediaMeta,
}

pub struct NewPost {
    pub workspace: WorkspaceId,
    pub clip_ref: String,
    pub video: MediaAssetId,
    pub cover: Option<MediaAssetId>,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
}

pub struct NewDelivery {
    pub post: PostId,
    pub channel: ChannelId,
    pub connection: ConnectionId,
    pub provider: ProviderKind,
    pub platform: Platform,
    pub publish_at: OffsetDateTime,
    pub visibility: Visibility,
    pub idempotency_key: Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Receipt {
    pub platform_post_id: Option<String>,
    pub platform_url: Option<String>,
    pub cover_check: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChannelRow {
    pub id: ChannelId,
    pub workspace: WorkspaceId,
    pub platform: Platform,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AssetRow {
    pub id: MediaAssetId,
    pub workspace: WorkspaceId,
    pub clip_ref: String,
    pub kind: MediaKind,
    pub s3_key: String,
    pub meta: MediaMeta,
}

/// What an adapter needs to act on one delivery.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeliveryRow {
    pub id: DeliveryId,
    pub workspace: WorkspaceId,
    pub post: PostId,
    pub platform: Platform,
    pub provider: ProviderKind,
    pub provider_ref: Option<ProviderRef>,
    pub status: DeliveryStatus,
    pub profile: Option<ProviderRef>,
    pub account: ProviderRef,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeliverySummary {
    pub id: DeliveryId,
    pub channel: ChannelId,
    pub channel_name: String,
    pub platform: Platform,
    pub status: DeliveryStatus,
    pub publish_at: OffsetDateTime,
    pub last_error_code: Option<String>,
    pub platform_url: Option<String>,
    pub cover_check: Option<String>,
    /// The studio clip the post was made from (the CLI finds its cover by it).
    pub clip_ref: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplyOutcome {
    Applied,
    /// The same event (same id, same body) again: nothing to do.
    Duplicate,
    /// A known id with a different body. Recorded nowhere else, applied never.
    IdReuse,
}

fn parse<T>(v: Option<T>) -> Result<T> {
    v.ok_or(StoreError::Corrupt)
}

/// Every status that may move to `to` (the lifecycle lives in the core).
fn from_states(to: DeliveryStatus) -> Vec<&'static str> {
    DeliveryStatus::ALL
        .into_iter()
        .filter(|f| f.can_move_to(to))
        .map(DeliveryStatus::as_str)
        .collect()
}

/// Values a webhook hands us go into CHECKed columns; anything else is dropped.
fn https_url(u: &Option<String>) -> Option<&str> {
    u.as_deref()
        .filter(|u| u.starts_with("https://") && u.len() <= 500)
}

fn short(v: &Option<String>) -> Option<&str> {
    v.as_deref().filter(|v| !v.is_empty() && v.len() <= 128)
}

fn event_type(t: &str) -> &str {
    let ok = (1..=100).contains(&t.len())
        && t.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'.');
    if ok {
        t
    } else {
        "unknown"
    }
}

pub struct Store {
    c: Client,
}

impl Store {
    pub fn new(client: Client) -> Self {
        Self { c: client }
    }

    // ------------------------------------------------------------ workspaces

    /// The creator's own workspace, created on first use.
    pub async fn owner_workspace(&self, user: Uuid) -> Result<WorkspaceId> {
        const SQL: &str = "
            WITH ws AS (
              INSERT INTO kubcode_accounts.workspaces (name)
              SELECT 'Workspace' WHERE NOT EXISTS (
                SELECT 1 FROM kubcode_accounts.workspace_members WHERE user_id = $1 AND role = 'owner')
              RETURNING id),
            m AS (
              INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role)
              SELECT id, $1, 'owner' FROM ws ON CONFLICT DO NOTHING RETURNING workspace_id)
            SELECT workspace_id FROM m
            UNION ALL
            SELECT workspace_id FROM kubcode_accounts.workspace_members WHERE user_id = $1 AND role = 'owner'";
        // A concurrent first use can leave this statement's snapshot empty;
        // the second try sees the winner's row.
        for _ in 0..2 {
            if let Some(row) = self.c.query_opt(SQL, &[&user]).await? {
                return Ok(WorkspaceId(row.get(0)));
            }
        }
        Err(StoreError::Conflict)
    }

    pub async fn profile(
        &self,
        ws: WorkspaceId,
        provider: ProviderKind,
    ) -> Result<Option<ProviderRef>> {
        let row = self
            .c
            .query_opt(
                "SELECT provider_ref FROM kubcode_accounts.provider_profiles
                  WHERE workspace_id = $1 AND provider = $2",
                &[&ws.0, &provider.as_str()],
            )
            .await?;
        Ok(row.map(|r| ProviderRef(r.get(0))))
    }

    pub async fn save_profile(
        &self,
        ws: WorkspaceId,
        provider: ProviderKind,
        r: &ProviderRef,
    ) -> Result<()> {
        self.c
            .execute(
                "INSERT INTO kubcode_accounts.provider_profiles (workspace_id, provider, provider_ref)
                 VALUES ($1, $2, $3) ON CONFLICT (workspace_id, provider) DO NOTHING",
                &[&ws.0, &provider.as_str(), &r.0],
            )
            .await?;
        Ok(())
    }

    pub async fn routes(&self) -> Result<RouteTable> {
        let rows = self
            .c
            .query(
                "SELECT platform, capability, provider, allow_fallback FROM kubcode_accounts.provider_routes",
                &[],
            )
            .await?;
        // Rows for platforms or providers this build does not know are skipped.
        let routes = rows
            .iter()
            .filter_map(|r| {
                Some(Route {
                    platform: Platform::parse(r.get(0))?,
                    capability: kubcode_publishing::domain::Capability::parse(r.get(1))?,
                    provider: ProviderKind::parse(r.get(2))?,
                    allow_fallback: r.get(3),
                })
            })
            .collect();
        Ok(RouteTable::new(routes))
    }

    // ------------------------------------------------------------ connect

    /// Records a new connect click; an older open click of the same member expires.
    pub async fn open_intent(&self, i: &NewIntent) -> Result<Uuid> {
        self.c
            .execute(
                "UPDATE kubcode_accounts.channel_connect_intents
                    SET status = 'expired', closed_at = now()
                  WHERE user_id = $1 AND status = 'open'",
                &[&i.user],
            )
            .await?;
        let row = self
            .c
            .query_one(
                "INSERT INTO kubcode_accounts.channel_connect_intents
                   (workspace_id, user_id, platform, provider, state_hash, cookie_hash,
                    session_binding_hash, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8))
                 RETURNING id",
                &[
                    &i.workspace.0,
                    &i.user,
                    &i.platform.as_str(),
                    &i.provider.as_str(),
                    &i.state_hash.as_slice(),
                    &i.cookie_hash.as_slice(),
                    &i.session_binding_hash.as_slice(),
                    &i.ttl.as_seconds_f64(),
                ],
            )
            .await?;
        Ok(row.get(0))
    }

    /// Single use: the intent is closed whatever happens next.
    pub async fn take_intent(&self, state_hash: &[u8; 32]) -> Result<Intent> {
        let row = self
            .c
            .query_opt(
                "UPDATE kubcode_accounts.channel_connect_intents
                    SET status = CASE WHEN expires_at > now() THEN 'consumed' ELSE 'expired' END,
                        closed_at = now()
                  WHERE state_hash = $1 AND status = 'open'
              RETURNING id, workspace_id, user_id, platform, provider, status",
                &[&state_hash.as_slice()],
            )
            .await?
            .ok_or(StoreError::IntentInvalid)?;
        if row.get::<_, &str>(5) != "consumed" {
            return Err(StoreError::IntentInvalid);
        }
        Ok(Intent {
            id: row.get(0),
            workspace: WorkspaceId(row.get(1)),
            user: row.get(2),
            platform: parse(Platform::parse(row.get(3)))?,
            provider: parse(ProviderKind::parse(row.get(4)))?,
        })
    }

    /// `code` is a fixed `[a-z_]` code, never provider text.
    pub async fn fail_intent(&self, id: Uuid, code: &str) -> Result<()> {
        self.c
            .execute(
                "UPDATE kubcode_accounts.channel_connect_intents
                    SET status = 'failed', error_code = $2
                  WHERE id = $1 AND status = 'consumed'",
                &[&id, &code],
            )
            .await?;
        Ok(())
    }

    /// Puts a freshly connected account on a channel: the same provider
    /// account keeps its channel (reconnect), a known platform account id
    /// joins its channel, anything else gets a new channel.
    pub async fn attach_connection(
        &mut self,
        i: &Intent,
        acct: &ConnectedAccount,
    ) -> Result<ChannelId> {
        let tx = self.c.transaction().await?;
        let provider = i.provider.as_str();
        let existing = tx
            .query_opt(
                "SELECT cc.id, cc.channel_id, c.workspace_id
                   FROM kubcode_accounts.channel_connections cc
                   JOIN kubcode_accounts.channels c ON c.id = cc.channel_id
                  WHERE cc.provider = $1 AND cc.provider_ref = $2
                  FOR UPDATE OF cc",
                &[&provider, &acct.account.0],
            )
            .await?;
        let channel: Uuid = match existing {
            Some(row) => {
                if row.get::<_, Uuid>(2) != i.workspace.0 {
                    return Err(StoreError::Conflict);
                }
                let (conn, channel): (Uuid, Uuid) = (row.get(0), row.get(1));
                tx.execute(
                    "UPDATE kubcode_accounts.channel_connections
                        SET status = 'active', revoked_at = NULL, last_error_code = NULL, updated_at = now()
                      WHERE id = $1",
                    &[&conn],
                )
                .await?;
                channel
            }
            None => {
                let by_platform_id = match &acct.platform_account_id {
                    Some(pid) => tx
                        .query_opt(
                            "SELECT id FROM kubcode_accounts.channels
                              WHERE workspace_id = $1 AND platform = $2 AND platform_account_id = $3",
                            &[&i.workspace.0, &i.platform.as_str(), pid],
                        )
                        .await?
                        .map(|r| r.get::<_, Uuid>(0)),
                    None => None,
                };
                let channel = match by_platform_id {
                    Some(c) => c,
                    None => tx
                        .query_one(
                            "INSERT INTO kubcode_accounts.channels
                               (workspace_id, platform, display_name, handle, platform_account_id)
                             VALUES ($1, $2, $3, $4, $5) RETURNING id",
                            &[
                                &i.workspace.0,
                                &i.platform.as_str(),
                                &acct.display_name,
                                &acct.handle,
                                &acct.platform_account_id,
                            ],
                        )
                        .await?
                        .get(0),
                };
                let inserted = tx
                    .execute(
                        "INSERT INTO kubcode_accounts.channel_connections (channel_id, provider, provider_ref)
                         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                        &[&channel, &provider, &acct.account.0],
                    )
                    .await?;
                if inserted == 0 {
                    return Err(StoreError::Conflict);
                }
                channel
            }
        };
        tx.execute(
            "UPDATE kubcode_accounts.channels
                SET display_name = $2, handle = COALESCE($3, handle), updated_at = now()
              WHERE id = $1",
            &[&channel, &acct.display_name, &acct.handle],
        )
        .await?;
        tx.execute(
            "UPDATE kubcode_accounts.channel_connect_intents SET result_channel_id = $2 WHERE id = $1",
            &[&i.id, &channel],
        )
        .await?;
        tx.execute(
            "INSERT INTO kubcode_accounts.publishing_audit_events (workspace_id, user_id, event, subject, actor)
             VALUES ($1, $2, 'channel_connected', $3, 'lambda')",
            &[&i.workspace.0, &i.user, &i.platform.as_str()],
        )
        .await?;
        tx.commit().await?;
        Ok(ChannelId(channel))
    }

    pub async fn connections(&self, channel: ChannelId) -> Result<Vec<StoredConnection>> {
        let rows = self
            .c
            .query(
                "SELECT id, provider, provider_ref, status FROM kubcode_accounts.channel_connections
                  WHERE channel_id = $1 ORDER BY connected_at",
                &[&channel.0],
            )
            .await?;
        rows.iter()
            .map(|r| {
                Ok(StoredConnection {
                    id: ConnectionId(r.get(0)),
                    provider: parse(ProviderKind::parse(r.get(1)))?,
                    provider_ref: ProviderRef(r.get(2)),
                    status: parse(ConnectionStatus::parse(r.get(3)))?,
                })
            })
            .collect()
    }

    pub async fn revoke_connection(&self, id: ConnectionId) -> Result<()> {
        self.c
            .execute(
                "UPDATE kubcode_accounts.channel_connections
                    SET status = 'revoked', revoked_at = now(), updated_at = now()
                  WHERE id = $1 AND status <> 'revoked'",
                &[&id.0],
            )
            .await?;
        Ok(())
    }

    // ------------------------------------------------------------ posts

    /// Idempotent: the same file of the same clip registers once.
    pub async fn register_asset(&self, a: &NewAsset) -> Result<MediaAssetId> {
        let seconds = a.meta.seconds.map(|s| format!("{s:.3}"));
        let inserted = self
            .c
            .query_opt(
                "INSERT INTO kubcode_accounts.media_assets
                   (workspace_id, clip_ref, kind, s3_key, sha256, bytes, content_type, width, height, seconds)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::numeric)
                 ON CONFLICT (workspace_id, clip_ref, kind, sha256) DO NOTHING
                 RETURNING id",
                &[
                    &a.workspace.0,
                    &a.clip_ref,
                    &a.kind.as_str(),
                    &a.s3_key,
                    &a.sha256.as_slice(),
                    &(a.meta.bytes as i64),
                    &a.meta.content_type,
                    &(a.meta.width as i32),
                    &(a.meta.height as i32),
                    &seconds,
                ],
            )
            .await?;
        if let Some(r) = inserted {
            return Ok(MediaAssetId(r.get(0)));
        }
        let r = self
            .c
            .query_one(
                "SELECT id FROM kubcode_accounts.media_assets
                  WHERE workspace_id = $1 AND clip_ref = $2 AND kind = $3 AND sha256 = $4",
                &[
                    &a.workspace.0,
                    &a.clip_ref,
                    &a.kind.as_str(),
                    &a.sha256.as_slice(),
                ],
            )
            .await?;
        Ok(MediaAssetId(r.get(0)))
    }

    pub async fn create_post(&self, p: &NewPost) -> Result<PostId> {
        let r = self
            .c
            .query_one(
                "INSERT INTO kubcode_accounts.posts
                   (workspace_id, clip_ref, video_asset_id, cover_asset_id, title, description, tags)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
                &[
                    &p.workspace.0,
                    &p.clip_ref,
                    &p.video.0,
                    &p.cover.map(|c| c.0),
                    &p.title,
                    &p.description,
                    &p.tags,
                ],
            )
            .await?;
        Ok(PostId(r.get(0)))
    }

    /// Binds the confirmation to the exact summary the creator saw.
    pub async fn confirm_post(&self, post: PostId, digest: &[u8; 32], user: Uuid) -> Result<bool> {
        let n = self
            .c
            .execute(
                "UPDATE kubcode_accounts.posts
                    SET status = 'confirmed', confirm_digest = $2, confirmed_at = now(),
                        confirmed_by = $3, updated_at = now()
                  WHERE id = $1 AND status = 'draft'",
                &[&post.0, &digest.as_slice(), &user],
            )
            .await?;
        Ok(n == 1)
    }

    pub async fn create_delivery(&self, d: &NewDelivery) -> Result<DeliveryId> {
        let r = self
            .c
            .query_one(
                "INSERT INTO kubcode_accounts.deliveries
                   (post_id, channel_id, connection_id, provider, platform, publish_at, visibility, idempotency_key)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
                &[
                    &d.post.0,
                    &d.channel.0,
                    &d.connection.0,
                    &d.provider.as_str(),
                    &d.platform.as_str(),
                    &d.publish_at,
                    &d.visibility.as_str(),
                    &d.idempotency_key,
                ],
            )
            .await?;
        Ok(DeliveryId(r.get(0)))
    }

    /// Deliveries already handed over for this channel in the same clock hour
    /// and UTC day as `at`.
    pub async fn velocity(&self, channel: ChannelId, at: OffsetDateTime) -> Result<Velocity> {
        let r = self
            .c
            .query_one(
                "SELECT
                   count(*) FILTER (WHERE date_trunc('hour', publish_at) = date_trunc('hour', $2::timestamptz)),
                   count(*) FILTER (WHERE (publish_at AT TIME ZONE 'UTC')::date = ($2::timestamptz AT TIME ZONE 'UTC')::date)
                   FROM kubcode_accounts.deliveries
                  WHERE channel_id = $1 AND status IN ('scheduled', 'publishing', 'published')",
                &[&channel.0, &at],
            )
            .await?;
        Ok(Velocity {
            same_hour: r.get::<_, i64>(0) as u32,
            same_day: r.get::<_, i64>(1) as u32,
        })
    }

    pub async fn mark_scheduled(&self, d: DeliveryId, provider_ref: &ProviderRef) -> Result<bool> {
        let n = self
            .c
            .execute(
                "UPDATE kubcode_accounts.deliveries
                    SET status = 'scheduled', provider_ref = $2, attempts = attempts + 1,
                        last_error_code = NULL, updated_at = now()
                  WHERE id = $1 AND status = ANY($3)",
                &[
                    &d.0,
                    &provider_ref.0,
                    &from_states(DeliveryStatus::Scheduled),
                ],
            )
            .await?;
        Ok(n == 1)
    }

    /// Moves a delivery if the lifecycle allows it; `code` for failures.
    pub async fn transition(
        &self,
        d: DeliveryId,
        to: DeliveryStatus,
        code: Option<&str>,
    ) -> Result<bool> {
        let n = self
            .c
            .execute(
                "UPDATE kubcode_accounts.deliveries
                    SET status = $2, last_error_code = COALESCE($3, last_error_code), updated_at = now()
                  WHERE id = $1 AND status = ANY($4)",
                &[&d.0, &to.as_str(), &code, &from_states(to)],
            )
            .await?;
        Ok(n == 1)
    }

    pub async fn delivery_status(&self, d: DeliveryId) -> Result<DeliveryStatus> {
        let r = self
            .c
            .query_one(
                "SELECT status FROM kubcode_accounts.deliveries WHERE id = $1",
                &[&d.0],
            )
            .await?;
        parse(DeliveryStatus::parse(r.get(0)))
    }

    pub async fn receipt(&self, d: DeliveryId) -> Result<Option<Receipt>> {
        let r = self
            .c
            .query_opt(
                "SELECT platform_post_id, platform_url, cover_check FROM kubcode_accounts.receipts
                  WHERE delivery_id = $1",
                &[&d.0],
            )
            .await?;
        Ok(r.map(|r| Receipt {
            platform_post_id: r.get(0),
            platform_url: r.get(1),
            cover_check: r.get(2),
        }))
    }

    // ------------------------------------------------------------ lookups

    /// The active site owner, if the flag is set (migration 0009).
    pub async fn owner_user(&self) -> Result<Option<Uuid>> {
        let row = self
            .c
            .query_opt(
                "SELECT id FROM kubcode_accounts.users WHERE is_owner AND status = 'active'",
                &[],
            )
            .await?;
        Ok(row.map(|r| r.get(0)))
    }

    pub async fn channel(&self, id: ChannelId) -> Result<Option<ChannelRow>> {
        let row = self
            .c
            .query_opt(
                "SELECT id, workspace_id, platform, display_name FROM kubcode_accounts.channels WHERE id = $1",
                &[&id.0],
            )
            .await?;
        row.map(|r| {
            Ok(ChannelRow {
                id: ChannelId(r.get(0)),
                workspace: WorkspaceId(r.get(1)),
                platform: parse(Platform::parse(r.get(2)))?,
                display_name: r.get(3),
            })
        })
        .transpose()
    }

    pub async fn channels_of(&self, ws: WorkspaceId) -> Result<Vec<ChannelRow>> {
        let rows = self
            .c
            .query(
                "SELECT id, workspace_id, platform, display_name FROM kubcode_accounts.channels
                  WHERE workspace_id = $1 ORDER BY created_at",
                &[&ws.0],
            )
            .await?;
        rows.iter()
            .map(|r| {
                Ok(ChannelRow {
                    id: ChannelId(r.get(0)),
                    workspace: WorkspaceId(r.get(1)),
                    platform: parse(Platform::parse(r.get(2)))?,
                    display_name: r.get(3),
                })
            })
            .collect()
    }

    pub async fn asset(&self, id: MediaAssetId) -> Result<Option<AssetRow>> {
        let row = self
            .c
            .query_opt(
                "SELECT id, workspace_id, clip_ref, kind, s3_key, bytes, content_type, width, height,
                        seconds::float8
                   FROM kubcode_accounts.media_assets WHERE id = $1",
                &[&id.0],
            )
            .await?;
        row.map(|r| {
            Ok(AssetRow {
                id: MediaAssetId(r.get(0)),
                workspace: WorkspaceId(r.get(1)),
                clip_ref: r.get(2),
                kind: parse(MediaKind::parse(r.get(3)))?,
                s3_key: r.get(4),
                meta: MediaMeta {
                    bytes: r.get::<_, i64>(5) as u64,
                    content_type: r.get(6),
                    width: r.get::<_, i32>(7) as u32,
                    height: r.get::<_, i32>(8) as u32,
                    seconds: r.get(9),
                },
            })
        })
        .transpose()
    }

    pub async fn delivery(&self, id: DeliveryId) -> Result<Option<DeliveryRow>> {
        let row = self
            .c
            .query_opt(
                "SELECT d.id, p.workspace_id, d.post_id, d.platform, d.provider, d.provider_ref, d.status,
                        pp.provider_ref, cc.provider_ref
                   FROM kubcode_accounts.deliveries d
                   JOIN kubcode_accounts.posts p ON p.id = d.post_id
                   JOIN kubcode_accounts.channel_connections cc ON cc.id = d.connection_id
                   LEFT JOIN kubcode_accounts.provider_profiles pp
                          ON pp.workspace_id = p.workspace_id AND pp.provider = d.provider
                  WHERE d.id = $1",
                &[&id.0],
            )
            .await?;
        row.map(|r| {
            Ok(DeliveryRow {
                id: DeliveryId(r.get(0)),
                workspace: WorkspaceId(r.get(1)),
                post: PostId(r.get(2)),
                platform: parse(Platform::parse(r.get(3)))?,
                provider: parse(ProviderKind::parse(r.get(4)))?,
                provider_ref: r.get::<_, Option<String>>(5).map(ProviderRef),
                status: parse(DeliveryStatus::parse(r.get(6)))?,
                profile: r.get::<_, Option<String>>(7).map(ProviderRef),
                account: ProviderRef(r.get(8)),
            })
        })
        .transpose()
    }

    pub async fn post_workspace(&self, post: PostId) -> Result<Option<WorkspaceId>> {
        let row = self
            .c
            .query_opt(
                "SELECT workspace_id FROM kubcode_accounts.posts WHERE id = $1",
                &[&post.0],
            )
            .await?;
        Ok(row.map(|r| WorkspaceId(r.get(0))))
    }

    /// The post a delivery belongs to.
    pub async fn post_of(&self, d: DeliveryId) -> Result<PostId> {
        let row = self
            .c
            .query_one(
                "SELECT post_id FROM kubcode_accounts.deliveries WHERE id = $1",
                &[&d.0],
            )
            .await?;
        Ok(PostId(row.get(0)))
    }

    /// Records what the platform served as the thumbnail (`ok` or `mismatch`;
    /// `pending` is the default and never written back). False when there is
    /// no receipt yet or the value is not one of the two.
    pub async fn set_cover_check(&self, d: DeliveryId, check: &str) -> Result<bool> {
        if !matches!(check, "ok" | "mismatch") {
            return Ok(false);
        }
        let n = self
            .c
            .execute(
                "UPDATE kubcode_accounts.receipts
                    SET cover_check = $2, cover_checked_at = now(), updated_at = now()
                  WHERE delivery_id = $1",
                &[&d.0, &check],
            )
            .await?;
        Ok(n == 1)
    }

    pub async fn post_deliveries(&self, post: PostId) -> Result<Vec<DeliverySummary>> {
        let rows = self
            .c
            .query(
                "SELECT d.id, d.channel_id, c.display_name, d.platform, d.status, d.publish_at,
                        d.last_error_code, r.platform_url, r.cover_check, p.clip_ref
                   FROM kubcode_accounts.deliveries d
                   JOIN kubcode_accounts.channels c ON c.id = d.channel_id
                   JOIN kubcode_accounts.posts p ON p.id = d.post_id
                   LEFT JOIN kubcode_accounts.receipts r ON r.delivery_id = d.id
                  WHERE d.post_id = $1 ORDER BY d.publish_at, d.id",
                &[&post.0],
            )
            .await?;
        rows.iter()
            .map(|r| {
                Ok(DeliverySummary {
                    id: DeliveryId(r.get(0)),
                    channel: ChannelId(r.get(1)),
                    channel_name: r.get(2),
                    platform: parse(Platform::parse(r.get(3)))?,
                    status: parse(DeliveryStatus::parse(r.get(4)))?,
                    publish_at: r.get(5),
                    last_error_code: r.get(6),
                    platform_url: r.get(7),
                    cover_check: r.get(8),
                    clip_ref: r.get(9),
                })
            })
            .collect()
    }

    // ------------------------------------------------------------ webhooks

    /// Records the event id with its body hash and applies the events in one
    /// transaction. Unknown refs are ignored; transitions follow the lifecycle.
    pub async fn apply_event(
        &mut self,
        provider: ProviderKind,
        v: &VerifiedDelivery,
        events: &[ProviderEvent],
    ) -> Result<ApplyOutcome> {
        let p = provider.as_str();
        let tx = self.c.transaction().await?;
        let fresh = tx
            .query_opt(
                "INSERT INTO kubcode_accounts.provider_events (provider, event_id, body_sha256, event_type)
                 VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1",
                &[&p, &v.event_id, &v.body_sha256.as_slice(), &event_type(&v.event_type)],
            )
            .await?
            .is_some();
        if !fresh {
            let stored: Vec<u8> = tx
                .query_one(
                    "SELECT body_sha256 FROM kubcode_accounts.provider_events WHERE provider = $1 AND event_id = $2",
                    &[&p, &v.event_id],
                )
                .await?
                .get(0);
            return Ok(if stored == v.body_sha256 {
                ApplyOutcome::Duplicate
            } else {
                ApplyOutcome::IdReuse
            });
        }
        for e in events {
            match e {
                ProviderEvent::PostPublished {
                    post,
                    platform_post_id,
                    url,
                    at,
                } => {
                    let moved = tx
                        .query_opt(
                            "UPDATE kubcode_accounts.deliveries SET status = 'published', updated_at = now()
                              WHERE provider = $1 AND provider_ref = $2 AND status = ANY($3) RETURNING id",
                            &[&p, &post.0, &from_states(DeliveryStatus::Published)],
                        )
                        .await?;
                    if let Some(row) = moved {
                        let id: Uuid = row.get(0);
                        tx.execute(
                            "INSERT INTO kubcode_accounts.receipts
                               (delivery_id, platform_post_id, platform_url, published_at)
                             VALUES ($1, $2, $3, COALESCE($4, now()))
                             ON CONFLICT (delivery_id) DO NOTHING",
                            &[&id, &short(platform_post_id), &https_url(url), at],
                        )
                        .await?;
                    }
                }
                ProviderEvent::PostFailed { post, code } => {
                    tx.execute(
                        "UPDATE kubcode_accounts.deliveries
                            SET status = 'failed', last_error_code = $3, updated_at = now()
                          WHERE provider = $1 AND provider_ref = $2 AND status = ANY($4)",
                        &[
                            &p,
                            &post.0,
                            &code.as_str(),
                            &from_states(DeliveryStatus::Failed),
                        ],
                    )
                    .await?;
                }
                ProviderEvent::AccountLost { account, code } => {
                    tx.execute(
                        "UPDATE kubcode_accounts.channel_connections
                            SET status = 'needs_reconnect', last_error_code = $3, updated_at = now()
                          WHERE provider = $1 AND provider_ref = $2 AND status = 'active'",
                        &[&p, &account.0, &code.as_str()],
                    )
                    .await?;
                }
                ProviderEvent::AccountConnected { account } => {
                    tx.execute(
                        "UPDATE kubcode_accounts.channel_connections
                            SET status = 'active', last_error_code = NULL, updated_at = now()
                          WHERE provider = $1 AND provider_ref = $2 AND status = 'needs_reconnect'",
                        &[&p, &account.0],
                    )
                    .await?;
                }
                // Recorded by the comment engine (docs/design/ig-comment-dm.md §4.2).
                ProviderEvent::CommentReceived(_) => {}
                ProviderEvent::Ignored { .. } => {}
            }
        }
        tx.commit().await?;
        Ok(ApplyOutcome::Applied)
    }

    // ------------------------------------------------------------ requests

    /// HMAC replay guard shared with the connect Lambda (table from 0004):
    /// false when the nonce was already used. Old nonces are pruned.
    pub async fn use_nonce(&self, nonce_hash: &[u8; 32]) -> Result<bool> {
        self.c
            .execute(
                "DELETE FROM kubcode_accounts.connect_request_nonces WHERE created_at < now() - interval '20 minutes'",
                &[],
            )
            .await?;
        let n = self
            .c
            .execute(
                "INSERT INTO kubcode_accounts.connect_request_nonces (nonce_hash) VALUES ($1) ON CONFLICT DO NOTHING",
                &[&nonce_hash.as_slice()],
            )
            .await?;
        Ok(n == 1)
    }

    // ------------------------------------------------------------ limiter

    /// Takes one slot of `limit` per fixed `window` for `key`, shared by every
    /// connection (every Lambda instance).
    pub async fn rate_acquire(&self, key: &str, limit: u32, window: Duration) -> Result<bool> {
        let secs = window.as_seconds_f64().max(1.0);
        let row = self
            .c
            .query_opt(
                "INSERT INTO kubcode_accounts.rate_windows (key, window_start, count)
                 VALUES ($1, to_timestamp(floor(extract(epoch FROM now())::float8 / $3::float8) * $3::float8), 1)
                 ON CONFLICT (key, window_start) DO UPDATE SET count = rate_windows.count + 1
                   WHERE rate_windows.count < $2
                 RETURNING count",
                &[&key, &(limit as i32), &secs],
            )
            .await?;
        let Some(row) = row else {
            return Ok(false);
        };
        if row.get::<_, i32>(0) == 1 {
            // First use of a new window: drop this key's old windows.
            self.c
                .execute(
                    "DELETE FROM kubcode_accounts.rate_windows
                      WHERE key = $1 AND window_start < now() - interval '1 day'",
                    &[&key],
                )
                .await?;
        }
        Ok(true)
    }
}
