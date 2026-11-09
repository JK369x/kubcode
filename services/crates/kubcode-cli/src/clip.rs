//! Reading one clip folder (`~/Studio/clips/<id>/clip.json`). A clip without
//! its designed cover is refused here, before anything is uploaded.

use std::fs;
use std::path::{Path, PathBuf};

use kubcode_publishing::domain::MediaMeta;
use serde_json::Value;
use sha2::{Digest, Sha256};

#[derive(Debug)]
pub enum ClipError {
    BadId,
    Missing(&'static str),
    NoCover,
    BadFile(String),
}

impl std::fmt::Display for ClipError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClipError::BadId => write!(f, "รหัสคลิปไม่ถูกต้อง"),
            ClipError::Missing(what) => write!(f, "clip.json ไม่มี {what}"),
            ClipError::NoCover => write!(
                f,
                "คลิปนี้ยังไม่มีปกที่ออกแบบ (clip.json cover.file) — ทำปกก่อนแล้วค่อย push"
            ),
            ClipError::BadFile(p) => write!(f, "อ่านไฟล์ไม่ได้: {p}"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ClipFile {
    pub path: PathBuf,
    pub ext: String,
    pub sha256: String,
    pub meta: MediaMeta,
}

#[derive(Debug, Clone)]
pub struct Clip {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub video: ClipFile,
    pub cover: Option<ClipFile>,
}

fn id_ok(id: &str) -> bool {
    (1..=120).contains(&id.len())
        && !id.starts_with('.')
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

fn file(
    dir: &Path,
    name: &str,
    width: u32,
    height: u32,
    seconds: Option<f64>,
) -> Result<ClipFile, ClipError> {
    if name.contains('/') || name.starts_with('.') {
        return Err(ClipError::BadFile(name.into()));
    }
    let path = dir.join(name);
    let bytes = fs::read(&path).map_err(|_| ClipError::BadFile(name.into()))?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let content_type = match ext.as_str() {
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => return Err(ClipError::BadFile(name.into())),
    };
    Ok(ClipFile {
        sha256: hex::encode(Sha256::digest(&bytes)),
        ext: if ext == "jpeg" { "jpg".into() } else { ext },
        meta: MediaMeta {
            content_type: content_type.into(),
            bytes: bytes.len() as u64,
            width,
            height,
            seconds,
        },
        path,
    })
}

pub fn read_clip(studio: &Path, id: &str) -> Result<Clip, ClipError> {
    if !id_ok(id) {
        return Err(ClipError::BadId);
    }
    let dir = studio.join(id);
    let raw =
        fs::read(dir.join("clip.json")).map_err(|_| ClipError::BadFile("clip.json".into()))?;
    let v: Value =
        serde_json::from_slice(&raw).map_err(|_| ClipError::BadFile("clip.json".into()))?;
    let s = |p: &str| v.pointer(p).and_then(Value::as_str).map(str::to_owned);
    let n = |p: &str| v.pointer(p).and_then(Value::as_u64).map(|x| x as u32);
    let video_name = s("/video/file").ok_or(ClipError::Missing("video.file"))?;
    let video = file(
        &dir,
        &video_name,
        n("/video/width").ok_or(ClipError::Missing("video.width"))?,
        n("/video/height").ok_or(ClipError::Missing("video.height"))?,
        v.pointer("/video/seconds").and_then(Value::as_f64),
    )?;
    let cover_name = s("/cover/file").ok_or(ClipError::NoCover)?;
    let cover = file(
        &dir,
        &cover_name,
        n("/cover/width").unwrap_or(1080),
        n("/cover/height").unwrap_or(1920),
        None,
    )?;
    Ok(Clip {
        id: id.to_owned(),
        title: s("/title_th").or_else(|| s("/title")).unwrap_or_default(),
        description: s("/description").unwrap_or_default(),
        tags: v
            .get("tags")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|t| t.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
        video,
        cover: Some(cover),
    })
}
