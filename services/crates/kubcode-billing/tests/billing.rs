//! Billing domain (ADR 0008): amounts, periods, proration, entitlement,
//! fulfilment transitions, sweep and reminders.

use kubcode_billing::entitlement::{disconnect_due, entitlement, PaidSpan, Standing};
use kubcode_billing::money::{Satang, MIN_CHARGE, PRICE_PER_CHANNEL};
use kubcode_billing::period::{add_one_month, GRACE};
use kubcode_billing::purchase::{decide, on_async_failed, Fulfil, Mismatch, SessionFacts, Status};
use kubcode_billing::quote::{add_slots, month_pass, Kind, QuoteError};
use kubcode_billing::sweep::{
    dm_allowed, plan, reminder, ChannelSlot, Reminder, IG_DM_FAIR_USE_PER_MONTH,
};
use time::macros::datetime;
use time::{Duration, OffsetDateTime};

fn span(slots: u32, start: OffsetDateTime) -> PaidSpan {
    PaidSpan {
        slots,
        period_start: start,
        period_end: add_one_month(start),
    }
}

// ---------- money ----------

#[test]
fn price_is_289_baht_per_channel_in_satang() {
    assert_eq!(PRICE_PER_CHANNEL, Satang(28_900));
    assert_eq!(MIN_CHARGE, Satang(1_000));
    assert_eq!(Satang(28_901).ceil_to_baht(), Satang(29_000));
    assert_eq!(Satang(28_900).ceil_to_baht(), Satang(28_900));
    assert_eq!(Satang(28_900).as_baht_string(), "289.00");
}

// ---------- period ----------

#[test]
fn one_month_keeps_the_bangkok_day_and_clamps_month_ends() {
    // 12 Nov 10:00 Bangkok → 12 Dec 10:00 Bangkok.
    assert_eq!(
        add_one_month(datetime!(2026-11-12 03:00 UTC)),
        datetime!(2026-12-12 03:00 UTC)
    );
    // 31 Jan Bangkok → 28 Feb (2027 is not a leap year).
    assert_eq!(
        add_one_month(datetime!(2027-01-31 05:00 UTC)),
        datetime!(2027-02-28 05:00 UTC)
    );
    // 31 Jan 2028 → 29 Feb 2028 (leap).
    assert_eq!(
        add_one_month(datetime!(2028-01-31 05:00 UTC)),
        datetime!(2028-02-29 05:00 UTC)
    );
    // December rolls the year.
    assert_eq!(
        add_one_month(datetime!(2026-12-15 00:00 UTC)),
        datetime!(2027-01-15 00:00 UTC)
    );
    // 23:30 UTC on 31 Mar is 06:30 on 1 Apr in Bangkok → 1 May Bangkok.
    assert_eq!(
        add_one_month(datetime!(2027-03-31 23:30 UTC)),
        datetime!(2027-04-30 23:30 UTC)
    );
}

// ---------- quotes ----------

#[test]
fn new_pass_is_n_times_289_for_one_month() {
    let now = datetime!(2026-11-13 05:00 UTC);
    let ent = entitlement(&[], now, false);
    assert_eq!(ent.standing, Standing::None);
    let q = month_pass(&ent, 3, now).unwrap();
    assert_eq!(q.kind, Kind::New);
    assert_eq!(q.amount, Satang(3 * 28_900));
    assert_eq!(q.period_start, now);
    assert_eq!(q.period_end, add_one_month(now));
}

#[test]
fn early_renewal_starts_when_the_current_pass_ends() {
    let start = datetime!(2026-11-01 05:00 UTC);
    let now = datetime!(2026-11-25 05:00 UTC);
    let ent = entitlement(&[span(2, start)], now, false);
    let q = month_pass(&ent, 2, now).unwrap();
    assert_eq!(q.kind, Kind::Renew);
    assert_eq!(q.period_start, add_one_month(start));
    assert_eq!(q.period_end, add_one_month(add_one_month(start)));
}

#[test]
fn renewal_after_expiry_starts_now() {
    let start = datetime!(2026-10-01 05:00 UTC);
    let now = datetime!(2026-11-20 05:00 UTC);
    let ent = entitlement(&[span(1, start)], now, false);
    assert_eq!(ent.standing, Standing::Lapsed);
    let q = month_pass(&ent, 1, now).unwrap();
    assert_eq!((q.kind, q.period_start), (Kind::Renew, now));
}

