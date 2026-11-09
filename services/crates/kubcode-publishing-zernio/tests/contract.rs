//! The Zernio adapter passes the same contract suite as every adapter.

mod support;

use kubcode_publishing::contract::{connect_contract, events_contract, publisher_contract};

#[tokio::test]
async fn zernio_passes_the_connect_contract() {
    connect_contract(&support::Harness::default()).await;
}

#[tokio::test]
async fn zernio_passes_the_publisher_contract() {
    publisher_contract(&support::Harness::default()).await;
}

#[test]
fn zernio_passes_the_events_contract() {
    events_contract(&support::Harness::default());
}
