//! SSM secrets for the billing Lambda (its own parameters only).

use std::collections::HashMap;

use zeroize::Zeroizing;

pub const PARAM_DB_URL: &str = "/kubcode/prod/billing-db-url";
pub const PARAM_HMAC_KEY: &str = "/kubcode/prod/billing-hmac-key";
pub const PARAM_STRIPE_KEY: &str = "/kubcode/prod/stripe-secret-key";
pub const PARAM_WEBHOOK_SECRET: &str = "/kubcode/prod/stripe-webhook-secret";
/// Accepted for a day after a rotation.
pub const PARAM_WEBHOOK_SECRET_PREVIOUS: &str = "/kubcode/prod/stripe-webhook-secret-previous";
pub const ALL_PARAMS: [&str; 5] = [
    PARAM_DB_URL,
    PARAM_HMAC_KEY,
    PARAM_STRIPE_KEY,
    PARAM_WEBHOOK_SECRET,
    PARAM_WEBHOOK_SECRET_PREVIOUS,
];
pub const MIN_HMAC_KEY_BYTES: usize = 32;

pub struct Secrets {
    pub db_url: Zeroizing<String>,
    pub hmac_key: Zeroizing<Vec<u8>>,
    pub stripe_key: Zeroizing<String>,
    pub webhook_secrets: Vec<Vec<u8>>,
    pub live: bool,
}

/// Turns the SSM map into secrets, with fixed codes for what is missing.
/// Test mode only: a live key is refused unless `allow_live` (not set anywhere yet).
pub fn secrets_from(
    mut found: HashMap<String, Zeroizing<String>>,
    allow_live: bool,
) -> Result<Secrets, &'static str> {
    let db_url = found.remove(PARAM_DB_URL).ok_or("SSM_DB_URL_MISSING")?;
    let hmac = found.remove(PARAM_HMAC_KEY).ok_or("SSM_HMAC_KEY_MISSING")?;
    if hmac.len() < MIN_HMAC_KEY_BYTES {
        return Err("SSM_HMAC_KEY_TOO_SHORT");
    }
    let stripe_key = found
        .remove(PARAM_STRIPE_KEY)
        .ok_or("SSM_STRIPE_KEY_MISSING")?;
    let live = stripe_key.starts_with("sk_live_") || stripe_key.starts_with("rk_live_");
    let test = stripe_key.starts_with("sk_test_") || stripe_key.starts_with("rk_test_");
    if !(test || live) {
        return Err("SSM_STRIPE_KEY_MALFORMED");
    }
    if live && !allow_live {
        return Err("STRIPE_LIVE_KEY_REFUSED");
    }
    let webhook_secrets: Vec<Vec<u8>> = [PARAM_WEBHOOK_SECRET, PARAM_WEBHOOK_SECRET_PREVIOUS]
        .iter()
        .filter_map(|n| found.remove(*n))
        .filter(|s| s.starts_with("whsec_") && s.len() >= 20)
        .map(|s| s.as_bytes().to_vec())
        .collect();
    Ok(Secrets {
        db_url,
        hmac_key: Zeroizing::new(hmac.as_bytes().to_vec()),
        stripe_key,
        webhook_secrets,
        live,
    })
}
