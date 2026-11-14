//! The daily sweep and the in-site reminders (no email; owner 2026-11-13).
//!
//! - After grace, channels beyond the paid slots are paused, newest first
//!   (the oldest keep their slots). Nothing is deleted. A workspace that never
//!   paid is not swept.
//! - A channel paused for 14 days is disconnected from Zernio (it bills us
//!   per connected account); our data stays and the creator reconnects later.
//! - Renewal resumes paused channels up to the paid slot count, oldest first.

use serde::{Deserialize, Serialize};
use time::{Duration, OffsetDateTime};

use crate::entitlement::{disconnect_due, Entitlement, Standing};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChannelSlot<'a> {
    pub id: &'a str,
    /// When it was connected (older channels keep their slot first).
    pub created_at: OffsetDateTime,
    pub paused_at: Option<OffsetDateTime>,
    pub disconnected: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SweepPlan<'a> {
    pub pause: Vec<&'a str>,
    pub resume: Vec<&'a str>,
    pub disconnect: Vec<&'a str>,
}

/// What to change for one workspace at `now`.
pub fn plan<'a>(
    ent: &Entitlement,
    channels: &'a [ChannelSlot<'a>],
    now: OffsetDateTime,
) -> SweepPlan<'a> {
    let mut out = SweepPlan::default();
    let allowed = if ent.exempt {
        usize::MAX
    } else {
        ent.usable_slots() as usize
    };
    // Oldest first: they keep their slots.
    let mut ordered: Vec<&ChannelSlot<'a>> = channels.iter().filter(|c| !c.disconnected).collect();
    ordered.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.id.cmp(b.id)));
    // Only a workspace that has paid is swept. During grace nothing pauses;
    // a workspace that never paid (free beta channels, ADR 0003) is left as
    // it is until the owner decides how beta channels move to paid.
    let may_pause = !ent.exempt && matches!(ent.standing, Standing::Active | Standing::Lapsed);
    // Resume only inside a paid period (or exempt): never during grace, so a
    // revoke (refund, lost dispute) cannot be undone by an older pass's grace.
    let may_resume = ent.exempt || ent.standing == Standing::Active;
    for (i, c) in ordered.iter().enumerate() {
        let keep = i < allowed;
        match (keep, c.paused_at) {
            (true, Some(_)) if may_resume => out.resume.push(c.id),
            (false, None) if may_pause => out.pause.push(c.id),
            _ => {}
        }
    }
    for c in channels {
        if let Some(p) = c.paused_at {
            if !c.disconnected && now >= disconnect_due(p) && !out.resume.contains(&c.id) {
                out.disconnect.push(c.id);
            }
        }
    }
    out
}

/// Right after a purchase is revoked (full refund or lost dispute): channels
/// beyond the slots still paid for **now** pause at once, newest first, with no
/// grace (the money is gone, ADR 0008 amendment 2026-11-14). Nothing resumes
/// here and nothing is disconnected; the regular sweep handles both later.
/// `slots_now` counts only purchases that cover `now`, so a revoked pass with
/// no other coverage leaves 0, not the grace allowance.
pub fn pause_after_revoke<'a>(
    slots_now: u32,
    exempt: bool,
    channels: &'a [ChannelSlot<'a>],
) -> Vec<&'a str> {
    if exempt {
        return Vec::new();
    }
    let mut ordered: Vec<&ChannelSlot<'a>> = channels.iter().filter(|c| !c.disconnected).collect();
    ordered.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.id.cmp(b.id)));
    ordered
        .iter()
        .enumerate()
        .filter(|(i, c)| *i >= slots_now as usize && c.paused_at.is_none())
        .map(|(_, c)| c.id)
        .collect()
}

/// In-site banner on /account. One at a time, the most urgent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reminder {
    /// 7 days or less left.
    T7,
    /// 3 days or less left.
    T3,
    /// Ends today (less than 24 hours).
    T0,
    /// Past paid_until, inside grace.
    Grace,
    /// Past grace: channels paused.
    Paused,
}

impl Reminder {
    pub fn as_str(self) -> &'static str {
        match self {
            Reminder::T7 => "t7",
            Reminder::T3 => "t3",
            Reminder::T0 => "t0",
            Reminder::Grace => "grace",
            Reminder::Paused => "paused",
        }
    }
}

pub fn reminder(ent: &Entitlement, now: OffsetDateTime) -> Option<Reminder> {
    if ent.exempt {
        return None;
    }
    let until = ent.paid_until?;
    match ent.standing {
        Standing::Lapsed => Some(Reminder::Paused),
        Standing::Grace => Some(Reminder::Grace),
        Standing::Active => {
            let left = until - now;
            if left < Duration::days(1) {
                Some(Reminder::T0)
            } else if left <= Duration::days(3) {
                Some(Reminder::T3)
            } else if left <= Duration::days(7) {
                Some(Reminder::T7)
            } else {
                None
            }
        }
        Standing::None => None,
    }
}

/// Instagram comment → DM fair use: automated DMs per IG channel per calendar month.
pub const IG_DM_FAIR_USE_PER_MONTH: u32 = 5_000;

pub fn dm_allowed(sent_this_month: u32) -> bool {
    sent_this_month < IG_DM_FAIR_USE_PER_MONTH
}
