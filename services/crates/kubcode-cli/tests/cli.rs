//! The CLI's logic with fake AWS and Keychain: reading a clip from ~/Studio,
//! pushing it, and the summary the owner confirms.

use std::cell::RefCell;
use std::fs;
use std::path::{Path, PathBuf};

use kubcode_cli::clip::{read_clip, ClipError};
use kubcode_cli::ops::{envelope, Aws, Keychain};
use kubcode_cli::push::push;
use kubcode_cli::schedule::{render_summary, ChannelInfo};
use kubcode_publishing::domain::{MediaKind, Visibility};
use publishing_lambda::summary::{ScheduleRequest, Target};
use serde_json::{json, Value};
use time::macros::datetime;
use uuid::Uuid;

const CLIP: &str = "2026-11-08_deep-sea-docs_ep01_giant-squid";

fn studio(with_cover: bool) -> PathBuf {
    let root = std::env::temp_dir().join(format!("kubcode-cli-{}", Uuid::new_v4()));
    let dir = root.join(CLIP);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("video.mp4"), b"fake-mp4").unwrap();
    let mut clip = json!({
        "id": CLIP,
        "title_th": "หมึกยักษ์หลบเรามาตลอด",
        "description": "คำอธิบายคลิป",
        "tags": ["deep sea", "squid"],
        "video": {"file": "video.mp4", "width": 1080, "height": 1920, "seconds": 58.93, "codec": "h264"},
    });
    if with_cover {
        fs::write(dir.join("thumbnail.png"), b"fake-png").unwrap();
        clip["cover"] = json!({"file": "thumbnail.png", "width": 1080, "height": 1920});
    }
    fs::write(dir.join("clip.json"), serde_json::to_vec(&clip).unwrap()).unwrap();
    root
}

#[test]
fn reads_a_clip_with_its_designed_cover() {
    let root = studio(true);
    let c = read_clip(&root, CLIP).unwrap();
    assert_eq!(c.id, CLIP);
    assert_eq!(c.title, "หมึกยักษ์หลบเรามาตลอด");
    assert_eq!(c.description, "คำอธิบายคลิป");
    assert_eq!(c.tags, vec!["deep sea", "squid"]);
    assert_eq!(c.video.meta.content_type, "video/mp4");
    assert_eq!(c.video.meta.bytes, 8);
    assert_eq!(c.video.meta.seconds, Some(58.93));
    let cover = c.cover.unwrap();
    assert_eq!(cover.meta.content_type, "image/png");
    assert_eq!(cover.sha256, hex::encode(sha2_of(b"fake-png")));
}

fn sha2_of(b: &[u8]) -> [u8; 32] {
    use sha2::Digest;
    sha2::Sha256::digest(b).into()
}

#[test]
fn refuses_a_clip_without_a_designed_cover() {
    let root = studio(false);
    assert!(matches!(read_clip(&root, CLIP), Err(ClipError::NoCover)));
}

#[test]
fn refuses_clip_ids_that_leave_the_studio() {
    let root = studio(true);
    for bad in ["../etc", "a/b", "", "x y"] {
        assert!(
            matches!(read_clip(&root, bad), Err(ClipError::BadId)),
            "{bad}"
        );
    }
}

#[derive(Default)]
struct FakeAws {
    invoked: RefCell<Vec<Value>>,
    uploaded: RefCell<Vec<(String, String, String)>>,
    existing: RefCell<Vec<(String, u64)>>,
}

impl Aws for FakeAws {
    fn invoke(&self, payload: &[u8]) -> Result<Value, String> {
        let env: Value = serde_json::from_slice(payload).unwrap();
        let cmd: Value = serde_json::from_str(env["command"].as_str().unwrap()).unwrap();
        self.invoked.borrow_mut().push(cmd.clone());
        Ok(match cmd["op"].as_str().unwrap() {
            "register_asset" => {
                let a = &cmd["asset"];
                json!({"ok": true, "asset_id": Uuid::new_v4(), "bucket": "kubcode-media-1",
                       "s3_key": format!("clips/ws/{}/{}.{}", a["clip_ref"].as_str().unwrap(), a["sha256"].as_str().unwrap(), a["ext"].as_str().unwrap())})
            }
            other => panic!("unexpected op {other}"),
        })
    }
    fn object_size(&self, _bucket: &str, key: &str) -> Result<Option<u64>, String> {
        Ok(self
            .existing
            .borrow()
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, n)| *n))
    }
    fn put_object(
        &self,
        bucket: &str,
        key: &str,
        file: &Path,
        content_type: &str,
    ) -> Result<(), String> {
        assert!(file.exists());
        self.uploaded
            .borrow_mut()
            .push((bucket.into(), key.into(), content_type.into()));
        Ok(())
    }
}