#[test]
fn slot_count_is_bounded_and_owner_never_pays() {
    let now = datetime!(2026-11-13 05:00 UTC);
    let ent = entitlement(&[], now, false);
    assert_eq!(month_pass(&ent, 0, now), Err(QuoteError::BadSlots));
    assert_eq!(month_pass(&ent, 51, now), Err(QuoteError::BadSlots));
    let owner = entitlement(&[], now, true);
    assert_eq!(month_pass(&owner, 1, now), Err(QuoteError::Exempt));
    assert_eq!(add_slots(&owner, 1, now), Err(QuoteError::Exempt));
}

#[test]
fn mid_pass_add_is_prorated_to_the_same_paid_until() {
    // 30-day period (1 Nov → 1 Dec Bangkok), 15 days left → half of 289 = 144.50 → 145.
    let start = datetime!(2026-10-31 17:00 UTC);
    let now = start + Duration::days(15);
    let ent = entitlement(&[span(1, start)], now, false);
    let q = add_slots(&ent, 1, now).unwrap();
    assert_eq!(q.kind, Kind::Add);
    assert_eq!(q.period_end, add_one_month(start));
    assert_eq!(q.period_start, now);
    assert_eq!(q.amount, Satang(14_500));
    // Two extra slots: 289 exactly.
    assert_eq!(add_slots(&ent, 2, now).unwrap().amount, Satang(28_900));
}

#[test]
fn add_rounds_up_and_never_goes_below_ten_baht() {
    let start = datetime!(2026-10-31 17:00 UTC);
    // One second in: still the full price, rounded up.
    let q = add_slots(
        &entitlement(&[span(1, start)], start + Duration::seconds(1), false),
        1,
        start + Duration::seconds(1),
    )
    .unwrap();
    assert_eq!(q.amount, Satang(28_900));
    // One hour left: 289 / 720 ≈ 0.40 → minimum ฿10.
    let end = add_one_month(start);
    let late = end - Duration::hours(1);
    assert_eq!(
        add_slots(&entitlement(&[span(1, start)], late, false), 1, late)
            .unwrap()
            .amount,
        MIN_CHARGE
    );
    // Every amount is a whole baht.
    for h in [1, 7, 50, 333, 500, 719] {
        let t = start + Duration::hours(h);
        let a = add_slots(&entitlement(&[span(1, start)], t, false), 1, t)
            .unwrap()
            .amount;
        assert_eq!(a.0 % 100, 0, "hour {h}");
        assert!(a >= MIN_CHARGE && a <= PRICE_PER_CHANNEL, "hour {h}");
    }
}

#[test]
fn add_needs_an_active_pass() {
    let now = datetime!(2026-11-13 05:00 UTC);
    assert_eq!(
        add_slots(&entitlement(&[], now, false), 1, now),
        Err(QuoteError::NoActivePass)
    );
    let start = datetime!(2026-10-01 05:00 UTC);
    let grace = add_one_month(start) + Duration::days(1);
    assert_eq!(
        add_slots(&entitlement(&[span(1, start)], grace, false), 1, grace),
        Err(QuoteError::NoActivePass)
    );
}

// ---------- entitlement ----------

#[test]
fn slots_add_up_and_renewals_chain_paid_until() {
    let start = datetime!(2026-11-01 05:00 UTC);
    let end = add_one_month(start);
    let add = PaidSpan {
        slots: 2,
        period_start: start + Duration::days(10),
        period_end: end,
    };
    let renew = span(3, end);
    let now = start + Duration::days(12);
    let e = entitlement(&[span(1, start), add, renew], now, false);
    assert_eq!(e.slots, 3);
    assert_eq!(e.standing, Standing::Active);
    assert_eq!(e.paid_until, Some(add_one_month(end)), "renewal chains on");
    // Before the add: only 1.
    assert_eq!(
        entitlement(&[span(1, start), add], start + Duration::days(5), false).slots,
        1
    );
}

#[test]
fn grace_keeps_slots_for_three_days_then_lapses() {
    let start = datetime!(2026-10-01 05:00 UTC);
    let until = add_one_month(start);
    let spans = [span(2, start)];
    let g = entitlement(&spans, until + Duration::days(1), false);
    assert_eq!(
        (g.standing, g.slots, g.paid_until),
        (Standing::Grace, 2, Some(until))
    );
    assert_eq!(g.grace_until(), Some(until + GRACE));
    let l = entitlement(&spans, until + GRACE, false);
    assert_eq!((l.standing, l.slots), (Standing::Lapsed, 0));
}

