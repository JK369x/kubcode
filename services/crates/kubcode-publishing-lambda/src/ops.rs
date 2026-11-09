//! The owner's CLI commands (design §4): JSON events on the URL-less ops
//! function. Reaching it at all needs `lambda:InvokeFunction` with the
//! owner's AWS credentials, so every command acts for the site owner.

use kubcode_publishing::domain::{DeliveryId, PostId};
use serde::Deserialize;
use serde_json::{json, Value};
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
}

fn err(f: Fail) -> Value {
    json!({"ok": false, "code": f.code})
}

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
                })).collect::<Vec<_>>()})
            }),
        Command::Cancel { delivery } => svc
            .cancel(owner, DeliveryId(delivery))
            .await
            .map(|()| json!({"ok": true})),
    };
    out.unwrap_or_else(err)
}
