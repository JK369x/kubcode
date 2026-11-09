//! Talking to the ops Lambda: a signed envelope sent with `aws lambda invoke`
//! under the owner's profile. Values never go through argv: payloads and the
//! answer pass through 0600 temp files.

use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use serde_json::{json, Value};
use zeroize::Zeroizing;

pub const OPS_FUNCTION: &str = "kubcode-publishing-ops";
pub const REGION: &str = "ap-southeast-1";

pub trait Aws {
    /// Invokes the ops function with `payload` and returns its JSON answer.
    fn invoke(&self, payload: &[u8]) -> Result<Value, String>;
    /// Size of an object, or None when it does not exist.
    fn object_size(&self, bucket: &str, key: &str) -> Result<Option<u64>, String>;
    /// Uploads with SSE-S3 (the Lambda role has no KMS grant for media).
    fn put_object(
        &self,
        bucket: &str,
        key: &str,
        file: &Path,
        content_type: &str,
    ) -> Result<(), String>;
}

pub trait Keychain {
    fn ops_key(&self) -> Result<Zeroizing<Vec<u8>>, String>;
}

/// `{command, ts, nonce, sig}` as `publishing_lambda::ops::open` expects.
pub fn envelope(key: &[u8], command: &Value, ts: u64) -> Value {
    let command = command.to_string();
    let nonce = hex::encode(uuid::Uuid::new_v4().as_bytes());
    let sig = publishing_lambda::ops::sign(key, ts, &nonce, &command);
    json!({"command": command, "ts": ts, "nonce": nonce, "sig": sig})
}

/// Sends one command; an `ok: false` answer becomes the error code.
pub fn call(
    aws: &dyn Aws,
    keys: &dyn Keychain,
    command: &Value,
    now: u64,
) -> Result<Value, String> {
    let key = keys.ops_key()?;
    let payload = envelope(&key, command, now).to_string();
    let answer = aws.invoke(payload.as_bytes())?;
    if answer.get("ok") == Some(&Value::Bool(true)) {
        Ok(answer)
    } else {
        Err(answer
            .get("code")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_owned())
    }
}

/// The real thing: the `aws` CLI with the caller's AWS_PROFILE.
pub struct AwsCli {
    pub tmp: std::path::PathBuf,
}

impl AwsCli {
    pub fn new() -> Result<Self, String> {
        let tmp = std::env::temp_dir().join(format!("kubcode-cli-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&tmp).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&tmp, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        Ok(Self { tmp })
    }

    fn aws(&self, args: &[&str]) -> Result<std::process::Output, String> {
        Command::new("aws")
            .args(args)
            .args(["--region", REGION])
            .stdin(Stdio::null())
            .output()
            .map_err(|_| "aws CLI not found".to_owned())
    }
}

impl Drop for AwsCli {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.tmp);
    }
}

impl Aws for AwsCli {
    fn invoke(&self, payload: &[u8]) -> Result<Value, String> {
        let input = self.tmp.join("payload.json");
        let output = self.tmp.join("answer.json");
        fs::File::create(&input)
            .and_then(|mut f| f.write_all(payload))
            .map_err(|e| e.to_string())?;
        let input_arg = format!("fileb://{}", input.display());
        let out = self.aws(&[
            "lambda",
            "invoke",
            "--function-name",
            OPS_FUNCTION,
            "--payload",
            &input_arg,
            output.to_str().ok_or("bad temp path")?,
        ])?;
        let _ = fs::remove_file(&input);
        if !out.status.success() {
            return Err("lambda_invoke_failed".into());
        }
        let raw = fs::read(&output).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(&output);
        serde_json::from_slice(&raw).map_err(|_| "bad_answer".into())
    }

    fn object_size(&self, bucket: &str, key: &str) -> Result<Option<u64>, String> {
        let out = self.aws(&[
            "s3api",
            "head-object",
            "--bucket",
            bucket,
            "--key",
            key,
            "--query",
            "ContentLength",
            "--output",
            "text",
        ])?;
        if !out.status.success() {
            return Ok(None);
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().parse().ok())
    }

    fn put_object(
        &self,
        bucket: &str,
        key: &str,
        file: &Path,
        content_type: &str,
    ) -> Result<(), String> {
        let body = file.to_str().ok_or("bad file path")?;
        let out = self.aws(&[
            "s3api",
            "put-object",
            "--bucket",
            bucket,
            "--key",
            key,
            "--body",
            body,
            "--content-type",
            content_type,
            "--server-side-encryption",
            "AES256",
        ])?;
        if out.status.success() {
            Ok(())
        } else {
            Err("upload_failed".into())
        }
    }
}

/// The ops key from the login keychain (`kubcode/publishing-ops-key`); macOS
/// asks for the password once per run.
pub struct MacKeychain {
    cached: std::cell::RefCell<Option<Zeroizing<Vec<u8>>>>,
}

impl MacKeychain {
    pub fn new() -> Self {
        Self {
            cached: Default::default(),
        }
    }
}

impl Default for MacKeychain {
    fn default() -> Self {
        Self::new()
    }
}

impl Keychain for MacKeychain {
    fn ops_key(&self) -> Result<Zeroizing<Vec<u8>>, String> {
        if let Some(k) = self.cached.borrow().as_ref() {
            return Ok(k.clone());
        }
        let out = Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                "kubcode/publishing-ops-key",
                "-a",
                "kubcode",
                "-w",
            ])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| "security tool not found".to_owned())?;
        let mut v = Zeroizing::new(out.stdout);
        while v.last() == Some(&b'\n') {
            v.pop();
        }
        if !out.status.success() || v.len() < 32 {
            return Err("ไม่พบ kubcode/publishing-ops-key ใน vault (รัน infra/scripts/publishing-secrets.sh ops-key)".into());
        }
        *self.cached.borrow_mut() = Some(v.clone());
        Ok(v)
    }
}
