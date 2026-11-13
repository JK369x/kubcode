//! Purchase states and the one transition that grants slots.
//!
//! `pending → paid | failed | expired`; every end state is final. Fulfilment
//! is "move pending to paid", done once: a replayed webhook, the success-page
//! check racing the webhook, or Stripe's retries all land on [`Fulfil::AlreadyPaid`].

use serde::{Deserialize, Serialize};

use crate::money::{Satang, CURRENCY};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Pending,
    Paid,
    Failed,
    Expired,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Pending => "pending",
            Status::Paid => "paid",
            Status::Failed => "failed",
            Status::Expired => "expired",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(Status::Pending),
            "paid" => Some(Status::Paid),
            "failed" => Some(Status::Failed),
            "expired" => Some(Status::Expired),
            _ => None,
        }
    }
    pub fn is_final(self) -> bool {
        !matches!(self, Status::Pending)
    }
}

/// What Stripe says about a Checkout Session (only the fields we trust).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionFacts<'a> {
    /// `payment_status`: "paid", "unpaid" or "no_payment_required".
    pub payment_status: &'a str,
    /// `status`: "open", "complete" or "expired".
    pub status: &'a str,
    pub amount_total: Option<i64>,
    pub currency: Option<&'a str>,
}

/// Why a paid-looking session must not grant anything.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Mismatch {
    Amount,
    Currency,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fulfil {
    /// Move pending → paid and add the slots, in one transaction.
    MarkPaid,
    /// Already paid: nothing to do (idempotent success).
    AlreadyPaid,
    /// Not paid yet (e.g. PromptPay QR not scanned): wait for the next event.
    Wait,
    /// Payment failed or the session expired: move pending → failed/expired.
    Close(Status),
    /// Paid at Stripe but not what we asked for: grant nothing, flag for review.
    Refuse(Mismatch),
    /// The purchase is already failed/expired: a late success needs review, never auto-grant.
    Stale,
}

/// Decide what a session update means for a purchase we stored.
pub fn decide(current: Status, expected: Satang, facts: &SessionFacts<'_>) -> Fulfil {
    if current == Status::Paid {
        return Fulfil::AlreadyPaid;
    }
    let paid = facts.payment_status == "paid";
    if current.is_final() {
        return if paid {
            Fulfil::Stale
        } else {
            Fulfil::AlreadyPaid
        };
    }
    if paid {
        if facts.currency.map(str::to_ascii_lowercase).as_deref() != Some(CURRENCY) {
            return Fulfil::Refuse(Mismatch::Currency);
        }
        if facts.amount_total != Some(expected.0) {
            return Fulfil::Refuse(Mismatch::Amount);
        }
        return Fulfil::MarkPaid;
    }
    match facts.status {
        "expired" => Fulfil::Close(Status::Expired),
        _ => Fulfil::Wait,
    }
}

/// `checkout.session.async_payment_failed` closes a pending purchase.
pub fn on_async_failed(current: Status) -> Fulfil {
    if current == Status::Pending {
        Fulfil::Close(Status::Failed)
    } else {
        Fulfil::AlreadyPaid
    }
}