#[test]
fn owner_workspace_is_exempt() {
    let e = entitlement(&[], datetime!(2026-11-13 05:00 UTC), true);
    assert!(e.exempt);
    assert_eq!(e.usable_slots(), u32::MAX);
    assert_eq!(reminder(&e, datetime!(2026-11-13 05:00 UTC)), None);
}

// ---------- fulfilment ----------

fn facts<'a>(
    ps: &'a str,
    st: &'a str,
    amount: Option<i64>,
    cur: Option<&'a str>,
) -> SessionFacts<'a> {
    SessionFacts {
        payment_status: ps,
        status: st,
        amount_total: amount,
        currency: cur,
    }
}

#[test]
fn paid_session_with_matching_amount_marks_paid_once() {
    let ok = facts("paid", "complete", Some(57_800), Some("thb"));
    assert_eq!(
        decide(Status::Pending, Satang(57_800), &ok),
        Fulfil::MarkPaid
    );
    // Replay / success page racing the webhook: already paid, no second grant.
    assert_eq!(
        decide(Status::Paid, Satang(57_800), &ok),
        Fulfil::AlreadyPaid
    );
    assert_eq!(
        decide(
            Status::Pending,
            Satang(57_800),
            &facts("paid", "complete", Some(57_800), Some("THB"))
        ),
        Fulfil::MarkPaid
    );
}

#[test]
fn wrong_amount_or_currency_grants_nothing() {
    assert_eq!(
        decide(
            Status::Pending,
            Satang(28_900),
            &facts("paid", "complete", Some(100), Some("thb"))
        ),
        Fulfil::Refuse(Mismatch::Amount)
    );
    assert_eq!(
        decide(
            Status::Pending,
            Satang(28_900),
            &facts("paid", "complete", None, Some("thb"))
        ),
        Fulfil::Refuse(Mismatch::Amount)
    );
    assert_eq!(
        decide(
            Status::Pending,
            Satang(28_900),
            &facts("paid", "complete", Some(28_900), Some("usd"))
        ),
        Fulfil::Refuse(Mismatch::Currency)
    );
    assert_eq!(
        decide(
            Status::Pending,
            Satang(28_900),
            &facts("paid", "complete", Some(28_900), None)
        ),
        Fulfil::Refuse(Mismatch::Currency)
    );
}

#[test]
fn unpaid_waits_expired_closes_failed_closes() {
    assert_eq!(
        decide(
            Status::Pending,
            Satang(28_900),
            &facts("unpaid", "complete", Some(28_900), Some("thb"))
        ),
        Fulfil::Wait
    );
    assert_eq!(
        decide(
            Status::Pending,
            Satang(28_900),
            &facts("unpaid", "open", Some(28_900), Some("thb"))
        ),
        Fulfil::Wait
    );
    assert_eq!(
        decide(
            Status::Pending,
            Satang(28_900),
            &facts("unpaid", "expired", Some(28_900), Some("thb"))
        ),
        Fulfil::Close(Status::Expired)
    );
    assert_eq!(
        on_async_failed(Status::Pending),
        Fulfil::Close(Status::Failed)
    );
    assert_eq!(on_async_failed(Status::Paid), Fulfil::AlreadyPaid);
}

#[test]
fn a_late_payment_on_a_closed_purchase_is_never_auto_granted() {
    let paid = facts("paid", "complete", Some(28_900), Some("thb"));
    assert_eq!(
        decide(Status::Expired, Satang(28_900), &paid),
        Fulfil::Stale
    );
    assert_eq!(decide(Status::Failed, Satang(28_900), &paid), Fulfil::Stale);
    assert_eq!(
        decide(
            Status::Expired,
            Satang(28_900),
            &facts("unpaid", "expired", None, None)
        ),
        Fulfil::AlreadyPaid
    );
}

