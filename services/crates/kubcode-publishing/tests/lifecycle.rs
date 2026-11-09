//! Delivery lifecycle (design §2.1): transitions only move forward, so a late
//! or out-of-order webhook cannot undo a final state.

use kubcode_publishing::domain::DeliveryStatus::{self, *};
use kubcode_publishing::errors::{ErrorClass, ErrorCode, PublishError};

#[test]
fn the_happy_path_moves_forward() {
    assert!(Pending.can_move_to(Scheduled));
    assert!(Scheduled.can_move_to(Publishing));
    assert!(Publishing.can_move_to(Published));
    assert!(
        Scheduled.can_move_to(Published),
        "a webhook may skip publishing"
    );
}

#[test]
fn final_states_never_change() {
    for from in [Published, Cancelled, Rejected] {
        for to in DeliveryStatus::ALL {
            assert!(!from.can_move_to(to), "{from:?} -> {to:?}");
        }
    }
}

#[test]
fn a_failure_can_be_retried_or_cancelled_and_a_late_success_wins() {
    assert!(Failed.can_move_to(Scheduled));
    assert!(Failed.can_move_to(Cancelled));
    assert!(Failed.can_move_to(Published));
    assert!(
        !Publishing.can_move_to(Scheduled),
        "no going back to waiting"
    );
}

#[test]
fn rescheduling_keeps_a_delivery_scheduled() {
    assert!(Scheduled.can_move_to(Scheduled));
    assert!(Scheduled.can_move_to(Cancelled));
    assert!(!Publishing.can_move_to(Cancelled), "too late to cancel");
}

#[test]
fn status_names_round_trip() {
    for s in DeliveryStatus::ALL {
        assert_eq!(DeliveryStatus::parse(s.as_str()), Some(s));
    }
}

#[test]
fn error_codes_have_the_db_shape() {
    assert!(ErrorCode::new("platform_rejected_media").is_ok());
    assert!(ErrorCode::new("").is_err());
    assert!(ErrorCode::new("Has Spaces").is_err());
    assert!(ErrorCode::new(&"a".repeat(41)).is_err());
}

#[test]
fn only_transient_errors_are_retried() {
    let e = |class| PublishError::new(class, "x");
    assert!(e(ErrorClass::Temporary).retryable());
    assert!(e(ErrorClass::RateLimited {
        retry_after_secs: 5
    })
    .retryable());
    for class in [
        ErrorClass::NeedsReconnect,
        ErrorClass::Rejected,
        ErrorClass::ProviderBilling,
        ErrorClass::Bug,
        ErrorClass::NotFound,
    ] {
        assert!(!e(class).retryable(), "{class:?}");
    }
}
