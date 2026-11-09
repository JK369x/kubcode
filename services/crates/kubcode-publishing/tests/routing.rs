//! Provider routing (design §3.1): the route picks the provider, the channel
//! must hold an active connection with it, and the dual-run fallback keeps an
//! old connection working while creators reconnect.

use kubcode_publishing::domain::{
    Capability, ConnectionId, ConnectionStatus, Platform, ProviderKind,
};
use kubcode_publishing::routing::{resolve, ConnectionView, Resolution, Route, RouteTable};
use uuid::Uuid;

fn conn(provider: ProviderKind, status: ConnectionStatus) -> ConnectionView {
    ConnectionView {
        id: ConnectionId(Uuid::new_v4()),
        provider,
        status,
    }
}

fn table(provider: ProviderKind, allow_fallback: bool) -> RouteTable {
    RouteTable::new(vec![Route {
        platform: Platform::YouTube,
        capability: Capability::Publish,
        provider,
        allow_fallback,
    }])
}

#[test]
fn an_active_connection_with_the_routed_provider_is_used() {
    let z = conn(ProviderKind::Zernio, ConnectionStatus::Active);
    let r = resolve(
        &table(ProviderKind::Zernio, false),
        Platform::YouTube,
        Capability::Publish,
        std::slice::from_ref(&z),
    );
    assert_eq!(
        r,
        Resolution::Use {
            connection: z.id,
            provider: ProviderKind::Zernio
        }
    );
}

#[test]
fn without_a_route_nothing_is_used() {
    let z = conn(ProviderKind::Zernio, ConnectionStatus::Active);
    let r = resolve(
        &table(ProviderKind::Zernio, false),
        Platform::Instagram,
        Capability::Publish,
        &[z],
    );
    assert_eq!(r, Resolution::NotRouted);
}

#[test]
fn a_flipped_route_without_fallback_asks_for_reconnect() {
    let z = conn(ProviderKind::Zernio, ConnectionStatus::Active);
    let r = resolve(
        &table(ProviderKind::Native, false),
        Platform::YouTube,
        Capability::Publish,
        &[z],
    );
    assert_eq!(
        r,
        Resolution::NeedsReconnect {
            provider: ProviderKind::Native
        }
    );
}

#[test]
fn the_dual_run_fallback_keeps_the_old_connection_working() {
    let z = conn(ProviderKind::Zernio, ConnectionStatus::Active);
    let r = resolve(
        &table(ProviderKind::Native, true),
        Platform::YouTube,
        Capability::Publish,
        std::slice::from_ref(&z),
    );
    assert_eq!(
        r,
        Resolution::Use {
            connection: z.id,
            provider: ProviderKind::Zernio
        }
    );
}

#[test]
fn the_new_provider_wins_once_the_channel_has_reconnected() {
    let z = conn(ProviderKind::Zernio, ConnectionStatus::Active);
    let n = conn(ProviderKind::Native, ConnectionStatus::Active);
    let r = resolve(
        &table(ProviderKind::Native, true),
        Platform::YouTube,
        Capability::Publish,
        &[z, n.clone()],
    );
    assert_eq!(
        r,
        Resolution::Use {
            connection: n.id,
            provider: ProviderKind::Native
        }
    );
}

#[test]
fn connections_that_are_not_active_never_count() {
    for status in [ConnectionStatus::NeedsReconnect, ConnectionStatus::Revoked] {
        let z = conn(ProviderKind::Zernio, status);
        let r = resolve(
            &table(ProviderKind::Zernio, true),
            Platform::YouTube,
            Capability::Publish,
            &[z],
        );
        assert_eq!(
            r,
            Resolution::NeedsReconnect {
                provider: ProviderKind::Zernio
            },
            "{status:?}"
        );
    }
}

#[test]
fn the_table_rejects_duplicate_routes() {
    let route = Route {
        platform: Platform::YouTube,
        capability: Capability::Publish,
        provider: ProviderKind::Zernio,
        allow_fallback: false,
    };
    assert!(RouteTable::try_new(vec![route.clone(), route]).is_err());
}

#[test]
fn names_round_trip_as_stored_in_the_db() {
    for p in Platform::ALL {
        assert_eq!(Platform::parse(p.as_str()), Some(p));
    }
    for c in Capability::ALL {
        assert_eq!(Capability::parse(c.as_str()), Some(c));
    }
    for k in [ProviderKind::Zernio, ProviderKind::Native] {
        assert_eq!(ProviderKind::parse(k.as_str()), Some(k));
    }
    assert_eq!(
        Platform::parse("YouTube"),
        None,
        "stored names are lowercase"
    );
}
