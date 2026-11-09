//! The owner's `kubcode` CLI (docs/design/publishing-core.md §4, §10):
//! push a clip from ~/Studio to our private S3, schedule it with a confirmed
//! summary, and read its status. AWS goes through the `aws` CLI with the
//! owner's profile; every command to the ops Lambda is signed with the ops
//! key from the Keychain vault.

pub mod clip;
pub mod local;
pub mod ops;
pub mod push;
pub mod schedule;
