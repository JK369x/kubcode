//! Refunds and disputes (ADR 0008 amendment 2026-11-14).

use kubcode_billing::entitlement::{entitlement, slots_at, PaidSpan, Standing};
use kubcode_billing::money::Satang;
use kubcode_billing::refund::{
    is_full_refund, on_dispute, on_refund, Change, Dispute, PaidFacts, Review, Revoke,
};
use kubcode_billing::sweep::{pause_after_revoke, ChannelSlot};
use time::macros::datetime;
use time::Duration;

fn paid(amount: i64) -> PaidFacts {
    PaidFacts {
        amount: Satang(amount),
        refunded: Satang(0),
        dispute: None,
        revoked: false,
    }
}

#[test]
fn a_full_refund_revokes_once() {
    let p = paid(57_800);
    let c = on_refund(&p, Satang(57_800));
    assert_eq!(c.refunded, Some(Satang(57_800)));
    assert_eq!(c.revoke, Some(Revoke::Refunded));
    // Replay after it was applied: nothing.
    let after = PaidFacts {
        refunded: Satang(57_800),
        revoked: true,
        ..p
    };
    assert!(on_refund(&after, Satang(57_800)).is_noop());
}

#[test]
fn a_partial_refund_is_recorded_without_revoking() {
    let p = paid(57_800);
    let c = on_refund(&p, Satang(10_000));
    assert_eq!(
        c,
        Change {
            refunded: Some(Satang(10_000)),
            ..Change::default()
        }
    );
    // A later refund that completes it revokes.
    let after = PaidFacts {
        refunded: Satang(10_000),
        ..p
    };
    assert_eq!(
        on_refund(&after, Satang(57_800)).revoke,
        Some(Revoke::Refunded)
    );
    // An older event arriving late never lowers the total.
    let more = PaidFacts {
        refunded: Satang(30_000),
        ..p
    };
    assert!(on_refund(&more, Satang(10_000)).is_noop());
    assert!(!is_full_refund(Satang(57_800), Satang(57_799)));
    assert!(is_full_refund(Satang(57_800), Satang(57_800)));
}

#[test]
fn disputes_flag_then_won_clears_and_lost_revokes() {
    let p = paid(28_900);
    let open = on_dispute(&p, Dispute::Open);
    assert_eq!(
        (open.dispute, open.review, open.revoke),
        (
            Some(Dispute::Open),
            Some(Review::Flag("dispute_open")),
            None
        )
    );
    let opened = PaidFacts {
        dispute: Some(Dispute::Open),
        ..p
    };
    assert!(
        on_dispute(&opened, Dispute::Open).is_noop(),
        "replayed created"
    );
    let won = on_dispute(&opened, Dispute::Won);
    assert_eq!(
        (won.dispute, won.review, won.revoke),
        (Some(Dispute::Won), Some(Review::Clear), None)
    );
    let lost = on_dispute(&opened, Dispute::Lost);
    assert_eq!(
        (lost.dispute, lost.revoke),
        (Some(Dispute::Lost), Some(Revoke::DisputeLost))
    );
    // Final outcomes are not reopened by a late "created".
    let done = PaidFacts {
        dispute: Some(Dispute::Lost),
        revoked: true,
        ..p
    };
    assert!(on_dispute(&done, Dispute::Open).is_noop());
    assert!(on_dispute(&done, Dispute::Lost).is_noop());
    // Refunded earlier, then lost: not revoked twice.
    let refunded = PaidFacts {
        revoked: true,
        dispute: Some(Dispute::Open),
        ..p
    };
    assert_eq!(on_dispute(&refunded, Dispute::Lost).revoke, None);
    assert_eq!(Dispute::from_closed_status("warning_closed"), None);
}

#[test]
fn revoking_the_current_pass_drops_coverage_now() {
    let t0 = datetime!(2026-11-14 10:00 UTC);
    let pass = PaidSpan {
        slots: 2,
        period_start: t0,
        period_end: t0 + Duration::days(30),
    };
    let renew = PaidSpan {
        slots: 3,
        period_start: t0 + Duration::days(30),
        period_end: t0 + Duration::days(60),
    };
    let add = PaidSpan {
        slots: 1,
        period_start: t0 + Duration::days(10),
        period_end: t0 + Duration::days(30),
    };
    let now = t0 + Duration::days(12);
    // Before: 3 slots now, paid until day 60.
    let all = [pass, renew, add];
    assert_eq!(slots_at(&all, now), 3);
    // Refund the mid-pass add: back to 2 now, paid_until unchanged.
    let e = entitlement(&[pass, renew], now, false);
    assert_eq!((e.slots, e.paid_until), (2, Some(t0 + Duration::days(60))));
    // Refund the renewal (bought early): 3 now, paid_until back to day 30.
    let e = entitlement(&[pass, add], now, false);
    assert_eq!(
        (e.slots, e.paid_until, e.standing),
        (3, Some(t0 + Duration::days(30)), Standing::Active)
    );
    // Refund the only pass: nothing covers now. entitlement() reports grace from
    // an older pass, if any; the immediate pause uses slots_at (no grace).
    assert_eq!(slots_at(&[], now), 0);
}

#[test]
fn channels_over_the_new_count_pause_now_newest_first() {
    let t = datetime!(2026-11-01 00:00 UTC);
    let ch = [
        ChannelSlot {
            id: "a",
            created_at: t,
            paused_at: None,
            disconnected: false,
        },
        ChannelSlot {
            id: "b",
            created_at: t + Duration::days(1),
            paused_at: None,
            disconnected: false,
        },
        ChannelSlot {
            id: "c",
            created_at: t + Duration::days(2),
            paused_at: Some(t + Duration::days(3)),
            disconnected: false,
        },
        ChannelSlot {
            id: "d",
            created_at: t + Duration::days(4),
            paused_at: None,
            disconnected: false,
        },
    ];
    assert_eq!(
        pause_after_revoke(2, false, &ch),
        vec!["d"],
        "c is already paused"
    );
    assert_eq!(pause_after_revoke(0, false, &ch), vec!["a", "b", "d"]);
    assert!(pause_after_revoke(0, true, &ch).is_empty(), "owner exempt");
    assert!(pause_after_revoke(9, false, &ch).is_empty());
}
