//! What the creator confirms (scheduler PRD: "ยืนยันตั้งเวลา" on a full
//! summary, digest-bound). The CLI shows this exact request, hashes it and
//! sends both; the Lambda recomputes the hash, so a request that differs from
//! what was shown is refused.

use kubcode_publishing::domain::Visibility;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Target {
    pub channel: Uuid,
    #[serde(with = "time::serde::rfc3339")]
    pub publish_at: OffsetDateTime,
    pub visibility: Visibility,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScheduleRequest {
    pub clip_ref: String,
    pub video_asset: Uuid,
    pub cover_asset: Option<Uuid>,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub targets: Vec<Target>,
}

/// SHA-256 over a fixed prefix and the request's JSON (struct field order is
/// fixed, so both sides serialize identically).
pub fn digest(r: &ScheduleRequest) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(b"kubcode-schedule-v1\n");
    h.update(serde_json::to_vec(r).expect("plain data serializes"));
    h.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    fn req() -> ScheduleRequest {
        ScheduleRequest {
            clip_ref: "2026-11-08_deep-sea-docs_ep01_giant-squid".into(),
            video_asset: Uuid::nil(),
            cover_asset: Some(Uuid::nil()),
            title: "หมึกยักษ์".into(),
            description: "คำอธิบาย".into(),
            tags: vec!["deep sea".into()],
            targets: vec![Target {
                channel: Uuid::nil(),
                publish_at: datetime!(2026-11-11 19:00 +07:00),
                visibility: Visibility::Private,
            }],
        }
    }

    #[test]
    fn any_change_changes_the_digest() {
        let base = digest(&req());
        assert_eq!(base, digest(&req()), "stable");
        let mut r = req();
        r.title.push('!');
        assert_ne!(digest(&r), base);
        let mut r = req();
        r.targets[0].visibility = Visibility::Public;
        assert_ne!(digest(&r), base);
        let mut r = req();
        r.targets[0].publish_at = datetime!(2026-11-11 19:01 +07:00);
        assert_ne!(digest(&r), base);
    }

    #[test]
    fn the_same_instant_in_another_offset_is_a_different_summary() {
        // The creator saw a wall-clock time; showing it in another zone is a
        // different summary, so it must be confirmed again.
        let mut r = req();
        r.targets[0].publish_at = datetime!(2026-11-11 12:00 UTC);
        assert_ne!(digest(&r), digest(&req()));
    }
}
