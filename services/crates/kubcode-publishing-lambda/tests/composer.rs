//! The web composer's routes on the Function URL: upload presign (key chosen
//! here, quota, limits), schedule (digest computed here, member-scoped),
//! status and cancel. Fake provider, fake uploader; real Postgres.

mod support;

use std::sync::Arc;

use kubcode_publishing::domain::{ChannelId, Platform, ProviderKind};
use kubcode_publishing::fake::FakeProvider;
use kubcode_publishing::ports::CallbackParams;
use lambda_http::http::HeaderMap;
use oauth_connect::auth::sign;
use publishing_lambda::http::{self, Uploader};
use publishing_lambda::service::Service;
use publishing_lambda::upload::PresignedPut;
use serde_json::{json, Value};
use support::{cfg, db, registry, FakeOpener};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

const KEY: &[u8] = b"FIXTURE-ONLY-publishing-hmac-key-000000000000";
const NOW: u64 = 1_800_000_000;

struct FakeUploads;
impl Uploader for FakeUploads {
    fn presign_put(
        &self,
        key: &str,
        content_type: &str,
        sha: &[u8; 32],
        _now: u64,
    ) -> Option<PresignedPut> {
        Some(PresignedPut {
            url: format!("https://bucket.example/{key}"),
            headers: vec![
                ("content-type".into(), content_type.into()),
                ("x-sha".into(), hex::encode(sha)),
            ],
        })
    }
}

async fn call(s: &mut Service<'_>, path: &str, body: Value, n: u32) -> (u16, Value) {
    let body = serde_json::to_vec(&body).unwrap();
    let nonce = format!("{n:032x}");
    let mut h = HeaderMap::new();
    h.insert("x-kubcode-timestamp", NOW.to_string().parse().unwrap());
    h.insert("x-kubcode-nonce", nonce.parse().unwrap());
    h.insert(
        "x-kubcode-signature",
        sign(KEY, path, &NOW.to_string(), &nonce, &body)
            .parse()
            .unwrap(),
    );
    let r = http::handle_with(s, KEY, &FakeUploads, "POST", path, &h, &body, NOW).await;
    (r.status, r.body)
}

async fn connect(
    s: &mut Service<'_>,
    fake: &FakeProvider,
    user: Uuid,
    platform: Platform,
) -> ChannelId {
    let state = *Uuid::new_v4().as_bytes();
    let state = [state, state].concat().try_into().unwrap();
    s.connect_start(user, platform, &state, &[1; 32], &[2; 32])
        .await
        .unwrap();
    let ws = s.store.owner_workspace(user).await.unwrap();
    let profile = s
        .store
        .profile(ws, ProviderKind::Zernio)
        .await
        .unwrap()
        .unwrap();
    let account = fake.add_account(&profile, platform);
    s.connect_complete(
        &state,
        CallbackParams(vec![("accountId".into(), account.0)]),
    )
    .await
    .unwrap()
}