#[test]
fn status_names_round_trip() {
    for s in [
        Status::Pending,
        Status::Paid,
        Status::Failed,
        Status::Expired,
    ] {
        assert_eq!(Status::parse(s.as_str()), Some(s));
    }
    for k in [Kind::New, Kind::Renew, Kind::Add] {
        assert_eq!(Kind::parse(k.as_str()), Some(k));
    }
    assert_eq!(Status::parse("refunded"), None);
}

// ---------- sweep ----------

fn ch(id: &'static str, day: i64, paused: Option<OffsetDateTime>) -> ChannelSlot<'static> {
    ChannelSlot {
        id,
        created_at: datetime!(2026-09-01 00:00 UTC) + Duration::days(day),
        paused_at: paused,
        disconnected: false,
    }
}

#[test]
fn lapsed_workspace_pauses_every_channel_grace_pauses_none() {
    let start = datetime!(2026-10-01 05:00 UTC);
    let until = add_one_month(start);
    let chans = [ch("a", 1, None), ch("b", 2, None)];
    let grace = entitlement(&[span(2, start)], until + Duration::days(2), false);
    assert!(plan(&grace, &chans, until + Duration::days(2))
        .pause
        .is_empty());
    let lapsed = entitlement(&[span(2, start)], until + GRACE, false);
    assert_eq!(plan(&lapsed, &chans, until + GRACE).pause, vec!["a", "b"]);
}

#[test]
fn over_the_slot_count_the_newest_channels_pause() {
    let start = datetime!(2026-11-01 05:00 UTC);
    let now = start + Duration::days(3);
    let ent = entitlement(&[span(2, start)], now, false);
    let chans = [ch("new", 30, None), ch("old", 1, None), ch("mid", 10, None)];
    let p = plan(&ent, &chans, now);
    assert_eq!(p.pause, vec!["new"]);
    assert!(p.resume.is_empty());
}

#[test]
fn renewal_resumes_paused_channels_oldest_first() {
    let start = datetime!(2026-11-01 05:00 UTC);
    let now = start + Duration::days(1);
    let paused = start - Duration::days(2);
    let ent = entitlement(&[span(1, start)], now, false);
    let chans = [ch("b", 2, Some(paused)), ch("a", 1, Some(paused))];
    let p = plan(&ent, &chans, now);
    assert_eq!(p.resume, vec!["a"]);
    assert!(p.pause.is_empty(), "already paused");
}

#[test]
fn paused_14_days_disconnects_never_paid_is_left_alone() {
    let start = datetime!(2026-09-01 05:00 UTC);
    let paused_at = add_one_month(start) + GRACE;
    assert_eq!(disconnect_due(paused_at), paused_at + Duration::days(14));
    let now = paused_at + Duration::days(14);
    let ent = entitlement(&[span(1, start)], now, false);
    let chans = [
        ch("a", 1, Some(paused_at)),
        ch("b", 2, Some(paused_at + Duration::days(1))),
    ];
    assert_eq!(plan(&ent, &chans, now).disconnect, vec!["a"]);
    // Free beta workspace that never paid: nothing is paused.
    let free = entitlement(&[], now, false);
    assert!(plan(&free, &[ch("x", 1, None)], now).pause.is_empty());
    // Owner: never paused.
    let owner = entitlement(&[], now, true);
    assert!(plan(&owner, &[ch("x", 1, None)], now).pause.is_empty());
}

// ---------- reminders and fair use ----------

#[test]
fn reminders_follow_the_time_left() {
    let start = datetime!(2026-11-01 05:00 UTC);
    let until = add_one_month(start);
    let spans = [span(1, start)];
    let at = |t: OffsetDateTime| reminder(&entitlement(&spans, t, false), t);
    assert_eq!(at(until - Duration::days(10)), None);
    assert_eq!(at(until - Duration::days(7)), Some(Reminder::T7));
    assert_eq!(at(until - Duration::days(3)), Some(Reminder::T3));
    assert_eq!(at(until - Duration::hours(5)), Some(Reminder::T0));
    assert_eq!(at(until + Duration::days(1)), Some(Reminder::Grace));
    assert_eq!(at(until + GRACE), Some(Reminder::Paused));
    assert_eq!(reminder(&entitlement(&[], until, false), until), None);
}

#[test]
fn ig_dm_fair_use_is_5000_per_channel_per_month() {
    assert_eq!(IG_DM_FAIR_USE_PER_MONTH, 5_000);
    assert!(dm_allowed(4_999));
    assert!(!dm_allowed(5_000));
}
