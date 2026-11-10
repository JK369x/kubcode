//! The owner's CLI commands (design §4): JSON events on the URL-less ops
//! function. Two doors must both open: `lambda:InvokeFunction` (IAM) and a
//! signature with the ops key, which lives only in the owner's Keychain vault
//! and in SSM (decryptable by this role alone). IAM by itself is not enough:
//! the AWS account also holds other principals.

use hmac::{Hmac, Mac};
use kubcode_publishing::domain::{DeliveryId, PostId};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::service::{AssetRequest, Fail, Service};
use crate::summary::ScheduleRequest;

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    Whoami,
    RegisterAsset {
        asset: AssetRequest,
    },
    Schedule {
        request: ScheduleRequest,
        digest: String,
    },
    Status {
        post: Uuid,
    },
    Cancel {
        delivery: Uuid,
    },
    /// What the platform served as the thumbnail, checked by the owner's CLI
    /// against the designed cover: `ok` or `mismatch`.
    CoverCheck {
        delivery: Uuid,
        check: String,
    },
}

fn err(f: Fail) -> Value {
    json!({"ok": false, "code": f.code})
}

/// Accepted clock skew; replays inside it are stopped by the nonce table.
pub const MAX_SKEW_SECS: u64 = 300;
pub const MIN_OPS_KEY_BYTES: usize = 32;

fn ops_mac(key: &[u8], ts: u64, nonce: &str, command: &str) -> Hmac<Sha256> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC takes any key length");
    mac.update(format!("KUBCODE-OPS-V1\n{ts}\n{nonce}\n{command}").as_bytes());
    mac
}

/// Lowercase hex signature over the exact command string the CLI sends.
pub fn sign(key: &[u8], ts: u64, nonce: &str, command: &str) -> String {
    hex::encode(ops_mac(key, ts, nonce, command).finalize().into_bytes())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    command: String,
    ts: u64,
    nonce: String,
    sig: String,
}

/// Checks the envelope `{command, ts, nonce, sig}`; returns the nonce and the command.
pub fn open(key: &[u8], event: Value, now: u64) -> Result<(String, Value), &'static str> {
    let e: Envelope = serde_json::from_value(event).map_err(|_| "unauthorized")?;
    let hex_ok = |s: &str, n: usize| {
        s.len() == n
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    };
    if !hex_ok(&e.nonce, 32)
        || !hex_ok(&e.sig, 64)
        || e.ts.abs_diff(now) > MAX_SKEW_SECS
        || e.command.len() > 64 * 1024
    {
        return Err("unauthorized");
    }
    let sig = hex::decode(&e.sig).map_err(|_| "unauthorized")?;
    ops_mac(key, e.ts, &e.nonce, &e.command)
        .verify_slice(&sig)
        .map_err(|_| "unauthorized")?;
    let cmd = serde_json::from_str(&e.command).map_err(|_| "bad_command")?;
    Ok((e.nonce, cmd))
}

/// The ops entry point: signature, then the one-time nonce, then the command.
pub async fn run_signed(
    svc: &mut Service<'_>,
    key: Option<&[u8]>,
    event: Value,
    bucket: &str,
    now: u64,
) -> Value {
    let Some(key) = key.filter(|k| k.len() >= MIN_OPS_KEY_BYTES) else {
        return json!({"ok": false, "code": "unavailable"});
    };
    let (nonce, cmd) = match open(key, event, now) {
        Ok(v) => v,
        Err(code) => return json!({"ok": false, "code": code}),
    };
    match svc
        .store
        .use_nonce(&Sha256::digest(nonce.as_bytes()).into())
        .await
    {
        Ok(true) => run(svc, cmd, bucket).await,
        Ok(false) => json!({"ok": false, "code": "unauthorized"}),
        Err(_) => json!({"ok": false, "code": "store_unavailable"}),
    }
}

/// Runs one already-authenticated command.
pub async fn run(svc: &mut Service<'_>, event: Value, bucket: &str) -> Value {
    let cmd: Command = match serde_json::from_value(event) {
        Ok(c) => c,
        Err(_) => return json!({"ok": false, "code": "bad_command"}),
    };
    let owner = match svc.store.owner_user().await {
        Ok(Some(u)) => u,
        Ok(None) => return json!({"ok": false, "code": "no_owner"}),
        Err(_) => return json!({"ok": false, "code": "store_unavailable"}),
    };
    let out = match cmd {
        Command::Whoami => async {
            let ws = svc.store.owner_workspace(owner).await?;
            let channels = svc.channels(owner).await?;
            let mut list = Vec::new();
            for c in channels {
                let conns = svc.store.connections(c.id).await?;
                list.push(json!({
                    "id": c.id.0,
                    "platform": c.platform.as_str(),
                    "name": c.display_name,
                    "connections": conns.iter().map(|k| json!({
                        "provider": k.provider.as_str(),
                        "status": k.status.as_str(),
                    })).collect::<Vec<_>>(),
                }));
            }
            Ok::<_, Fail>(json!({"ok": true, "workspace": ws.0, "bucket": bucket, "channels": list}))
        }
        .await,
        Command::RegisterAsset { asset } => svc
            .register_asset(owner, asset)
            .await
            .map(|(id, key)| json!({"ok": true, "asset_id": id.0, "bucket": bucket, "s3_key": key})),
        Command::Schedule { request, digest } => {
            let Some(d) = hex::decode(&digest).ok().and_then(|v| <[u8; 32]>::try_from(v).ok()) else {
                return json!({"ok": false, "code": "bad_digest"});
            };
            svc.schedule(owner, request, d)
                .await
                .map(|r| json!({"ok": true, "result": r}))
        }
        Command::Status { post } => svc
            .status(owner, PostId(post))
            .await
            .map(|list| {
                json!({"ok": true, "deliveries": list.iter().map(|d| json!({
                    "delivery": d.id.0,
                    "channel": d.channel_name,
                    "platform": d.platform.as_str(),
                    "status": d.status.as_str(),
                    "publish_at": d.publish_at.format(&time::format_description::well_known::Rfc3339).ok(),
                    "error": d.last_error_code,
                    "url": d.platform_url,
                    "cover_check": d.cover_check,
                    "clip": d.clip_ref,
                })).collect::<Vec<_>>()})
            }),
        Command::Cancel { delivery } => svc
            .cancel(owner, DeliveryId(delivery))
            .await
            .map(|()| json!({"ok": true})),
        Command::CoverCheck { delivery, check } => svc
            .record_cover_check(owner, DeliveryId(delivery), &check)
            .await
            .map(|()| json!({"ok": true})),
    };
    out.unwrap_or_else(err)
}
