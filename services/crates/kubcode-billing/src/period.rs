//! The period a month pass covers: from `start` to the same wall-clock time
//! one calendar month later (31 Jan → 28/29 Feb, the day is clamped).
//! All instants are UTC; the month is counted in Asia/Bangkok (UTC+7, no DST)
//! so "the 31st" means the Thai date the creator sees.

use time::{Date, Duration, Month, OffsetDateTime, UtcOffset};

const BANGKOK: UtcOffset = match UtcOffset::from_hms(7, 0, 0) {
    Ok(o) => o,
    Err(_) => panic!("valid offset"),
};

/// `start` plus one calendar month (Bangkok dates), as a UTC instant.
pub fn add_one_month(start: OffsetDateTime) -> OffsetDateTime {
    let local = start.to_offset(BANGKOK);
    let (y, m) = if local.month() == Month::December {
        (local.year() + 1, Month::January)
    } else {
        (local.year(), local.month().next())
    };
    let last = last_day(y, m);
    let day = local.day().min(last);
    let date = Date::from_calendar_date(y, m, day).expect("clamped day is valid");
    date.with_time(local.time())
        .assume_offset(BANGKOK)
        .to_offset(time::UtcOffset::UTC)
}

fn last_day(year: i32, month: Month) -> u8 {
    month.length(year)
}

/// Days after `paid_until` during which paid channels keep working.
pub const GRACE: Duration = Duration::days(3);

/// Days a channel stays paused before it is disconnected from Zernio.
pub const DISCONNECT_AFTER_PAUSE: Duration = Duration::days(14);
