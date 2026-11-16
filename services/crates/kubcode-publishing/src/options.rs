//! Per-platform options a creator sets for one delivery (web composer
//! follow-up, verified against Zernio OpenAPI 1.615.0: PlatformTarget,
//! TikTokPlatformData, InstagramPlatformData, YouTubePlatformData).
//! Absent fields keep today's defaults, so an options-free request (the CLI)
//! serializes and hashes exactly as before.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TikTokOptions {
    /// `allowComment` (default true: the comment auto-reply needs comments).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_comment: Option<bool>,
    /// `allowDuet` (default false).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_duet: Option<bool>,
    /// `allowStitch` (default false).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_stitch: Option<bool>,
    /// `draft`: send to the TikTok app's inbox instead of posting. The only
    /// way to choose a non-public privacy on a TikTok for Business account
    /// (Zernio: "a non-public value on a video post is rejected ... unless
    /// draft is true"); the creator picks privacy in the app.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub draft: Option<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InstagramOptions {
    /// `shareToFeed` (Reels; default true).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub share_to_feed: Option<bool>,
    /// `commentsEnabled` (default true).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comments_enabled: Option<bool>,
    /// `isAiGenerated` (default false).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_generated: Option<bool>,
    /// `firstComment`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_comment: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct YouTubeOptions {
    /// `madeForKids` (default false; COPPA).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub made_for_kids: Option<bool>,
    /// `containsSyntheticMedia` (default false).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synthetic_media: Option<bool>,
    /// `categoryId` (default "22").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    /// `notifySubscribers` (default true).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notify_subscribers: Option<bool>,
    /// `firstComment`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_comment: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlatformOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tiktok: Option<TikTokOptions>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instagram: Option<InstagramOptions>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube: Option<YouTubeOptions>,
}

impl PlatformOptions {
    pub fn is_empty(&self) -> bool {
        *self == PlatformOptions::default()
    }
}

/// YouTube category ids we offer (OpenAPI YouTubePlatformData.categoryId).
pub const YOUTUBE_CATEGORIES: &[&str] = &[
    "1", "2", "10", "15", "17", "20", "22", "23", "24", "25", "26", "27", "28",
];
