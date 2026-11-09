//! Local E2E only (docs/dev/local-e2e.md): the ops function and the media
//! bucket on this machine. Chosen when `KUBCODE_LOCAL_OPS_URL` is set; the URL
//! must be loopback, so this can never send a command anywhere else.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::Value;
use zeroize::Zeroizing;

use crate::ops::{Aws, Keychain};

pub struct LocalOps {
    url: String,
    media: PathBuf,
    key: Zeroizing<Vec<u8>>,
}

const LOOPBACK: &str = "http://127.0.0.1:";

impl LocalOps {
    /// From `KUBCODE_LOCAL_OPS_URL`, `KUBCODE_LOCAL_OPS_KEY` (hex) and
    /// `KUBCODE_LOCAL_MEDIA_DIR`; None when the first is unset.
    pub fn from_env() -> Option<Result<Self, String>> {
        let url = std::env::var("KUBCODE_LOCAL_OPS_URL").ok()?;
        let key = std::env::var("KUBCODE_LOCAL_OPS_KEY").unwrap_or_default();
        let media = std::env::var_os("KUBCODE_LOCAL_MEDIA_DIR").map(PathBuf::from);
        Some(Self::new(&url, &key, media))
    }

    pub fn new(url: &str, key_hex: &str, media: Option<PathBuf>) -> Result<Self, String> {
        let port = url.strip_prefix(LOOPBACK).unwrap_or_default();
        if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) {
            return Err("KUBCODE_LOCAL_OPS_URL must be http://127.0.0.1:<port>".into());
        }
        let key =
            Zeroizing::new(hex::decode(key_hex).map_err(|_| "KUBCODE_LOCAL_OPS_KEY must be hex")?);
        if key.len() < 32 {
            return Err("KUBCODE_LOCAL_OPS_KEY must be at least 32 bytes".into());
        }
        let media = media.ok_or("KUBCODE_LOCAL_MEDIA_DIR is required")?;
        Ok(Self {
            url: format!("{url}/ops"),
            media,
            key,
        })
    }

    fn path(&self, key: &str) -> Result<PathBuf, String> {
        if !key.starts_with("clips/") || key.contains("..") {
            return Err("bad media key".into());
        }
        Ok(self.media.join(key))
    }
}

impl Aws for LocalOps {
    fn invoke(&self, payload: &[u8]) -> Result<Value, String> {
        // The envelope goes on stdin, never in argv.
        let mut child = Command::new("curl")
            .args([
                "-sS",
                "--max-time",
                "300",
                "-X",
                "POST",
                "-H",
                "content-type: application/json",
                "--data-binary",
                "@-",
                &self.url,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "curl not found".to_owned())?;
        child
            .stdin
            .take()
            .ok_or("curl stdin")?
            .write_all(payload)
            .map_err(|e| e.to_string())?;
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err("local ops runner unreachable".into());
        }
        serde_json::from_slice(&out.stdout).map_err(|_| "bad answer from the local runner".into())
    }

    fn object_size(&self, _bucket: &str, key: &str) -> Result<Option<u64>, String> {
        Ok(fs::metadata(self.path(key)?).ok().map(|m| m.len()))
    }

    fn put_object(
        &self,
        _bucket: &str,
        key: &str,
        file: &Path,
        _content_type: &str,
    ) -> Result<(), String> {
        let to = self.path(key)?;
        if let Some(dir) = to.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::copy(file, to).map(|_| ()).map_err(|e| e.to_string())
    }
}

impl Keychain for LocalOps {
    fn ops_key(&self) -> Result<Zeroizing<Vec<u8>>, String> {
        Ok(self.key.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    #[test]
    fn only_loopback_and_a_real_key() {
        let media = || Some(std::env::temp_dir());
        assert!(LocalOps::new("http://127.0.0.1:4000", KEY, media()).is_ok());
        for url in [
            "https://abc.lambda-url.ap-southeast-1.on.aws",
            "http://localhost:4000",
            "http://127.0.0.1:4000.evil.example",
            "http://127.0.0.1:",
            "http://10.0.0.1:4000",
        ] {
            assert!(LocalOps::new(url, KEY, media()).is_err(), "{url}");
        }
        assert!(
            LocalOps::new("http://127.0.0.1:4000", "abcd", media()).is_err(),
            "short key"
        );
        assert!(
            LocalOps::new("http://127.0.0.1:4000", KEY, None).is_err(),
            "no media dir"
        );
    }

    #[test]
    fn media_lands_under_the_local_dir() {
        let dir = std::env::temp_dir().join(format!("kubcode-local-{}", uuid::Uuid::new_v4()));
        let ops = LocalOps::new("http://127.0.0.1:4000", KEY, Some(dir.clone())).unwrap();
        let src = dir.with_extension("src");
        fs::write(&src, b"video").unwrap();
        assert_eq!(ops.object_size("b", "clips/w/c/v.mp4").unwrap(), None);
        ops.put_object("b", "clips/w/c/v.mp4", &src, "video/mp4")
            .unwrap();
        assert_eq!(ops.object_size("b", "clips/w/c/v.mp4").unwrap(), Some(5));
        assert!(ops
            .put_object("b", "clips/../../x", &src, "video/mp4")
            .is_err());
        assert!(ops
            .put_object("b", "elsewhere/x", &src, "video/mp4")
            .is_err());
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_file(&src);
    }
}
