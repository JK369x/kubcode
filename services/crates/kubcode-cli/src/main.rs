//! kubcode — the owner's publishing CLI.
//!
//!   kubcode whoami
//!   kubcode push <clip-id>
//!   kubcode schedule <clip-id> --channel <id> [--channel <id>…] --at <RFC 3339> [--visibility private|public|unlisted]
//!   kubcode status <post-id>
//!   kubcode cancel <delivery-id>
//!
//! Clips are read from $KUBCODE_STUDIO (default ~/Studio/clips). AWS calls use
//! your AWS_PROFILE; the ops key comes from the Keychain vault (macOS asks for
//! your password once per run).

use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::{SystemTime, UNIX_EPOCH};

use kubcode_cli::clip::read_clip;
use kubcode_cli::local::LocalOps;
use kubcode_cli::ops::{call, Aws, AwsCli, Keychain, MacKeychain};
use kubcode_cli::push::push;
use kubcode_cli::schedule::{bangkok, render_summary, ChannelInfo};
use kubcode_publishing::domain::Visibility;
use publishing_lambda::summary::{digest, ScheduleRequest, Target};
use serde_json::{json, Value};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn studio() -> PathBuf {
    std::env::var_os("KUBCODE_STUDIO")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join("Studio/clips")
        })
}

fn usage() -> ExitCode {
    eprintln!(
        "ใช้: kubcode whoami | push <clip-id> | schedule <clip-id> --channel <id> --at <เวลา RFC 3339> [--visibility private] | status <post-id> | cancel <delivery-id>"
    );
    ExitCode::from(2)
}