struct FakeKeychain;
impl Keychain for FakeKeychain {
    fn ops_key(&self) -> Result<zeroize::Zeroizing<Vec<u8>>, String> {
        Ok(zeroize::Zeroizing::new(
            b"FIXTURE-ONLY-publishing-ops-key-0000000000000".to_vec(),
        ))
    }
}

#[test]
fn push_registers_and_uploads_video_and_cover_once() {
    let root = studio(true);
    let clip = read_clip(&root, CLIP).unwrap();
    let aws = FakeAws::default();
    let pushed = push(&aws, &FakeKeychain, &clip, 1_800_000_000).unwrap();
    assert!(pushed.cover.is_some());
    let up = aws.uploaded.borrow().clone();
    assert_eq!(up.len(), 2);
    assert_eq!(up[0].2, "video/mp4");
    assert_eq!(up[1].2, "image/png");
    let kinds: Vec<String> = aws
        .invoked
        .borrow()
        .iter()
        .map(|c| c["asset"]["kind"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(kinds, vec!["video", "cover"]);

    // Already in S3 with the same size: registered again (idempotent), not re-uploaded.
    let aws2 = FakeAws::default();
    let key = format!("clips/ws/{CLIP}/{}.mp4", clip.video.sha256);
    aws2.existing
        .borrow_mut()
        .push((key, clip.video.meta.bytes));
    push(&aws2, &FakeKeychain, &clip, 1_800_000_000).unwrap();
    assert_eq!(aws2.uploaded.borrow().len(), 1, "only the cover");
}

#[test]
fn the_envelope_is_what_the_lambda_verifies() {
    let key = b"FIXTURE-ONLY-publishing-ops-key-0000000000000";
    let env = envelope(key, &json!({"op": "whoami"}), 1_800_000_000);
    let (_, cmd) = publishing_lambda::ops::open(key, env, 1_800_000_000).unwrap();
    assert_eq!(cmd, json!({"op": "whoami"}));
}

#[test]
fn the_summary_shows_everything_that_is_confirmed() {
    let ch = Uuid::new_v4();
    let req = ScheduleRequest {
        clip_ref: CLIP.into(),
        video_asset: Uuid::new_v4(),
        cover_asset: Some(Uuid::new_v4()),
        title: "หมึกยักษ์".into(),
        description: "คำอธิบาย".into(),
        tags: vec!["deep sea".into()],
        targets: vec![Target {
            channel: ch,
            publish_at: datetime!(2026-11-11 19:00 +07:00),
            visibility: Visibility::Private,
        }],
    };
    let text = render_summary(
        &req,
        &[ChannelInfo {
            id: ch,
            platform: "youtube".into(),
            name: "โลกอีกแบบ".into(),
        }],
        "thumbnail.png",
    );
    for needle in [
        CLIP,
        "thumbnail.png",
        "หมึกยักษ์",
        "คำอธิบาย",
        "deep sea",
        "โลกอีกแบบ",
        "YouTube",
        "11 พ.ย. 2026 19:00",
        "private",
    ] {
        assert!(text.contains(needle), "summary lacks {needle}:\n{text}");
    }
    let _ = MediaKind::Video;
}

#[test]
fn tiktok_is_summarised_and_must_be_public() {
    use kubcode_cli::schedule::check_visibility;
    let (tt, yt) = (Uuid::new_v4(), Uuid::new_v4());
    let channels = [
        ChannelInfo {
            id: tt,
            platform: "tiktok".into(),
            name: "kubcode".into(),
        },
        ChannelInfo {
            id: yt,
            platform: "youtube".into(),
            name: "โลกอีกแบบ".into(),
        },
    ];
    assert!(check_visibility(&[tt], &channels, Visibility::Public).is_ok());
    assert!(check_visibility(&[yt], &channels, Visibility::Private).is_ok());
    let err = check_visibility(&[yt, tt], &channels, Visibility::Private).unwrap_err();
    assert!(err.contains("--visibility public"), "{err}");

    let req = ScheduleRequest {
        clip_ref: CLIP.into(),
        video_asset: Uuid::new_v4(),
        cover_asset: Some(Uuid::new_v4()),
        title: "หมึกยักษ์".into(),
        description: "คอมเมนต์ egm รับลิงก์".into(),
        tags: vec![],
        targets: vec![Target {
            channel: tt,
            publish_at: datetime!(2026-11-11 19:00 +07:00),
            visibility: Visibility::Public,
        }],
    };
    let text = render_summary(&req, &channels, "thumbnail.png");
    for needle in [
        "kubcode (TikTok)",
        "public",
        "สาธารณะ",
        "9:16",
        "คอมเมนต์ egm",
    ] {
        assert!(text.contains(needle), "summary lacks {needle}:\n{text}");
    }
}
