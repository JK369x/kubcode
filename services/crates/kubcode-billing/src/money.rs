//! Money: Thai baht in satang (1 THB = 100 satang), the unit Stripe uses for
//! THB (`amount=28900` is ฿289.00).

use serde::{Deserialize, Serialize};

/// An amount in satang. Never negative in this domain.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Satang(pub i64);

impl Satang {
    pub const fn baht(b: i64) -> Self {
        Satang(b * 100)
    }

    /// Rounded up to a whole baht (prorated amounts are charged in whole baht).
    pub fn ceil_to_baht(self) -> Self {
        Satang((self.0 + 99).div_euclid(100) * 100)
    }

    pub fn as_baht_string(self) -> String {
        format!("{}.{:02}", self.0 / 100, self.0 % 100)
    }
}

/// The only currency sold (Adaptive Pricing is off; owner, ADR 0007).
pub const CURRENCY: &str = "thb";

/// Social: ฿289 per connected channel per month, every channel the same price.
pub const PRICE_PER_CHANNEL: Satang = Satang::baht(289);

/// Stripe's minimum charge in THB.
pub const MIN_CHARGE: Satang = Satang::baht(10);

/// Most slots one workspace can hold (a guard against typos, not a product limit).
pub const MAX_SLOTS: u32 = 50;