fn channels(answer: &Value) -> Vec<ChannelInfo> {
    answer["channels"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|c| {
                    Some(ChannelInfo {
                        id: c["id"].as_str()?.parse().ok()?,
                        platform: c["platform"].as_str()?.to_owned(),
                        name: c["name"].as_str()?.to_owned(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn run(args: &[String]) -> Result<(), String> {
    // KUBCODE_LOCAL_OPS_URL (loopback only) points at the local E2E runner
    // (docs/dev/local-e2e.md); otherwise the real ops Lambda and Keychain.
    let local = LocalOps::from_env().transpose()?;
    let (cli, mac);
    let (aws, keys): (&dyn Aws, &dyn Keychain) = match local.as_ref() {
        Some(l) => (l, l),
        None => {
            cli = AwsCli::new()?;
            mac = MacKeychain::new();
            (&cli, &mac)
        }
    };
    match args.first().map(String::as_str) {
        Some("whoami") => {
            let a = call(aws, keys, &json!({"op": "whoami"}), now())?;
            println!("workspace {}", a["workspace"].as_str().unwrap_or("?"));
            for c in a["channels"].as_array().into_iter().flatten() {
                let status: Vec<&str> = c["connections"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|k| k["status"].as_str())
                    .collect();
                println!(
                    "{}  {:9}  {}  [{}]",
                    c["id"].as_str().unwrap_or("?"),
                    c["platform"].as_str().unwrap_or("?"),
                    c["name"].as_str().unwrap_or("?"),
                    status.join(",")
                );
            }
            Ok(())
        }
        Some("push") => {
            let id = args.get(1).ok_or("ต้องระบุรหัสคลิป")?;
            let clip = read_clip(&studio(), id).map_err(|e| e.to_string())?;
            let p = push(aws, keys, &clip, now())?;
            println!("video {}", p.video);
            if let Some(c) = p.cover {
                println!("cover {c}");
            }
            Ok(())
        }
        Some("schedule") => {
            let id = args.get(1).ok_or("ต้องระบุรหัสคลิป")?;
            let mut targets_ch = Vec::new();
            let mut at = None;
            let mut visibility = Visibility::Private;
            let mut it = args[2..].iter();
            while let Some(flag) = it.next() {
                let val = it.next().ok_or(format!("{flag} ต้องมีค่า"))?;
                match flag.as_str() {
                    "--channel" => {
                        targets_ch.push(val.parse::<Uuid>().map_err(|_| "รหัสช่องไม่ถูกต้อง")?)
                    }
                    "--at" => {
                        at = Some(
                            OffsetDateTime::parse(val, &Rfc3339)
                                .map_err(|_| "เวลาต้องเป็น RFC 3339 เช่น 2026-11-11T19:00:00+07:00")?,
                        )
                    }
                    "--visibility" => {
                        visibility = Visibility::parse(val)
                            .ok_or("visibility: private, public หรือ unlisted")?
                    }
                    other => return Err(format!("ไม่รู้จัก {other}")),
                }
            }
            let at = at.ok_or("ต้องระบุ --at")?;
            if targets_ch.is_empty() {
                return Err("ต้องระบุ --channel อย่างน้อยหนึ่งช่อง".into());
            }
            let clip = read_clip(&studio(), id).map_err(|e| e.to_string())?;
            let pushed = push(aws, keys, &clip, now())?;
            let who = call(aws, keys, &json!({"op": "whoami"}), now())?;
            let req = ScheduleRequest {
                clip_ref: clip.id.clone(),
                video_asset: pushed.video,
                cover_asset: pushed.cover,
                title: clip.title.clone(),
                description: clip.description.clone(),
                tags: clip.tags.clone(),
                targets: targets_ch
                    .iter()
                    .map(|c| Target {
                        channel: *c,
                        publish_at: at,
                        visibility,
                    })
                    .collect(),
            };
            let cover_name = clip
                .cover
                .as_ref()
                .and_then(|c| c.path.file_name())
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            println!("{}", render_summary(&req, &channels(&who), &cover_name));
            print!("พิมพ์รหัสคลิปเพื่อยืนยันตั้งเวลา (หรือกด Enter เพื่อยกเลิก): ");
            std::io::stdout().flush().ok();
            let mut line = String::new();
            std::io::stdin()
                .lock()
                .read_line(&mut line)
                .map_err(|e| e.to_string())?;
            if line.trim() != clip.id {
                return Err("ยกเลิก: ยังไม่ได้ตั้งเวลา".into());
            }
            let a = call(
                aws,
                keys,
                &json!({"op": "schedule", "request": req, "digest": hex::encode(digest(&req))}),
                now(),
            )?;
            println!("post {}", a["result"]["post"].as_str().unwrap_or("?"));
            for d in a["result"]["deliveries"].as_array().into_iter().flatten() {
                println!(
                    "  {}  {}  {}",
                    d["delivery"].as_str().unwrap_or("-"),
                    d["status"].as_str().unwrap_or("?"),
                    d["codes"]
                        .as_array()
                        .map(|c| c
                            .iter()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join(","))
                        .unwrap_or_default()
                );
            }
            Ok(())
        }
        Some("status") => {
            let post: Uuid = args
                .get(1)
                .and_then(|s| s.parse().ok())
                .ok_or("รหัสโพสต์ไม่ถูกต้อง")?;
            let a = call(aws, keys, &json!({"op": "status", "post": post}), now())?;
            for d in a["deliveries"].as_array().into_iter().flatten() {
                let at = d["publish_at"]
                    .as_str()
                    .and_then(|t| OffsetDateTime::parse(t, &Rfc3339).ok())
                    .map(bangkok)
                    .unwrap_or_default();
                println!(
                    "{}  {} ({})  {}  {}  {}  ปก:{}",
                    d["delivery"].as_str().unwrap_or("?"),
                    d["channel"].as_str().unwrap_or("?"),
                    d["platform"].as_str().unwrap_or("?"),
                    at,
                    d["status"].as_str().unwrap_or("?"),
                    d["url"].as_str().or(d["error"].as_str()).unwrap_or(""),
                    d["cover_check"].as_str().unwrap_or("-"),
                );
            }
            Ok(())
        }
        Some("cancel") => {
            let delivery: Uuid = args
                .get(1)
                .and_then(|s| s.parse().ok())
                .ok_or("รหัส delivery ไม่ถูกต้อง")?;
            call(
                aws,
                keys,
                &json!({"op": "cancel", "delivery": delivery}),
                now(),
            )?;
            println!("ยกเลิกแล้ว");
            Ok(())
        }
        _ => Err(String::new()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) if e.is_empty() => usage(),
        Err(e) => {
            eprintln!("kubcode: {e}");
            ExitCode::FAILURE
        }
    }
}
