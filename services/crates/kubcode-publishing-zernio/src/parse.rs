//! Reading Zernio responses. The docs are inconsistent (`_id` vs `accountId`,
//! `platformPostUrl` vs `publishedUrl`, a `message` wrapper only sometimes),
//! so every reader accepts each documented spelling.

use kubcode_publishing::domain::{ConnectionStatus, DeliveryStatus};
use kubcode_publishing::errors::{ErrorClass, PublishError};
use kubcode_publishing::ports::DeliveryState;
use serde_json::Value;

fn str_of(v: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|k| v.get(*k).and_then(Value::as_str))
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

fn id_of(v: &Value) -> Option<String> {
    str_of(v, &["_id", "id"])
}

/// A reference that is either a plain id or a populated object (OpenAPI
/// `oneOf: [string, Profile]`; `GET /v1/accounts` returns the object).
fn ref_id(v: &Value, key: &str) -> Option<String> {
    match v.get(key)? {
        Value::String(_) => str_of(v, &[key]),
        obj @ Value::Object(_) => str_of(obj, &["_id"]),
        _ => None,
    }
}

/// From `POST /v1/profiles` (`{profile: {...}}`) or `GET /v1/profiles?externalId=`
/// (`{profiles: [...]}`).
pub fn profile_id(v: &Value) -> Option<String> {
    v.get("profile")
        .and_then(id_of)
        .or_else(|| v.get("profiles")?.as_array()?.first().and_then(id_of))
}

/// From a `409 profile_external_id_conflict` body.
pub fn conflicting_profile_id(v: &Value) -> Option<String> {
    v.pointer("/details/existingProfileId")
        .and_then(Value::as_str)
        .map(str::to_owned)
}

pub fn auth_url(v: &Value) -> Option<String> {
    str_of(v, &["authUrl"]).filter(|u| u.starts_with("https://"))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub id: String,
    pub platform: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub platform_user_id: Option<String>,
    pub profile_id: Option<String>,
    pub active: bool,
}

pub fn accounts(v: &Value) -> Vec<Account> {
    let Some(list) = v.get("accounts").and_then(Value::as_array) else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|a| {
            Some(Account {
                id: str_of(a, &["_id", "accountId", "id"])?,
                platform: str_of(a, &["platform"])?,
                username: str_of(a, &["username"]),
                display_name: str_of(a, &["displayName", "name"]),
                // Not in the docs example; names guessed from the search
                // parameter's wording. Absent is fine (match by username).
                platform_user_id: str_of(a, &["platformUserId", "platformId"]),
                profile_id: ref_id(a, "profileId"),
                active: a.get("isActive").and_then(Value::as_bool).unwrap_or(true),
            })
        })
        .collect()
}

/// From `GET /v1/accounts/health`: account id → connection status.
pub fn health(v: &Value) -> Vec<(String, ConnectionStatus)> {
    let Some(list) = v.get("accounts").and_then(Value::as_array) else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|a| {
            let id = str_of(a, &["accountId", "_id"])?;
            let needs = a.get("needsReconnect").and_then(Value::as_bool) == Some(true)
                || a.get("canPost").and_then(Value::as_bool) == Some(false);
            Some((
                id,
                if needs {
                    ConnectionStatus::NeedsReconnect
                } else {
                    ConnectionStatus::Active
                },
            ))
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Presigned {
    pub upload_url: String,
    pub public_url: String,
}

pub fn presign(v: &Value) -> Option<Presigned> {
    Some(Presigned {
        upload_url: str_of(v, &["uploadUrl"]).filter(|u| u.starts_with("https://"))?,
        public_url: str_of(v, &["publicUrl"]).filter(|u| u.starts_with("https://"))?,
    })
}

/// Zernio's `errorCategory` (e.g. `user_content`) → `platform_<category>`.
pub fn platform_error_code(category: Option<&str>) -> String {
    let clean: String = category
        .unwrap_or("rejected")
        .chars()
        .map(|c| {
            if c.is_ascii_alphabetic() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .take(30)
        .collect();
    format!("platform_{clean}")
}

fn platform_status(s: &str) -> Option<DeliveryStatus> {
    Some(match s {
        "pending" | "scheduled" => DeliveryStatus::Scheduled,
        "processing" | "uploading" | "publishing" => DeliveryStatus::Publishing,
        "published" => DeliveryStatus::Published,
        "failed" => DeliveryStatus::Failed,
        "cancelled" | "deleted" => DeliveryStatus::Cancelled,
        "draft" | "pending_approval" => DeliveryStatus::Pending,
        _ => return None,
    })
}

/// From `POST /v1/posts` or `GET /v1/posts/{id}`. One Zernio post holds one
/// delivery, so its single platform entry is the delivery's state.
pub fn post_state(v: &Value) -> Option<(String, DeliveryState)> {
    let post = v.get("post").unwrap_or(v);
    let id = id_of(post)?;
    let entry = post
        .get("platforms")
        .and_then(Value::as_array)
        .and_then(|a| a.first());
    let status = entry
        .and_then(|e| str_of(e, &["status"]))
        .and_then(|s| platform_status(&s))
        .or_else(|| str_of(post, &["status"]).and_then(|s| platform_status(&s)))?;
    let error = (status == DeliveryStatus::Failed).then(|| {
        let category = entry.and_then(|e| str_of(e, &["errorCategory"]));
        PublishError::new(
            ErrorClass::Rejected,
            &platform_error_code(category.as_deref()),
        )
    });
    Some((
        id,
        DeliveryState {
            status,
            platform_post_id: entry.and_then(|e| str_of(e, &["platformPostId"])),
            platform_url: entry.and_then(|e| str_of(e, &["platformPostUrl", "publishedUrl"])),
            error,
        },
    ))
}
