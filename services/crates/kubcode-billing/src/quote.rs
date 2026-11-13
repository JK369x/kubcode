//! What a purchase costs. Three kinds, one renewal date per workspace:
//!
//! - **New / renew**: N slots for one month from `max(now, paid_until)`.
//! - **Add** (mid-pass): extra slots up to the *same* `paid_until`, prorated
//!   by the time left in the current period, rounded up to the baht, at
//!   least ฿10 (Stripe's THB minimum).

use serde::{Deserialize, Serialize};
use thiserror::Error;
use time::OffsetDateTime;

use crate::entitlement::{Entitlement, Standing};
use crate::money::{Satang, MAX_SLOTS, MIN_CHARGE, PRICE_PER_CHANNEL};
use crate::period::add_one_month;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    New,
    Renew,
    Add,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::New => "new",
            Kind::Renew => "renew",
            Kind::Add => "add",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "new" => Some(Kind::New),
            "renew" => Some(Kind::Renew),
            "add" => Some(Kind::Add),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quote {
    pub kind: Kind,
    pub slots: u32,
    pub amount: Satang,
    #[serde(with = "time::serde::rfc3339")]
    pub period_start: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub period_end: OffsetDateTime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QuoteError {
    #[error("slots must be between 1 and the maximum")]
    BadSlots,
    #[error("the owner's workspace does not pay")]
    Exempt,
    #[error("nothing to add to: no active pass")]
    NoActivePass,
    #[error("the pass ends too soon to add to; renew instead")]
    TooLateToAdd,
}

fn check_slots(slots: u32) -> Result<(), QuoteError> {
    if slots == 0 || slots > MAX_SLOTS {
        Err(QuoteError::BadSlots)
    } else {
        Ok(())
    }
}

/// A month pass: new when nothing is active, otherwise a renewal that starts
/// when the current coverage ends (no paid day is lost by renewing early).
pub fn month_pass(ent: &Entitlement, slots: u32, now: OffsetDateTime) -> Result<Quote, QuoteError> {
    check_slots(slots)?;
    if ent.exempt {
        return Err(QuoteError::Exempt);
    }
    let (kind, start) = match (ent.standing, ent.paid_until) {
        (Standing::Active, Some(until)) => (Kind::Renew, until.max(now)),
        (Standing::Grace | Standing::Lapsed, Some(_)) => (Kind::Renew, now),
        _ => (Kind::New, now),
    };
    Ok(Quote {
        kind,
        slots,
        amount: Satang(PRICE_PER_CHANNEL.0 * i64::from(slots)),
        period_start: start,
        period_end: add_one_month(start),
    })
}

/// Extra slots for the rest of the current period, ending on the same
/// `paid_until`. Prorated per second of the period, rounded up to the baht.
pub fn add_slots(ent: &Entitlement, extra: u32, now: OffsetDateTime) -> Result<Quote, QuoteError> {
    check_slots(extra)?;
    if ent.exempt {
        return Err(QuoteError::Exempt);
    }
    let (Standing::Active, Some(start), Some(until)) =
        (ent.standing, ent.period_start, ent.paid_until)
    else {
        return Err(QuoteError::NoActivePass);
    };
    if ent.slots + extra > MAX_SLOTS {
        return Err(QuoteError::BadSlots);
    }
    // Prorate against the period that contains now; a chained renewal after
    // it is not part of this add (the creator renews N + extra next time).
    let period_end = add_one_month(start).min(until);
    let total = (period_end - start).whole_seconds();
    let left = (period_end - now).whole_seconds();
    if total <= 0 || left <= 0 {
        return Err(QuoteError::TooLateToAdd);
    }
    let full = i128::from(PRICE_PER_CHANNEL.0) * i128::from(extra);
    // Ceil(full * left / total) in satang, then up to the whole baht.
    let raw = (full * i128::from(left) + i128::from(total) - 1) / i128::from(total);
    let amount = Satang(raw as i64).ceil_to_baht().max(MIN_CHARGE);
    Ok(Quote {
        kind: Kind::Add,
        slots: extra,
        amount,
        period_start: now,
        period_end,
    })
}
