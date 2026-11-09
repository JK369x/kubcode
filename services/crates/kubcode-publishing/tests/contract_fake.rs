//! The in-memory fake must pass the same contract suite as every real adapter.

use kubcode_publishing::contract::{connect_contract, events_contract, publisher_contract};
use kubcode_publishing::fake::FakeHarness;

#[tokio::test]
async fn fake_passes_the_connect_contract() {
    connect_contract(&FakeHarness::default()).await;
}

#[tokio::test]
async fn fake_passes_the_publisher_contract() {
    publisher_contract(&FakeHarness::default()).await;
}

#[test]
fn fake_passes_the_events_contract() {
    events_contract(&FakeHarness::default());
}
