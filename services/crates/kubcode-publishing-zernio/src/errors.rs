//! Zernio error responses → [`PublishError`] (design §3.3). Only Zernio's
//! `code`/`type` are read; the human `error` text is never kept.

use kubcode_publishing::errors::{ErrorClass, PublishError};
use serde_json::Value;

const DEFAULT_RETRY_SECS: u32 = 60;

fn s<'a>(body: &'a Value, key: &str) -> &'a str {
    body.get(key).and_then(Value::as_str).unwrap_or("")
}

/// `retry_after` is the `Retry-After` header in seconds, when present.
pub fn map_error(status: u16, retry_after: Option<u32>, body: &Value) -> PublishError {
    use ErrorClass::*;
    let code = s(body, "code");
    let kind = s(body, "type");
    let lower = code.to_ascii_lowercase();
    let e = PublishError::new;
    let retry = || {
        retry_after
            .or_else(|| {
                body.pointer("/details/retryAfterSeconds")
                    .and_then(Value::as_u64)
                    .map(|n| n.min(u64::from(u32::MAX)) as u32)
            })
            .unwrap_or(DEFAULT_RETRY_SECS)
    };

    match lower.as_str() {
        "token_expired" => return e(NeedsReconnect, "token_expired"),
        "account_disconnected" => return e(NeedsReconnect, "account_disconnected"),
        "account_not_found" => return e(NeedsReconnect, "account_not_found"),
        "account_not_enabled_for_posting" => return e(Rejected, "account_not_enabled"),
        "payment_required"
        | "profile_over_limit"
        | "message_allowance_exceeded"
        | "inbox_required" => return e(ProviderBilling, &lower),
        "idempotency_conflict" | "rate_limited" => {
            return e(
                RateLimited {
                    retry_after_secs: retry(),
                },
                "rate_limited",
            )
        }
        "invalid_resource_state" => return e(Rejected, "invalid_state"),
        _ => {}
    }

    match status {
        401 => e(Bug, "zernio_auth_failed"),
        402 => e(ProviderBilling, "payment_required"),
        403 => e(Bug, "zernio_forbidden"),
        404 => e(NotFound, "not_found"),
        409 => e(Rejected, "duplicate_content"),
        429 => e(
            RateLimited {
                retry_after_secs: retry(),
            },
            "rate_limited",
        ),
        400..=499 if kind == "platform_error" => e(Rejected, "platform_rejected"),
        400..=499 => e(Bug, "zernio_bad_request"),
        _ => e(Temporary, "provider_unavailable"),
    }
}
