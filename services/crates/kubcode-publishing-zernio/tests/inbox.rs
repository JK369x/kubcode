//! Comment → DM calls (docs/design/ig-comment-dm.md §4.2, §4.3) against the
//! fake Zernio, answers copied from the OpenAPI examples.

mod support;

use kubcode_publishing::domain::ProviderRef;
use kubcode_publishing::errors::ErrorClass;
use kubcode_publishing::ports::{Inbox, PrivateReply};
use kubcode_publishing_zernio::transport::Method;
use serde_json::Value;
use support::Harness;

fn fixture(name: &str) -> Value {
    let p = format!(
        "{}/tests/fixtures/zernio/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

const ACCOUNT: &str = "507f1f77bcf86cd799439011";

async fn private(h: &Harness) -> PrivateReply {
    h.zernio
        .private_reply(
            &ProviderRef(ACCOUNT.into()),
            "17900000000000001",
            "17800000000000001",
            "นี่ลิงก์: https://kubcode.dev/go/x",
        )
        .await
}

#[tokio::test]
async fn a_private_reply_is_plain_text_to_the_comment() {
    let h = Harness::default();
    h.fake.answer_next_inbox(200, fixture("private-reply-sent"));
    assert_eq!(private(&h).await, PrivateReply::Sent);
    let req = h.fake.log().into_iter().last().unwrap();
    assert_eq!(req.method, Method::Post);
    assert!(
        req.url
            .path()
            .ends_with("/v1/inbox/comments/17900000000000001/17800000000000001/private-reply"),
        "{}",
        req.url
    );
    let body = req.json.clone().unwrap();
    assert_eq!(body["accountId"], ACCOUNT);
    assert_eq!(body["message"], "นี่ลิงก์: https://kubcode.dev/go/x");
    assert!(
        body.get("buttons").is_none() && body.get("quickReplies").is_none(),
        "plain text first"
    );
}

#[tokio::test]
async fn a_spent_reply_is_terminal_and_an_unclear_one_is_unknown() {
    let h = Harness::default();
    for f in [
        "private-reply-already-replied",
        "private-reply-follow-gated",
    ] {
        h.fake.answer_next_inbox(400, fixture(f));
        assert_eq!(private(&h).await, PrivateReply::Consumed, "{f}");
    }
    h.fake.answer_next_inbox(502, fixture("private-reply-502"));
    assert_eq!(private(&h).await, PrivateReply::Unknown);
    // The request may have reached Zernio: unknown, never "failed".
    h.fake.answer_next_inbox_transport_error();
    assert_eq!(private(&h).await, PrivateReply::Unknown);
}

#[tokio::test]
async fn a_refusal_that_spends_nothing_is_a_failure() {
    let h = Harness::default();
    h.fake
        .answer_next_inbox(400, fixture("private-reply-too-old"));
    let PrivateReply::Failed(e) = private(&h).await else {
        panic!("expected a failure")
    };
    assert_eq!(e.class, ErrorClass::Rejected);
}

#[tokio::test]
async fn the_public_reply_answers_the_comment_with_a_key() {
    let h = Harness::default();
    h.fake
        .answer_next_inbox(200, fixture("comment-reply-posted"));
    h.zernio
        .public_reply(
            &ProviderRef(ACCOUNT.into()),
            "17900000000000001",
            "17800000000000001",
            "ส่งให้ใน DM แล้วนะ",
            "reply-17800000000000001",
        )
        .await
        .unwrap();
    let req = h.fake.log().into_iter().last().unwrap();
    assert!(
        req.url
            .path()
            .ends_with("/v1/inbox/comments/17900000000000001"),
        "{}",
        req.url
    );
    let body = req.json.clone().unwrap();
    assert_eq!(
        (body["accountId"].as_str(), body["commentId"].as_str()),
        (Some(ACCOUNT), Some("17800000000000001"))
    );
    assert_eq!(body["message"], "ส่งให้ใน DM แล้วนะ");
    assert_eq!(
        req.header("idempotency-key"),
        Some("reply-17800000000000001")
    );
}

#[tokio::test]
async fn catch_up_reads_commented_posts_and_their_top_level_comments() {
    let h = Harness::default();
    h.fake.answer_next_inbox(200, fixture("commented-posts"));
    let posts = h
        .zernio
        .recent_posts(&ProviderRef(ACCOUNT.into()), 10)
        .await
        .unwrap();
    assert_eq!(
        posts,
        vec!["17900000000000001".to_owned()],
        "only Instagram media ids, never Zernio's"
    );
    let req = h.fake.log().into_iter().last().unwrap();
    assert_eq!(req.method, Method::Get);
    let q: std::collections::HashMap<_, _> = req.url.query_pairs().into_owned().collect();
    assert_eq!(
        (
            q.get("accountId").map(String::as_str),
            q.get("limit").map(String::as_str)
        ),
        (Some(ACCOUNT), Some("10"))
    );

    h.fake.answer_next_inbox(200, fixture("post-comments"));
    let comments = h
        .zernio
        .post_comments(&ProviderRef(ACCOUNT.into()), "17900000000000001")
        .await
        .unwrap();
    assert_eq!(
        comments.len(),
        2,
        "top level only; replies are not comments to answer"
    );
    let c = &comments[0];
    assert_eq!(
        (c.comment_id.as_str(), c.author_id.as_str(), c.text.as_str()),
        ("17800000000000001", "17841400000000001", "ขอลิงก์ครับ")
    );
    assert_eq!(c.platform_post_id, "17900000000000001");
    assert!(!c.own_account && !c.is_reply && c.created_at.is_some());
    assert!(comments[1].own_account, "isOwner marks our own comment");
    let req = h.fake.log().into_iter().last().unwrap();
    assert!(
        req.url
            .path()
            .ends_with("/v1/inbox/comments/17900000000000001"),
        "{}",
        req.url
    );
}
