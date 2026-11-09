//! One error type for every adapter (design §3.3): a fixed code in the DB's
//! `last_error_code` shape plus a class that decides what happens next.
//! Provider error text is never carried.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ErrorCode(String);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("error codes are 1-40 chars of a-z and _")]
pub struct BadErrorCode;

impl ErrorCode {
    pub fn new(code: &str) -> Result<Self, BadErrorCode> {
        let ok = (1..=40).contains(&code.len())
            && code.bytes().all(|b| b.is_ascii_lowercase() || b == b'_');
        if ok {
            Ok(Self(code.to_owned()))
        } else {
            Err(BadErrorCode)
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "class")]
pub enum ErrorClass {
    /// The connection no longer works; the creator must reconnect.
    NeedsReconnect,
    /// Try again after the delay.
    RateLimited { retry_after_secs: u32 },
    /// The platform or provider refused the content; show the creator.
    Rejected,
    /// Our provider account needs money or a bigger plan; alert the owner.
    ProviderBilling,
    /// Our request was wrong; alert the owner.
    Bug,
    /// The provider does not know the thing we asked about.
    NotFound,
    /// Network or provider trouble; retry with backoff.
    Temporary,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{class:?}: {}", code.as_str())]
pub struct PublishError {
    pub class: ErrorClass,
    pub code: ErrorCode,
}

impl PublishError {
    /// `code` must be a valid [`ErrorCode`]; adapters pass literals, so an
    /// invalid one is a programming error and falls back to `invalid_code`.
    pub fn new(class: ErrorClass, code: &str) -> Self {
        let code = ErrorCode::new(code).unwrap_or_else(|_| ErrorCode("invalid_code".into()));
        Self { class, code }
    }

    pub fn retryable(&self) -> bool {
        matches!(
            self.class,
            ErrorClass::Temporary | ErrorClass::RateLimited { .. }
        )
    }
}

pub type Result<T, E = PublishError> = std::result::Result<T, E>;
