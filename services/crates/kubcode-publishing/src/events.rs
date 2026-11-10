//! Webhooks (design §5.4). An [`EventSource`] verifies one delivery and
//! translates it into provider events that still carry provider refs; the
//! store turns those refs into our ids and applies them under the lifecycle
//! rules, so the adapter never touches the DB.

use time::OffsetDateTime;

use crate::domain::{ProviderKind, ProviderRef};
use crate::errors::{ErrorCode, PublishError};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Headers(pub Vec<(String, String)>);

impl Headers {
    /// Case-insensitive lookup, as HTTP header names are.
    pub fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

/// A webhook delivery whose signature checked out.
#[derive(Debug, Clone, PartialEq)]
pub struct VerifiedDelivery {
    /// The provider's event id; unique per event, repeated on retries.
    pub event_id: String,
    /// SHA-256 of the raw body, stored with the id (replay/oddity guard).
    pub body_sha256: [u8; 32],
    pub event_type: String,
    pub body: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProviderEvent {
    PostPublished {
        post: ProviderRef,
        platform_post_id: Option<String>,
        url: Option<String>,
        at: Option<OffsetDateTime>,
    },
    PostFailed {
        post: ProviderRef,
        code: ErrorCode,
    },
    AccountConnected {
        account: ProviderRef,
    },
    AccountLost {
        account: ProviderRef,
        code: ErrorCode,
    },
    /// A comment on a connected account's post (comment → DM, slice 3).
    CommentReceived(IncomingComment),
    /// Stored for the record, changes nothing.
    Ignored {
        event_type: String,
    },
}

/// A received comment as the engine needs it. The text is used for matching
/// only and is not stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncomingComment {
    /// The provider's account the comment arrived on.
    pub account: ProviderRef,
    pub comment_id: String,
    pub platform_post_id: String,
    pub author_id: String,
    /// The connected account's own comment (our replies come back as events).
    pub own_account: bool,
    /// A reply inside a thread, not a top-level comment.
    pub is_reply: bool,
    pub created_at: Option<OffsetDateTime>,
    pub text: String,
}

pub trait EventSource: Send + Sync {
    fn kind(&self) -> ProviderKind;
    /// Checks the signature over the exact raw bytes received.
    fn verify(&self, headers: &Headers, raw_body: &[u8]) -> Result<VerifiedDelivery, PublishError>;
    fn translate(&self, delivery: &VerifiedDelivery) -> Vec<ProviderEvent>;
}
