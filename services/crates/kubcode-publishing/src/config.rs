//! Numbers that may change without a code change (design §3.2, orchestrator
//! note b). Read from the Lambda environment; a bad value fails at start-up
//! instead of silently falling back to the default.

use crate::domain::Platform;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublishingConfig {
    /// How far ahead a delivery may be scheduled. Zernio documents no horizon.
    pub max_ahead_days: u32,
    /// Cover size cap. Zernio's docs say 2 MB on one page and 10 MB on another.
    pub cover_max_bytes: u64,
    /// Zernio holds (does not reject) posts beyond 25/hour/account.
    pub posts_per_hour: u32,
    /// Zernio API requests per minute for the whole team (60 at <= 2 accounts).
    pub api_per_minute: u32,
    /// Overrides of the per-platform daily caps; platforms not listed use
    /// Zernio's documented values (see [`Self::daily_cap`]).
    pub daily_caps: Vec<(Platform, u32)>,
}

impl Default for PublishingConfig {
    fn default() -> Self {
        Self {
            max_ahead_days: 30,
            cover_max_bytes: 2 * 1024 * 1024,
            posts_per_hour: 25,
            api_per_minute: 60,
            daily_caps: Vec::new(),
        }
    }
}

/// The variable that held an unusable value.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("invalid value for {0}")]
pub struct ConfigError(pub &'static str);

impl PublishingConfig {
    pub fn daily_cap(&self, platform: Platform) -> u32 {
        if let Some((_, n)) = self.daily_caps.iter().find(|(p, _)| *p == platform) {
            return *n;
        }
        match platform {
            Platform::Instagram | Platform::Facebook => 100,
            Platform::Threads => 250,
            Platform::X => 50,
            Platform::Pinterest => 25,
            Platform::TikTok => 15,
            _ => 50,
        }
    }

    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|k| std::env::var(k).ok())
    }

    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let d = Self::default();
        Ok(Self {
            max_ahead_days: positive(&get, "KUBCODE_PUBLISH_MAX_AHEAD_DAYS", d.max_ahead_days)?,
            cover_max_bytes: positive(&get, "KUBCODE_PUBLISH_COVER_MAX_BYTES", d.cover_max_bytes)?,
            posts_per_hour: positive(&get, "KUBCODE_PUBLISH_POSTS_PER_HOUR", d.posts_per_hour)?,
            api_per_minute: positive(&get, "KUBCODE_ZERNIO_API_PER_MINUTE", d.api_per_minute)?,
            daily_caps: d.daily_caps,
        })
    }
}

fn positive<T>(
    get: &impl Fn(&str) -> Option<String>,
    key: &'static str,
    default: T,
) -> Result<T, ConfigError>
where
    T: std::str::FromStr + PartialOrd + Default,
{
    match get(key) {
        None => Ok(default),
        Some(raw) => match raw.trim().parse::<T>() {
            Ok(v) if v > T::default() => Ok(v),
            _ => Err(ConfigError(key)),
        },
    }
}
