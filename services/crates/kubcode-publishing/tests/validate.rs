//! Core rules every adapter inherits (design §3.2): the designed cover is
//! mandatory, platform text/media limits, the scheduling window and velocity.

use kubcode_publishing::config::PublishingConfig;
use kubcode_publishing::domain::{MediaMeta, Platform, Visibility};
use kubcode_publishing::validate::{validate_core, DeliveryDraft, Velocity};
use time::macros::datetime;
use time::{Duration, OffsetDateTime};

const NOW: OffsetDateTime = datetime!(2026-11-09 12:00 +07:00);

fn video() -> MediaMeta {
    MediaMeta {
        content_type: "video/mp4".into(),
        bytes: 12_737_641,
        width: 1080,
        height: 1920,
        seconds: Some(58.93),
    }
}

fn cover() -> MediaMeta {
    MediaMeta {
        content_type: "image/png".into(),
        bytes: 269_000,
        width: 1080,
        height: 1920,
        seconds: None,
    }
}

fn draft(platform: Platform) -> DeliveryDraft {
    DeliveryDraft {
        platform,
        title: "หมึกยักษ์หลบเรามาตลอด".into(),
        description: "คำอธิบาย".into(),
        tags: vec!["deep sea".into(), "squid".into()],
        video: video(),
        cover: Some(cover()),
        publish_at: NOW + Duration::hours(2),
        visibility: Visibility::Public,
    }
}

fn codes(d: &DeliveryDraft) -> Vec<&'static str> {
    validate_core(d, NOW, Velocity::default(), &PublishingConfig::default())
        .into_iter()
        .map(|v| v.code)
        .collect()
}

#[test]
fn a_complete_youtube_and_instagram_draft_passes() {
    assert!(codes(&draft(Platform::YouTube)).is_empty());
    assert!(codes(&draft(Platform::Instagram)).is_empty());
}

#[test]
fn the_designed_cover_is_mandatory_on_youtube_and_instagram() {
    for p in [Platform::YouTube, Platform::Instagram] {
        let mut d = draft(p);
        d.cover = None;
        assert_eq!(codes(&d), vec!["cover_missing"], "{p:?}");
    }
}

#[test]
fn the_cover_must_be_a_jpg_or_png_within_the_configured_cap() {
    let mut d = draft(Platform::YouTube);
    d.cover.as_mut().unwrap().content_type = "image/gif".into();
    assert_eq!(codes(&d), vec!["cover_type"]);

    let mut d = draft(Platform::YouTube);
    d.cover.as_mut().unwrap().bytes = 2 * 1024 * 1024 + 1;
    assert_eq!(codes(&d), vec!["cover_too_large"]);

    let cfg = PublishingConfig {
        cover_max_bytes: 10 * 1024 * 1024,
        ..PublishingConfig::default()
    };
    let v = validate_core(&d, NOW, Velocity::default(), &cfg);
    assert!(v.is_empty(), "the cap is config, not a constant: {v:?}");
}

#[test]
fn youtube_text_limits() {
    let mut d = draft(Platform::YouTube);
    d.title = String::new();
    assert_eq!(codes(&d), vec!["title_empty"]);

    let mut d = draft(Platform::YouTube);
    d.title = "ก".repeat(101);
    assert_eq!(codes(&d), vec!["title_too_long"]);
    d.title = "ก".repeat(100);
    assert!(codes(&d).is_empty(), "limits count characters, not bytes");

    let mut d = draft(Platform::YouTube);
    d.description = "x".repeat(5001);
    assert_eq!(codes(&d), vec!["description_too_long"]);

    let mut d = draft(Platform::YouTube);
    d.tags = vec!["t".repeat(250), "u".repeat(250)];
    assert_eq!(codes(&d), vec!["tags_too_long"], "the comma counts too");
    d.tags = vec!["t".repeat(249), "u".repeat(250)];
    assert!(codes(&d).is_empty());
}

#[test]
fn instagram_caption_and_reel_limits() {
    let mut d = draft(Platform::Instagram);
    d.title = String::new();
    assert!(codes(&d).is_empty(), "Instagram has no title");

    d.description = "x".repeat(2201);
    assert_eq!(codes(&d), vec!["description_too_long"]);

    let mut d = draft(Platform::Instagram);
    d.video.bytes = 300 * 1024 * 1024 + 1;
    assert_eq!(codes(&d), vec!["video_too_large"]);

    let mut d = draft(Platform::Instagram);
    d.video.seconds = Some(15.0 * 60.0 + 1.0);
    assert_eq!(codes(&d), vec!["video_too_long"]);

    let mut d = draft(Platform::Instagram);
    d.visibility = Visibility::Private;
    assert_eq!(codes(&d), vec!["visibility_unsupported"]);
}

#[test]
fn the_video_must_be_mp4_or_mov() {
    let mut d = draft(Platform::YouTube);
    d.video.content_type = "video/webm".into();
    assert_eq!(codes(&d), vec!["video_type"]);
}

#[test]
fn publish_time_must_be_inside_the_window() {
    let mut d = draft(Platform::YouTube);
    d.publish_at = NOW - Duration::minutes(5);
    assert_eq!(codes(&d), vec!["publish_in_past"]);

    d.publish_at = NOW - Duration::seconds(30);
    assert!(codes(&d).is_empty(), "a short grace covers clock skew");

    d.publish_at = NOW + Duration::days(31);
    assert_eq!(codes(&d), vec!["publish_too_far"]);

    let cfg = PublishingConfig {
        max_ahead_days: 60,
        ..PublishingConfig::default()
    };
    assert!(validate_core(&d, NOW, Velocity::default(), &cfg).is_empty());
}

#[test]
fn velocity_is_checked_against_our_own_scheduled_deliveries() {
    let d = draft(Platform::Instagram);
    let cfg = PublishingConfig::default();
    let busy_hour = Velocity {
        same_hour: 25,
        same_day: 25,
    };
    let v: Vec<_> = validate_core(&d, NOW, busy_hour, &cfg)
        .into_iter()
        .map(|v| v.code)
        .collect();
    assert_eq!(v, vec!["hourly_limit"]);

    let busy_day = Velocity {
        same_hour: 0,
        same_day: cfg.daily_cap(Platform::Instagram),
    };
    let v: Vec<_> = validate_core(&d, NOW, busy_day, &cfg)
        .into_iter()
        .map(|v| v.code)
        .collect();
    assert_eq!(v, vec!["daily_limit"]);
}

#[test]
fn every_problem_is_reported_at_once() {
    let mut d = draft(Platform::YouTube);
    d.cover = None;
    d.title = String::new();
    d.publish_at = NOW - Duration::hours(1);
    let mut c = codes(&d);
    c.sort_unstable();
    assert_eq!(c, vec!["cover_missing", "publish_in_past", "title_empty"]);
}
