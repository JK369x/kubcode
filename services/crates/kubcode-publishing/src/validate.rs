//! Core rules for every delivery, whatever the provider (design §3.2). An
//! adapter can only schedule a [`crate::ports::Checked`] delivery, and only
//! [`crate::ports::check`] makes one, so no adapter can skip these.

use serde::{Deserialize, Serialize};
use time::{Duration, OffsetDateTime};

use crate::config::PublishingConfig;
use crate::domain::{MediaMeta, Platform, Visibility};

/// What the creator wants one channel to publish.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeliveryDraft {
    pub platform: Platform,
    pub title: String,
    /// YouTube description or Instagram caption.
    pub description: String,
    pub tags: Vec<String>,
    pub video: MediaMeta,
    pub cover: Option<MediaMeta>,
    #[serde(with = "time::serde::rfc3339")]
    pub publish_at: OffsetDateTime,
    pub visibility: Visibility,
}

/// Deliveries already scheduled for the same channel in the same hour/day.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Velocity {
    pub same_hour: u32,
    pub same_day: u32,
}

/// One broken rule. `code` has the `[a-z_]` shape shown to the creator by
/// the UI's own wording table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Violation {
    pub code: &'static str,
}

const PAST_GRACE: Duration = Duration::minutes(1);
const MIB: u64 = 1024 * 1024;

struct Limits {
    title_max: Option<usize>,
    title_required: bool,
    description_max: usize,
    tags_total_max: Option<usize>,
    video_max_bytes: u64,
    video_max_seconds: Option<f64>,
    private_allowed: bool,
}

fn limits(platform: Platform) -> Limits {
    match platform {
        Platform::YouTube => Limits {
            title_max: Some(100),
            title_required: true,
            description_max: 5_000,
            tags_total_max: Some(500),
            video_max_bytes: 256 * 1024 * MIB,
            video_max_seconds: None,
            private_allowed: true,
        },
        Platform::Instagram => Limits {
            title_max: None,
            title_required: false,
            description_max: 2_200,
            tags_total_max: None,
            video_max_bytes: 300 * MIB,
            video_max_seconds: Some(15.0 * 60.0),
            private_allowed: false,
        },
        // Platforms not opened yet get conservative limits; each one gets its
        // own row (and tests) when it is added.
        _ => Limits {
            title_max: Some(100),
            title_required: false,
            description_max: 2_200,
            tags_total_max: None,
            video_max_bytes: 300 * MIB,
            video_max_seconds: Some(10.0 * 60.0),
            private_allowed: false,
        },
    }
}

pub fn validate_core(
    d: &DeliveryDraft,
    now: OffsetDateTime,
    velocity: Velocity,
    cfg: &PublishingConfig,
) -> Vec<Violation> {
    let mut out = Vec::new();
    let mut fail = |code| out.push(Violation { code });
    let l = limits(d.platform);

    // The designed cover (owner rule). No adapter may fall back to a frame.
    match &d.cover {
        None if d.platform.needs_cover() => fail("cover_missing"),
        None => {}
        Some(c) => {
            if !matches!(c.content_type.as_str(), "image/png" | "image/jpeg") {
                fail("cover_type");
            }
            if c.bytes > cfg.cover_max_bytes {
                fail("cover_too_large");
            }
        }
    }

    let title_len = d.title.chars().count();
    if l.title_required && d.title.trim().is_empty() {
        fail("title_empty");
    }
    if l.title_max.is_some_and(|max| title_len > max) {
        fail("title_too_long");
    }
    if d.description.chars().count() > l.description_max {
        fail("description_too_long");
    }
    // YouTube counts the separators between tags toward its 500.
    let tags_total: usize =
        d.tags.iter().map(|t| t.chars().count()).sum::<usize>() + d.tags.len().saturating_sub(1);
    if l.tags_total_max.is_some_and(|max| tags_total > max) {
        fail("tags_too_long");
    }

    if !matches!(
        d.video.content_type.as_str(),
        "video/mp4" | "video/quicktime"
    ) {
        fail("video_type");
    }
    if d.video.bytes > l.video_max_bytes {
        fail("video_too_large");
    }
    if let (Some(max), Some(s)) = (l.video_max_seconds, d.video.seconds) {
        if s > max {
            fail("video_too_long");
        }
    }
    if d.visibility != Visibility::Public && !l.private_allowed {
        fail("visibility_unsupported");
    }

    if d.publish_at + PAST_GRACE < now {
        fail("publish_in_past");
    }
    if d.publish_at > now + Duration::days(i64::from(cfg.max_ahead_days)) {
        fail("publish_too_far");
    }

    if velocity.same_hour >= cfg.posts_per_hour {
        fail("hourly_limit");
    }
    if velocity.same_day >= cfg.daily_cap(d.platform) {
        fail("daily_limit");
    }
    out
}
