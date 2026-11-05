//! kubcode-package-signer: turns an allowed S3 object key into a short-lived
//! presigned GET URL, after checking an HMAC from the web app.
//! Contract: docs/design/package-signer.md

pub mod handler;
pub mod lambda;
pub mod presign;
pub mod request;
pub mod verify;
