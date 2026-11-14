//! Refunds and disputes after a purchase was paid (ADR 0008 amendment
//! 2026-11-14). Stripe's charge and dispute webhooks drive these; the Dashboard
//! is where the owner refunds.
//!
//! - FULL refund, or a dispute LOST: the purchase is revoked. Its slots leave
//!   the entitlement (`paid_until`/slots are recomputed from the remaining paid
//!   purchases) and channels over the new count pause at once, newest first,
//!   with no grace. Nothing is deleted.
//! - PARTIAL refund: recorded only; access is unchanged (the owner refunds
//!   partially on purpose).
//! - Dispute OPENED: flagged for review, access unchanged. WON: flag cleared.
//! - The owner's exempt workspace never pays, so nothing here touches it.
//!
//! Everything is idempotent: Stripe redelivers events, and a refund can arrive
//! as several `charge.refunded` events whose `amount_refunded` only grows.

use serde::{Deserialize, Serialize};

use crate::money::Satang;

/// Dispute state as Stripe reports it on the dispute object.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Dispute {
    Open,
    Won,
    Lost,
}

impl Dispute {
    pub fn as_str(self) -> &'static str {
        match self {
            Dispute::Open => "open",
            Dispute::Won => "won",
            Dispute::Lost => "lost",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "open" => Some(Dispute::Open),
            "won" => Some(Dispute::Won),
            "lost" => Some(Dispute::Lost),
            _ => None,
        }
    }
    /// From a closed dispute's `status`; anything else is not a final outcome.
    pub fn from_closed_status(status: &str) -> Option<Self> {
        match status {
            "won" => Some(Dispute::Won),
            "lost" => Some(Dispute::Lost),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Revoke {
    Refunded,
    DisputeLost,
}

impl Revoke {
    pub fn as_str(self) -> &'static str {
        match self {
            Revoke::Refunded => "refunded",
            Revoke::DisputeLost => "dispute_lost",
        }
    }
}

/// What we know about a paid purchase before applying an event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PaidFacts {
    pub amount: Satang,
    pub refunded: Satang,
    pub dispute: Option<Dispute>,
    pub revoked: bool,
}

/// The change to persist. `None` fields stay as they are.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Change {
    pub refunded: Option<Satang>,
    pub dispute: Option<Dispute>,
    pub revoke: Option<Revoke>,
    /// Set the purchase's review flag (`dispute_open`), or clear it.
    pub review: Option<Review>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Review {
    Flag(&'static str),
    Clear,
}

impl Change {
    pub fn is_noop(&self) -> bool {
        *self == Change::default()
    }
}

/// `charge.refunded`: `amount_refunded` is the charge's running total, so the
/// newest value wins and a replay or an out-of-order older event changes nothing.
pub fn on_refund(p: &PaidFacts, amount_refunded: Satang) -> Change {
    let mut c = Change::default();
    if amount_refunded.0 > p.refunded.0 {
        c.refunded = Some(amount_refunded);
    }
    let total = Satang(amount_refunded.0.max(p.refunded.0));
    if !p.revoked && total.0 >= p.amount.0 {
        c.revoke = Some(Revoke::Refunded);
    }
    c
}

/// `charge.dispute.created` / `charge.dispute.closed`.
pub fn on_dispute(p: &PaidFacts, d: Dispute) -> Change {
    let mut c = Change::default();
    // A final outcome is never reopened by a late "created" redelivery.
    let final_already = matches!(p.dispute, Some(Dispute::Won | Dispute::Lost));
    if final_already && d == Dispute::Open {
        return c;
    }
    if p.dispute != Some(d) {
        c.dispute = Some(d);
    }
    match d {
        Dispute::Open => {
            if p.dispute != Some(Dispute::Open) {
                c.review = Some(Review::Flag("dispute_open"));
            }
        }
        Dispute::Won => {
            if p.dispute != Some(Dispute::Won) {
                c.review = Some(Review::Clear);
            }
        }
        Dispute::Lost => {
            if !p.revoked {
                c.revoke = Some(Revoke::DisputeLost);
            }
            if p.dispute != Some(Dispute::Lost) {
                c.review = Some(Review::Clear);
            }
        }
    }
    c
}

/// Whether a refund is full (labels on /account/billing use the same rule).
pub fn is_full_refund(amount: Satang, refunded: Satang) -> bool {
    refunded.0 >= amount.0
}
