//! Tunable numbers come from the environment with documented defaults
//! (orchestrator note b: max_ahead and the cover cap are config).

use std::collections::HashMap;

use kubcode_publishing::config::{ConfigError, PublishingConfig};
use kubcode_publishing::domain::Platform;

fn from(pairs: &[(&str, &str)]) -> Result<PublishingConfig, ConfigError> {
    let map: HashMap<String, String> = pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    PublishingConfig::from_lookup(|k| map.get(k).cloned())
}

#[test]
fn defaults_match_the_design() {
    let c = PublishingConfig::default();
    assert_eq!(c.max_ahead_days, 30);
    assert_eq!(c.cover_max_bytes, 2 * 1024 * 1024);
    assert_eq!(c.posts_per_hour, 25);
    assert_eq!(c.api_per_minute, 60);
    assert_eq!(c.daily_cap(Platform::Instagram), 100);
    assert_eq!(c.daily_cap(Platform::TikTok), 15);
    assert_eq!(c.daily_cap(Platform::YouTube), 50);
    assert_eq!(from(&[]).unwrap(), c);
}

#[test]
fn values_are_read_from_the_environment() {
    let c = from(&[
        ("KUBCODE_PUBLISH_MAX_AHEAD_DAYS", "60"),
        ("KUBCODE_PUBLISH_COVER_MAX_BYTES", "10485760"),
        ("KUBCODE_PUBLISH_POSTS_PER_HOUR", "10"),
        ("KUBCODE_ZERNIO_API_PER_MINUTE", "600"),
    ])
    .unwrap();
    assert_eq!(c.max_ahead_days, 60);
    assert_eq!(c.cover_max_bytes, 10 * 1024 * 1024);
    assert_eq!(c.posts_per_hour, 10);
    assert_eq!(c.api_per_minute, 600);
}

#[test]
fn bad_values_fail_loudly_instead_of_falling_back() {
    let e = from(&[("KUBCODE_PUBLISH_MAX_AHEAD_DAYS", "thirty")]).unwrap_err();
    assert_eq!(e.0, "KUBCODE_PUBLISH_MAX_AHEAD_DAYS");
    assert!(from(&[("KUBCODE_PUBLISH_POSTS_PER_HOUR", "0")]).is_err());
}
