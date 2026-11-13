//! What a workspace has paid for, derived from its paid purchases.
//!
//! Each paid purchase covers `slots` channels from `period_start` to
//! `period_end`. Purchases may overlap (a mid-pass add covers the rest of the
//! current period) or chain (a renewal starts where the last one ends).

use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::period::{DISCONNECT_AFTER_PAUSE, GRACE};

/// One paid purchase as the entitlement sees it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaidSpan {
    pub slots: u32,
    #[serde(with = "time::serde::rfc3339")]
    pub period_start: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub period_end: OffsetDateTime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Standing {
    /// Never paid (or the owner's exempt workspace: see [`Entitlement::exempt`]).
    None,
    /// Inside a paid period.
    Active,
    /// Past `paid_until` but inside the 3-day grace: everything keeps working.
    Grace,
    /// Past grace: channels beyond the paid slots (all of them) are paused.
    Lapsed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entitlement {
    /// Slots paid for at `now` (0 when lapsed or never paid).
    pub slots: u32,
    /// Start of the period that contains `now` (or the last one).
    #[serde(with = "time::serde::rfc3339::option")]
    pub period_start: Option<OffsetDateTime>,
    /// End of the paid coverage that contains (or last contained) `now`,
    /// following renewals that chain on without a gap.
    #[serde(with = "time::serde::rfc3339::option")]
    pub paid_until: Option<OffsetDateTime>,
    pub standing: Standing,
    /// The owner's own workspace never pays and is never paused.
    pub exempt: bool,
}

impl Entitlement {
    pub fn grace_until(&self) -> Option<OffsetDateTime> {
        self.paid_until.map(|p| p + GRACE)
    }

    /// Channels that may be active right now. During grace the last paid
    /// slot count still applies; once lapsed it is 0.
    pub fn usable_slots(&self) -> u32 {
        if self.exempt {
            return u32::MAX;
        }
        self.slots
    }
}

/// Slots active at `t` (sum of every paid span that contains `t`).
fn slots_at(spans: &[PaidSpan], t: OffsetDateTime) -> u32 {
    spans
        .iter()
        .filter(|s| s.period_start <= t && t < s.period_end)
        .map(|s| s.slots)
        .sum()
}

/// The end of coverage reachable from `t` without a gap.
fn chain_end(spans: &[PaidSpan], from: OffsetDateTime) -> OffsetDateTime {
    let mut end = from;
    loop {
        let next = spans
            .iter()
            .filter(|s| s.period_start <= end && s.period_end > end)
            .map(|s| s.period_end)
            .max();
        match next {
            Some(n) => end = n,
            None => return end,
        }
    }
}

pub fn entitlement(spans: &[PaidSpan], now: OffsetDateTime, exempt: bool) -> Entitlement {
    if exempt {
        return Entitlement {
            slots: u32::MAX,
            period_start: None,
            paid_until: None,
            standing: Standing::Active,
            exempt: true,
        };
    }
    let current: Vec<&PaidSpan> = spans
        .iter()
        .filter(|s| s.period_start <= now && now < s.period_end)
        .collect();
    if !current.is_empty() {
        let period_start = current.iter().map(|s| s.period_start).min();
        return Entitlement {
            slots: slots_at(spans, now),
            period_start,
            paid_until: Some(chain_end(spans, now)),
            standing: Standing::Active,
            exempt: false,
        };
    }
    // Not covered now: look at the most recent coverage that ended before now.
    let Some(last) = spans
        .iter()
        .filter(|s| s.period_end <= now)
        .max_by_key(|s| s.period_end)
    else {
        return Entitlement {
            slots: 0,
            period_start: None,
            paid_until: None,
            standing: Standing::None,
            exempt: false,
        };
    };
    let paid_until = last.period_end;
    // The slot count that was active at the very end of coverage.
    let last_slots = slots_at(spans, paid_until - time::Duration::nanoseconds(1));
    let in_grace = now < paid_until + GRACE;
    Entitlement {
        slots: if in_grace { last_slots } else { 0 },
        period_start: Some(last.period_start),
        paid_until: Some(paid_until),
        standing: if in_grace {
            Standing::Grace
        } else {
            Standing::Lapsed
        },
        exempt: false,
    }
}

/// When a channel paused at `paused_at` is disconnected from Zernio.
pub fn disconnect_due(paused_at: OffsetDateTime) -> OffsetDateTime {
    paused_at + DISCONNECT_AFTER_PAUSE
}
