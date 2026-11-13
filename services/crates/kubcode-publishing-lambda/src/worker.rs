//! The scheduled comment → DM worker (docs/design/ig-comment-dm.md §4.2,
//! §4.8): EventBridge Scheduler invokes it every minute; every tenth minute it
//! first catches up on comments the webhook missed, then it sends.

use serde_json::{json, Value};

use crate::service::Service;

/// One run at `minute` (0–59 of the hour). Returns a small summary; failures
/// are reported as codes, never with comment data.
pub async fn run(svc: &mut Service<'_>, minute: u8) -> Value {
    let kept = if minute % 10 == 0 {
        match svc.catch_up().await {
            Ok(n) => n,
            Err(f) => return json!({"ok": false, "code": f.code, "step": "catch_up"}),
        }
    } else {
        0
    };
    // Billing sweep (ADR 0008): every 10 minutes, after catch-up.
    let (cancelled, disconnected) = if minute % 10 == 5 {
        match svc.billing_sweep().await {
            Ok(n) => n,
            Err(f) => {
                return json!({"ok": false, "code": f.code, "step": "billing_sweep", "kept": kept})
            }
        }
    } else {
        (0, 0)
    };
    match svc.work().await {
        Ok(done) => {
            json!({"ok": true, "kept": kept, "handled": done.len(), "paused_cancelled": cancelled, "paused_disconnected": disconnected})
        }
        Err(f) => json!({"ok": false, "code": f.code, "step": "work", "kept": kept}),
    }
}
