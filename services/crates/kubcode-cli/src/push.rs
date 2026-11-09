//! `kubcode push <clip-id>`: register the video and the designed cover, then
//! upload each to the key the Lambda chose (skipped when already there).

use serde_json::json;
use uuid::Uuid;

use crate::clip::{Clip, ClipFile};
use crate::ops::{call, Aws, Keychain};

#[derive(Debug, Clone)]
pub struct Pushed {
    pub video: Uuid,
    pub cover: Option<Uuid>,
}

fn one(
    aws: &dyn Aws,
    keys: &dyn Keychain,
    clip: &Clip,
    f: &ClipFile,
    kind: &str,
    now: u64,
) -> Result<Uuid, String> {
    let answer = call(
        aws,
        keys,
        &json!({"op": "register_asset", "asset": {
            "clip_ref": clip.id, "kind": kind, "sha256": f.sha256, "ext": f.ext, "meta": f.meta,
        }}),
        now,
    )?;
    let id: Uuid = answer["asset_id"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .ok_or("bad_answer")?;
    let bucket = answer["bucket"].as_str().ok_or("bad_answer")?;
    let key = answer["s3_key"].as_str().ok_or("bad_answer")?;
    if aws.object_size(bucket, key)? != Some(f.meta.bytes) {
        aws.put_object(bucket, key, &f.path, &f.meta.content_type)?;
    }
    Ok(id)
}

pub fn push(aws: &dyn Aws, keys: &dyn Keychain, clip: &Clip, now: u64) -> Result<Pushed, String> {
    let video = one(aws, keys, clip, &clip.video, "video", now)?;
    let cover = match &clip.cover {
        Some(c) => Some(one(aws, keys, clip, c, "cover", now)?),
        None => None,
    };
    Ok(Pushed { video, cover })
}
