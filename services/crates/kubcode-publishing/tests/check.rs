//! `check` is the only way to get a `Checked` delivery, and `Publisher::schedule`
//! only takes a `Checked` one, so core rules cannot be skipped by any adapter.

use kubcode_publishing::config::PublishingConfig;
use kubcode_publishing::contract::sample_request;
use kubcode_publishing::domain::Platform;
use kubcode_publishing::fake::FakeProvider;
use kubcode_publishing::ports::check;
use kubcode_publishing::validate::Velocity;
use time::macros::datetime;

#[test]
fn a_valid_request_is_checked() {
    let now = datetime!(2026-11-09 12:00 +07:00);
    let fake = FakeProvider::default();
    let req = sample_request(Platform::YouTube, now);
    let checked = check(
        req.clone(),
        now,
        Velocity::default(),
        &PublishingConfig::default(),
        &fake,
    )
    .expect("valid");
    assert_eq!(checked.request(), &req);
}

#[test]
fn core_and_adapter_violations_are_both_reported() {
    let now = datetime!(2026-11-09 12:00 +07:00);
    let fake = FakeProvider::default();
    fake.reject_titles_containing("forbidden");
    let mut req = sample_request(Platform::YouTube, now);
    req.draft.cover = None;
    req.draft.title = "a forbidden title".into();
    let v = check(
        req,
        now,
        Velocity::default(),
        &PublishingConfig::default(),
        &fake,
    )
    .unwrap_err();
    let mut codes: Vec<_> = v.iter().map(|v| v.code).collect();
    codes.sort_unstable();
    assert_eq!(codes, vec!["cover_missing", "fake_title_rejected"]);
}