#[allow(clippy::too_many_arguments)]
fn asset(
    clip: &str,
    kind: &str,
    sha: &str,
    ct: &str,
    bytes: u64,
    w: u32,
    h: u32,
    secs: Option<f64>,
) -> Value {
    json!({"clip_ref": clip, "kind": kind, "sha256": sha, "content_type": ct, "bytes": bytes, "width": w, "height": h, "seconds": secs})
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn upload_schedule_status_and_cancel_from_the_web() {
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
    // A paying member (not the owner): the web host already checked access.
    let member = db.user(false).await;
    db.pay(member, 2).await;
    let tt = connect(&mut s, &fake, member, Platform::TikTok).await;
    let yt = connect(&mut s, &fake, member, Platform::YouTube).await;
    let clip = format!("web-{}", Uuid::new_v4());

    // Upload presign: the key is ours, under the member's workspace.
    let (st, v) = call(&mut s, "/api/media/presign", json!({"user_id": member, "asset": asset(&clip, "video", &"ab".repeat(32), "video/mp4", 10_000_000, 1080, 1920, Some(30.0))}), 1).await;
    assert_eq!(st, 200, "{v}");
    let ws = s.store.owner_workspace(member).await.unwrap();
    let url = v["upload"]["url"].as_str().unwrap();
    assert_eq!(
        url,
        format!(
            "https://bucket.example/clips/{}/{clip}/{}.mp4",
            ws.0,
            "ab".repeat(32)
        )
    );
    let video = v["asset_id"].as_str().unwrap().to_owned();
    let (_, v) = call(&mut s, "/api/media/presign", json!({"user_id": member, "asset": asset(&clip, "cover", &"cd".repeat(32), "image/png", 200_000, 1080, 1920, None)}), 2).await;
    let cover = v["asset_id"].as_str().unwrap().to_owned();

    // Refusals: wrong type, too big, a clip ref we did not make, extra fields.
    for (i, a) in [
        asset(
            &clip,
            "video",
            &"ab".repeat(32),
            "video/webm",
            10,
            10,
            10,
            Some(1.0),
        ),
        asset(
            &clip,
            "video",
            &"ab".repeat(32),
            "video/mp4",
            600 * 1024 * 1024,
            1080,
            1920,
            Some(1.0),
        ),
        asset(
            "2026-11-08_my-own-key",
            "video",
            &"ab".repeat(32),
            "video/mp4",
            10,
            1080,
            1920,
            Some(1.0),
        ),
        asset(
            &clip,
            "cover",
            &"ab".repeat(32),
            "image/png",
            10,
            1080,
            1920,
            Some(3.0),
        ),
    ]
    .into_iter()
    .enumerate()
    {
        let (st, v) = call(
            &mut s,
            "/api/media/presign",
            json!({"user_id": member, "asset": a}),
            10 + i as u32,
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(v["ok"], false, "{v}");
    }
    let (st, _) = call(&mut s, "/api/media/presign", json!({"user_id": member, "asset": asset(&clip, "video", &"ab".repeat(32), "video/mp4", 10, 10, 10, Some(1.0)), "key": "clips/x"}), 20).await;
    assert_eq!(st, 400);

    // Schedule both channels in one post.
    let at = OffsetDateTime::now_utc() + Duration::hours(2);
    let req = json!({
        "clip_ref": clip, "video_asset": video, "cover_asset": cover,
        "title": "ทดสอบ", "description": "แคปชันเดียวทุกแพลตฟอร์ม", "tags": [],
        "targets": [
            {"channel": tt.0, "publish_at": at.format(&time::format_description::well_known::Rfc3339).unwrap(), "visibility": "public"},
            {"channel": yt.0, "publish_at": at.format(&time::format_description::well_known::Rfc3339).unwrap(), "visibility": "unlisted"}
        ]
    });
    let (st, v) = call(
        &mut s,
        "/api/posts/schedule",
        json!({"user_id": member, "request": req.clone()}),
        30,
    )
    .await;
    assert_eq!(st, 200, "{v}");
    let results = v["result"]["deliveries"].as_array().unwrap();
    assert_eq!(results.len(), 2);
    assert!(results.iter().all(|d| d["status"] == "scheduled"), "{v}");
    let post = v["result"]["post"].as_str().unwrap().to_owned();
    // The same draft submitted again: the first post, nothing new.
    let posts_before = fake.post_count();
    let (_, again) = call(
        &mut s,
        "/api/posts/schedule",
        json!({"user_id": member, "request": req.clone()}),
        36,
    )
    .await;
    assert_eq!(
        (again["already"].clone(), again["result"]["post"].clone()),
        (json!(true), json!(post))
    );
    assert_eq!(fake.post_count(), posts_before);

    // Another member cannot see or cancel it.
    let stranger = db.user(false).await;
    let (_, v2) = call(
        &mut s,
        "/api/posts/status",
        json!({"user_id": stranger, "post_id": post}),
        31,
    )
    .await;
    assert_eq!(v2["code"], "post_not_found");
    let d0 = results[0]["delivery"].as_str().unwrap().to_owned();
    let (_, v2) = call(
        &mut s,
        "/api/posts/cancel",
        json!({"user_id": stranger, "delivery_id": d0}),
        32,
    )
    .await;
    assert_eq!(v2["code"], "delivery_not_found");

    let (_, st_) = call(
        &mut s,
        "/api/posts/status",
        json!({"user_id": member, "post_id": post}),
        33,
    )
    .await;
    assert_eq!(st_["deliveries"].as_array().unwrap().len(), 2);
    let (_, c) = call(
        &mut s,
        "/api/posts/cancel",
        json!({"user_id": member, "delivery_id": d0}),
        34,
    )
    .await;
    assert_eq!(c, json!({"ok": true}));
    let (_, st_) = call(
        &mut s,
        "/api/posts/status",
        json!({"user_id": member, "post_id": post}),
        35,
    )
    .await;
    assert!(st_["deliveries"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["status"] == "cancelled"));

    // A CLI-style clip ref, no targets, or a stranger's channel are refused.
    let mut bad = req.clone();
    bad["clip_ref"] = json!("2026-11-08_cli-clip");
    assert_eq!(
        call(
            &mut s,
            "/api/posts/schedule",
            json!({"user_id": member, "request": bad}),
            40
        )
        .await
        .0,
        400
    );
    let mut none = req.clone();
    none["targets"] = json!([]);
    assert_eq!(
        call(
            &mut s,
            "/api/posts/schedule",
            json!({"user_id": member, "request": none}),
            41
        )
        .await
        .0,
        400
    );
    let (_, v) = call(
        &mut s,
        "/api/posts/schedule",
        json!({"user_id": stranger, "request": req}),
        42,
    )
    .await;
    assert_eq!(
        v["ok"], false,
        "the stranger does not own these assets: {v}"
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored"]
async fn the_daily_upload_quota_applies_per_workspace() {
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
    let member = db.user(false).await;
    let clip = format!("web-{}", Uuid::new_v4());
    let big = 500 * 1024 * 1024;
    let mut ok = 0;
    for i in 0..12u32 {
        let sha = format!("{:064x}", i + 1);
        let (_, v) = call(&mut s, "/api/media/presign", json!({"user_id": member, "asset": asset(&clip, "video", &sha, "video/mp4", big, 1080, 1920, Some(60.0))}), 100 + i).await;
        if v["ok"] == true {
            ok += 1;
        } else {
            assert_eq!(v["code"], "upload_quota");
        }
    }
    assert_eq!(ok, 10, "5 GiB per day at 500 MiB each");
    db.drop().await;
}
