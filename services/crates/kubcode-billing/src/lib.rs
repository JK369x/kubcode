//! Billing domain for kubcode Social (ADR 0008, docs/design/billing-stripe.md).
//!
//! Pure functions only: no clock, no I/O, no Stripe types. The store and the
//! Lambda pass `now` in and persist what these functions decide.
//!
//! - [`money`]: THB amounts in satang and the per-channel price.
//! - [`period`]: the one-month period of a pass.
//! - [`quote`]: what a new pass, a renewal or a mid-pass add costs.
//! - [`entitlement`]: paid slots, `paid_until`, grace, pause and disconnect dates.
//! - [`purchase`]: purchase states, the fulfilment transition and the payment check.
//! - [`sweep`]: which channels pause, which reminder is due, fair use.

pub mod entitlement;
pub mod money;
pub mod period;
pub mod purchase;
pub mod quote;
pub mod sweep;
