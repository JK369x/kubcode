//! kubcode-publishing Lambda (docs/design/publishing-core.md §4): the web
//! host's API and Zernio's webhooks behind one Function URL, and the owner's
//! CLI commands on a second function with no URL (IAM invoke only).

pub mod http;
pub mod ops;
pub mod runtime;
pub mod service;
pub mod summary;
pub mod worker;
