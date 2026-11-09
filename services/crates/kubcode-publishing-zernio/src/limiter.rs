//! Client-side limit on Zernio API calls (design §5.6). The limit is shared by
//! every creator, so production uses a Postgres-backed limiter (Lambda
//! instances share nothing); [`MinuteWindow`] is for tests and local tools.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use kubcode_publishing::errors::{ErrorClass, PublishError};

#[async_trait]
pub trait Limiter: Send + Sync {
    /// Takes one request slot, or says how long to wait.
    async fn acquire(&self) -> Result<(), PublishError>;
}

pub struct MinuteWindow {
    limit: u32,
    state: Mutex<(Instant, u32)>,
}

impl MinuteWindow {
    pub fn new(limit: u32) -> Self {
        Self {
            limit,
            state: Mutex::new((Instant::now(), 0)),
        }
    }
}

#[async_trait]
impl Limiter for MinuteWindow {
    async fn acquire(&self) -> Result<(), PublishError> {
        let mut s = self.state.lock().expect("limiter state");
        let elapsed = s.0.elapsed();
        if elapsed >= Duration::from_secs(60) {
            *s = (Instant::now(), 0);
        }
        if s.1 >= self.limit {
            let wait = 60u64.saturating_sub(s.0.elapsed().as_secs()).max(1);
            return Err(PublishError::new(
                ErrorClass::RateLimited {
                    retry_after_secs: wait as u32,
                },
                "client_rate_limited",
            ));
        }
        s.1 += 1;
        Ok(())
    }
}
