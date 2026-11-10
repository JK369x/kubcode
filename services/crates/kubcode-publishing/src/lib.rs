//! Publishing core (docs/design/publishing-core.md): kubcode's own domain,
//! one port per capability, provider routing and the rules every adapter
//! inherits. Adapters (Zernio now, native later) live in other crates.

pub mod automation;
pub mod config;
pub mod domain;
pub mod errors;
pub mod events;
pub mod ports;
pub mod routing;
pub mod validate;

#[cfg(feature = "contract")]
pub mod contract;
#[cfg(feature = "contract")]
pub mod fake;
