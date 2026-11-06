//! kubcode-oauth-connect Lambda (docs/design/settings-keys.md §2, §2a): finishes
//! the OAuth connect flow for YouTube and Instagram. The web host proves each
//! request with an HMAC; this Lambda holds the only path to plaintext (KMS
//! Decrypt on the wrap key), exchanges the code, seals the long-lived token
//! and writes the connection as the DB role `kubcode_worker`.

pub mod auth;
pub mod aws;
pub mod db;
pub mod flow;
pub mod handler;
pub mod providers;
pub mod unwrap;
