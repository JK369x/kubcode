//! kubcode-billing Lambda (ADR 0008 §10): Stripe Checkout month pass behind
//! one Function URL. `/api/*` for the web host (KUBCODE-HMAC-V1), and
//! `/stripe/webhook` for Stripe (Stripe-Signature).

pub mod http;
pub mod runtime;
pub mod service;
pub mod stripe;
pub mod webhook;
