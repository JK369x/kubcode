//! Provider routing (design §3.1). The table is data (DB rows); this module
//! only decides, given a channel's connections, which one a capability uses.

use std::collections::HashMap;

use crate::domain::{Capability, ConnectionId, ConnectionStatus, Platform, ProviderKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Route {
    pub platform: Platform,
    pub capability: Capability,
    pub provider: ProviderKind,
    /// During a migration: a channel not yet reconnected to `provider` may
    /// keep using its active connection with the other provider.
    pub allow_fallback: bool,
}

#[derive(Debug, Clone, Default)]
pub struct RouteTable(HashMap<(Platform, Capability), Route>);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("duplicate route for {0:?}/{1:?}")]
pub struct DuplicateRoute(pub Platform, pub Capability);

impl RouteTable {
    /// For rows that come from a primary-keyed table. Panics on duplicates.
    pub fn new(routes: Vec<Route>) -> Self {
        Self::try_new(routes).expect("route rows are unique by primary key")
    }

    pub fn try_new(routes: Vec<Route>) -> Result<Self, DuplicateRoute> {
        let mut map = HashMap::new();
        for r in routes {
            let key = (r.platform, r.capability);
            if map.insert(key, r).is_some() {
                return Err(DuplicateRoute(key.0, key.1));
            }
        }
        Ok(Self(map))
    }

    pub fn get(&self, platform: Platform, capability: Capability) -> Option<&Route> {
        self.0.get(&(platform, capability))
    }
}

/// The part of a connection routing needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectionView {
    pub id: ConnectionId,
    pub provider: ProviderKind,
    pub status: ConnectionStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resolution {
    Use {
        connection: ConnectionId,
        provider: ProviderKind,
    },
    /// The channel must (re)connect through `provider` for this capability.
    NeedsReconnect { provider: ProviderKind },
    /// No route for this platform and capability.
    NotRouted,
}

pub fn resolve(
    table: &RouteTable,
    platform: Platform,
    capability: Capability,
    connections: &[ConnectionView],
) -> Resolution {
    let Some(route) = table.get(platform, capability) else {
        return Resolution::NotRouted;
    };
    let active = |provider: ProviderKind| {
        connections
            .iter()
            .find(|c| c.provider == provider && c.status == ConnectionStatus::Active)
    };
    if let Some(c) = active(route.provider) {
        return Resolution::Use {
            connection: c.id,
            provider: c.provider,
        };
    }
    if route.allow_fallback {
        if let Some(c) = connections
            .iter()
            .find(|c| c.provider != route.provider && c.status == ConnectionStatus::Active)
        {
            return Resolution::Use {
                connection: c.id,
                provider: c.provider,
            };
        }
    }
    Resolution::NeedsReconnect {
        provider: route.provider,
    }
}
