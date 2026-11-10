//! Domain types owned by kubcode (design §2). Provider ids never appear here
//! except as the opaque [`ProviderRef`], which only adapters interpret.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Generates a `&'static str` name, a strict parser and `ALL` for a fieldless
/// enum, so DB values and Rust variants cannot drift apart.
macro_rules! named_enum {
    ($(#[$m:meta])* $name:ident { $($variant:ident => $s:literal),+ $(,)? }) => {
        $(#[$m])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name { $($variant),+ }

        impl $name {
            pub const ALL: [$name; [$($s),+].len()] = [$($name::$variant),+];

            /// The name stored in the DB and used on the wire.
            pub fn as_str(self) -> &'static str {
                match self { $($name::$variant => $s),+ }
            }

            pub fn parse(s: &str) -> Option<Self> {
                match s { $($s => Some($name::$variant),)+ _ => None }
            }
        }
    };
}

named_enum!(Platform {
    YouTube => "youtube",
    Instagram => "instagram",
    TikTok => "tiktok",
    Facebook => "facebook",
    Threads => "threads",
    LinkedIn => "linkedin",
    X => "x",
    Pinterest => "pinterest",
    Bluesky => "bluesky",
});

impl Platform {
    /// Platforms where a delivery must carry the designed cover (owner rule).
    /// Others join this list when they are added and their cover path is known.
    pub fn needs_cover(self) -> bool {
        matches!(
            self,
            Platform::YouTube | Platform::Instagram | Platform::TikTok
        )
    }

    /// Platforms whose comments can be answered only in public: TikTok has
    /// no private reply to a comment (docs/design/tiktok-channel.md §3).
    pub fn public_reply_only(self) -> bool {
        matches!(self, Platform::TikTok)
    }
}

named_enum!(Capability {
    Connect => "connect",
    Publish => "publish",
    Inbox => "inbox",
    Automations => "automations",
    Analytics => "analytics",
});

named_enum!(ProviderKind {
    Zernio => "zernio",
    Native => "native",
});

named_enum!(ConnectionStatus {
    Active => "active",
    NeedsReconnect => "needs_reconnect",
    Revoked => "revoked",
});

named_enum!(Visibility {
    Public => "public",
    Private => "private",
    Unlisted => "unlisted",
});

named_enum!(MediaKind {
    Video => "video",
    Cover => "cover",
});

named_enum!(
    /// Where one delivery stands (design §2.1).
    DeliveryStatus {
        Pending => "pending",
        Rejected => "rejected",
        Scheduled => "scheduled",
        Publishing => "publishing",
        Published => "published",
        Failed => "failed",
        Cancelled => "cancelled",
    }
);

impl DeliveryStatus {
    pub fn is_final(self) -> bool {
        matches!(
            self,
            DeliveryStatus::Published | DeliveryStatus::Cancelled | DeliveryStatus::Rejected
        )
    }

    /// Whether moving from `self` to `to` is allowed. Anything else (a late
    /// webhook, a duplicate) is ignored by the caller, never applied.
    pub fn can_move_to(self, to: DeliveryStatus) -> bool {
        use DeliveryStatus::*;
        matches!(
            (self, to),
            (Pending, Scheduled | Rejected | Cancelled)
                | (
                    Scheduled,
                    Scheduled | Publishing | Published | Failed | Cancelled
                )
                | (Publishing, Published | Failed)
                | (Failed, Scheduled | Published | Cancelled)
        )
    }
}

macro_rules! id_type {
    ($($name:ident),+) => {$(
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        pub struct $name(pub Uuid);
    )+};
}

id_type!(
    WorkspaceId,
    ChannelId,
    ConnectionId,
    PostId,
    DeliveryId,
    MediaAssetId
);

/// A provider's own id for something (a Zernio profile, account or post).
/// Opaque outside the adapter that wrote it; never shown or logged.
#[derive(Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProviderRef(pub String);

impl std::fmt::Debug for ProviderRef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ProviderRef(..)")
    }
}

/// What the core knows about one media file (from `clip.json` / S3 metadata).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaMeta {
    pub content_type: String,
    pub bytes: u64,
    pub width: u32,
    pub height: u32,
    /// Duration for video; `None` for images.
    pub seconds: Option<f64>,
}
