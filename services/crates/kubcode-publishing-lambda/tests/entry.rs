//! The two entry points: the Function URL (HMAC + webhooks) and the ops
//! function (owner commands).

mod support;

use std::sync::Arc;

use kubcode_publishing::fake::FakeProvider;
use lambda_http::http::HeaderMap;
use oauth_connect::auth::sign;
use publishing_lambda::service::Service;
use publishing_lambda::{http, ops};
use serde_json::json;
use support::{cfg, db, registry, FakeOpener};
use time::OffsetDateTime;

const KEY: &[u8] = b"FIXTURE-ONLY-publishing-hmac-key-000000000000";
const NOW: u64 = 1_800_000_000;

fn signed(path: &str, body: &[u8], nonce: &str) -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert("x-kubcode-timestamp", NOW.to_string().parse().unwrap());
    h.insert("x-kubcode-nonce", nonce.parse().unwrap());
    h.insert(
        "x-kubcode-signature",
        sign(KEY, path, &NOW.to_string(), nonce, body)
            .parse()
            .unwrap(),
    );
    h
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn the_function_url() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = Service {
        store: &mut store,
        reg: &reg,
        cfg: &cfg,
        media: &FakeOpener,
        now: OffsetDateTime::now_utc(),
    };
    let user = db.user(true).await;
    let path = "/api/connect/start";
    let body = serde_json::to_vec(&json!({
        "user_id": user,
        "platform": "youtube",
        "state": "11".repeat(32),
        "cookie_hash": "22".repeat(32),
        "session_binding_hash": "33".repeat(32),
    }))
    .unwrap();
    let nonce = "00112233445566778899aabbccddeeff";

    let r = http::handle(
        &mut s,
        KEY,
        "POST",
        path,
        &signed(path, &body, nonce),
        &body,
        NOW,
    )
    .await;
    assert_eq!(r.status, 200, "{}", r.body);
    assert!(r.body["auth_url"].as_str().unwrap().starts_with("https://"));

    let again = http::handle(
        &mut s,
        KEY,
        "POST",
        path,
        &signed(path, &body, nonce),
        &body,
        NOW,
    )
    .await;
    assert_eq!(again.status, 401, "a replayed nonce is refused");

    let unsigned = http::handle(&mut s, KEY, "POST", path, &HeaderMap::new(), &body, NOW).await;
    assert_eq!(unsigned.status, 401);

    let other = "ffeeddccbbaa99887766554433221100";
    let wrong_path = http::handle(
        &mut s,
        KEY,
        "POST",
        "/api/channels/disconnect",
        &signed(path, &body, other),
        &body,
        NOW,
    )
    .await;
    assert_eq!(wrong_path.status, 401, "the path is signed");

    assert_eq!(
        http::handle(&mut s, KEY, "GET", path, &HeaderMap::new(), b"", NOW)
            .await
            .status,
        405
    );

    // The callback: our own `i` parameter never reaches the provider, and a
    // denied consent comes back as ok=false with a fixed code.
    let path = "/api/connect/complete";
    let body = serde_json::to_vec(&json!({
        "state": "11".repeat(32),
        "params": [["i", "11".repeat(32)], ["error", "oauth_denied"]],
    }))
    .unwrap();
    let nonce = "0123456789abcdef0123456789abcdef";
    let r = http::handle(
        &mut s,
        KEY,
        "POST",
        path,
        &signed(path, &body, nonce),
        &body,
        NOW,
    )
    .await;
    assert_eq!(r.status, 200);
    assert_eq!(r.body, json!({"ok": false, "code": "connect_denied"}));

    let hook = http::handle(
        &mut s,
        KEY,
        "POST",
        "/webhooks/zernio",
        &HeaderMap::new(),
        br#"{"id":"e","event":"post.published"}"#,
        NOW,
    )
    .await;
    assert_eq!(hook.status, 401, "unsigned webhooks are refused");
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn the_ops_function() {
    let db = db().await;
    let mut store = db.store().await;
    let fake = Arc::new(FakeProvider::default());
    let (reg, cfg) = (registry(&fake), cfg());
    let mut s = Service {
        store: &mut store,
        reg: &reg,
        cfg: &cfg,
        media: &FakeOpener,
        now: OffsetDateTime::now_utc(),
    };
    assert_eq!(
        ops::run(&mut s, json!({"op": "whoami"}), "bucket").await,
        json!({"ok": false, "code": "no_owner"}),
        "nothing works until the owner flag is set"
    );
    db.user(false).await;
    let owner = db.user(true).await;
    let who = ops::run(&mut s, json!({"op": "whoami"}), "kubcode-media").await;
    assert_eq!(who["ok"], true, "{who}");
    let ws = s.store.owner_workspace(owner).await.unwrap();
    assert_eq!(who["workspace"], json!(ws.0));
    assert_eq!(who["bucket"], "kubcode-media");
    assert_eq!(
        ops::run(&mut s, json!({"op": "drop_everything"}), "b").await["code"],
        "bad_command"
    );
    let reg_asset = ops::run(
        &mut s,
        json!({"op": "register_asset", "asset": {
            "clip_ref": "clip-1", "kind": "cover", "sha256": "ab".repeat(32), "ext": "png",
            "meta": {"content_type": "image/png", "bytes": 10, "width": 1080, "height": 1920, "seconds": null}
        }}),
        "b",
    )
    .await;
    assert_eq!(reg_asset["ok"], true, "{reg_asset}");
    assert!(reg_asset["s3_key"]
        .as_str()
        .unwrap()
        .starts_with(&format!("clips/{}/clip-1/", ws.0)));
    db.drop().await;
}
