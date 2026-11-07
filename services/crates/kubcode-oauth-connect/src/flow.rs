//! Exchange and revoke (docs/design/settings-keys.md §2, §2a), as the DB role
//! `kubcode_worker`. The intent row is the only input the web host controls,
//! and it holds hashes and sealed values only; the app to use is read from
//! its `app_source`, never guessed.

use kubcode_envelope::{open, seal, DekUnwrapper, SecretContext, WrapPublicKey};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio_postgres::Client;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::providers::{Connected, OAuthClient, Providers};

/// Everything a flow needs besides the DB connection.
pub struct Deps<'a, U: DekUnwrapper, P: Providers> {
    pub unwrapper: &'a U,
    pub providers: &'a P,
    pub wrap_key: &'a WrapPublicKey,
    /// kubcode's shared Google client (SSM), if the owner has set it.
    pub kubcode_google: Option<&'a OAuthClient>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Exchange {
    Connected {
        label: String,
    },
    /// Fixed code (`[a-z_]{1,40}`), never provider text.
    Failed(&'static str),
}

#[derive(Debug, PartialEq, Eq)]
pub enum Revoke {
    Done { revoked: bool },
    NotFound,
}

pub type DbResult<T> = Result<T, tokio_postgres::Error>;

/// Replay guard for HMAC-signed requests: false when the nonce was seen in the
/// last 10 minutes. Old rows are pruned on every call.
pub async fn accept_nonce(db: &Client, nonce: &str) -> DbResult<bool> {
    db.execute(
        "DELETE FROM kubcode_accounts.connect_request_nonces WHERE created_at < now() - interval '10 minutes'",
        &[],
    )
    .await?;
    let hash = Sha256::digest(nonce.as_bytes()).to_vec();
    let inserted = db
        .execute(
            "INSERT INTO kubcode_accounts.connect_request_nonces (nonce_hash) VALUES ($1) ON CONFLICT DO NOTHING",
            &[&hash],
        )
        .await?;
    Ok(inserted == 1)
}

struct Intent {
    id: Uuid,
    user_id: Uuid,
    provider: String,
    verifier: Option<Vec<u8>>,
    app_source: String,
}

fn ctx(
    table: &str,
    row: Uuid,
    user: Uuid,
    kind: &str,
    version: u32,
) -> Result<SecretContext, &'static str> {
    SecretContext::new(table, &row.to_string(), &user.to_string(), kind, version)
        .map_err(|_| "bad_context")
}

async fn open_text<U: DekUnwrapper>(
    u: &U,
    envelope: &[u8],
    c: &SecretContext,
) -> Result<Zeroizing<String>, &'static str> {
    let plain = open(envelope, c, u).await.map_err(|_| "unwrap_failed")?;
    String::from_utf8(plain.to_vec())
        .map(Zeroizing::new)
        .map_err(|_| "unwrap_failed")
}

/// The member's own app for this provider: client/app id plus the secret
/// opened from `user_secrets`, and that row's version.
async fn member_app<U: DekUnwrapper>(
    db: &Client,
    u: &U,
    intent: &Intent,
) -> Result<(OAuthClient, i32), &'static str> {
    let (kind, field) = match intent.provider.as_str() {
        "youtube" => ("youtube_oauth_client", "client_secret"),
        "instagram" => ("instagram_app", "app_secret"),
        _ => return Err("bad_provider"),
    };
    let row = db
        .query_opt(
            "SELECT id, public_value, envelope, version FROM kubcode_accounts.user_secrets WHERE user_id = $1 AND kind = $2",
            &[&intent.user_id, &kind],
        )
        .await
        .map_err(|_| "db_error")?
        .ok_or("app_not_configured")?;
    let (id, public, envelope, version): (Uuid, Option<String>, Vec<u8>, i32) =
        (row.get(0), row.get(1), row.get(2), row.get(3));
    let c = ctx(
        "user_secrets",
        id,
        intent.user_id,
        kind,
        u32::try_from(version).map_err(|_| "bad_context")?,
    )?;
    let json = open_text(u, &envelope, &c).await?;
    let v: Value = serde_json::from_str(&json).map_err(|_| "unwrap_failed")?;
    let secret = v[field].as_str().ok_or("unwrap_failed")?;
    Ok((
        OAuthClient {
            client_id: public.ok_or("app_not_configured")?,
            client_secret: Zeroizing::new(secret.to_owned()),
        },
        version,
    ))
}

/// Runs the provider exchange for a locked intent. Errors are fixed codes.
async fn connect<U: DekUnwrapper, P: Providers>(
    db: &Client,
    deps: &Deps<'_, U, P>,
    intent: &Intent,
    code: &str,
) -> Result<(Connected, i32), &'static str> {
    let (client, app_version) = match intent.app_source.as_str() {
        "kubcode" if intent.provider == "youtube" => {
            let shared = deps.kubcode_google.ok_or("app_not_configured")?;
            (
                OAuthClient {
                    client_id: shared.client_id.clone(),
                    client_secret: shared.client_secret.clone(),
                },
                1,
            )
        }
        "member" => member_app(db, deps.unwrapper, intent).await?,
        _ => return Err("app_not_configured"),
    };
    let connected = match intent.provider.as_str() {
        "youtube" => {
            let envelope = intent.verifier.as_deref().ok_or("verifier_missing")?;
            let c = ctx(
                "oauth_connect_intents",
                intent.id,
                intent.user_id,
                "youtube",
                1,
            )?;
            let verifier = open_text(deps.unwrapper, envelope, &c).await?;
            deps.providers
                .connect_youtube(&client, code, &verifier)
                .await
                .map_err(|e| e.0)?
        }
        "instagram" => deps
            .providers
            .connect_instagram(&client, code)
            .await
            .map_err(|e| e.0)?,
        _ => return Err("bad_provider"),
    };
    Ok((connected, app_version))
}

/// Seals the token for its row (AAD binds row, owner, provider and version)
/// and inserts or updates the connection on (user, provider, account).
async fn upsert(
    db: &Client,
    wrap_key: &WrapPublicKey,
    intent: &Intent,
    c: &Connected,
    app_version: i32,
) -> Result<(), &'static str> {
    let existing = db
        .query_opt(
            "SELECT id, version FROM kubcode_accounts.oauth_connections
              WHERE user_id = $1 AND provider = $2 AND external_account_id = $3 FOR UPDATE",
            &[&intent.user_id, &intent.provider, &c.account.external_id],
        )
        .await
        .map_err(|_| "db_error")?;
    let is_update = existing.is_some();
    let (id, version): (Uuid, i32) = match existing {
        Some(r) => (r.get(0), r.get::<_, i32>(1) + 1),
        None => (Uuid::new_v4(), 1),
    };
    let sc = ctx(
        "oauth_connections",
        id,
        intent.user_id,
        &intent.provider,
        u32::try_from(version).map_err(|_| "bad_context")?,
    )?;
    let envelope = seal(&sc, c.stored.as_bytes(), wrap_key).map_err(|_| "seal_failed")?;
    let slot = i16::from(wrap_key.slot());
    let expires: Option<f64> = c.expires_in.map(|s| s as f64);
    let sql = if is_update {
        "UPDATE kubcode_accounts.oauth_connections
            SET account_label = $4, scopes = $5, app_secret_version = $6, envelope = $7, key_slot = $8,
                version = $9, status = 'active', token_expires_at = now() + make_interval(secs => $10),
                last_refreshed_at = now(), last_checked_at = now(), last_error_code = NULL,
                app_source = $11, updated_at = now()
          WHERE id = $1 AND user_id = $2 AND provider = $3"
    } else {
        "INSERT INTO kubcode_accounts.oauth_connections
           (id, user_id, provider, account_label, scopes, app_secret_version, envelope, key_slot, version,
            token_expires_at, last_refreshed_at, last_checked_at, app_source, external_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(secs => $10), now(), now(), $11, $12)"
    };
    let label = &c.account.label;
    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = vec![
        &id,
        &intent.user_id,
        &intent.provider,
        label,
        &c.scopes,
        &app_version,
        &envelope,
        &slot,
        &version,
        &expires,
        &intent.app_source,
    ];
    if !is_update {
        params.push(&c.account.external_id);
    }
    db.execute(sql, &params).await.map_err(|_| "db_error")?;
    Ok(())
}

async fn close_intent(db: &Client, intent: &Intent, status: &str, event: &str) -> DbResult<()> {
    db.execute(
        "UPDATE kubcode_accounts.oauth_connect_intents
            SET phase = 'closed', status = $2, closed_at = now(), verifier_envelope = NULL, key_slot = NULL
          WHERE id = $1 AND phase <> 'closed'",
        &[&intent.id, &status],
    )
    .await?;
    audit(db, intent.user_id, event, &intent.provider).await
}

async fn audit(db: &Client, user: Uuid, event: &str, subject: &str) -> DbResult<()> {
    db.execute(
        "INSERT INTO kubcode_accounts.secret_audit_events (user_id, event, subject, actor) VALUES ($1, $2, $3, 'lambda')",
        &[&user, &event, &subject],
    )
    .await
    .map(|_| ())
}

/// POST /oauth/exchange {state, code}: the intent must be `exchanging` (the web
/// host moved it there after checking the session, cookie and provider),
/// open and unexpired. The intent is closed either way.
pub async fn exchange<U: DekUnwrapper, P: Providers>(
    db: &Client,
    deps: &Deps<'_, U, P>,
    state: &str,
    code: &str,
) -> DbResult<Exchange> {
    let state_hash = Sha256::digest(state.as_bytes()).to_vec();
    // One connection per request, dropped afterwards: an early `?` can never
    // leave a transaction open on a shared connection.
    db.batch_execute("BEGIN").await?;
    let row = db
        .query_opt(
            "SELECT id, user_id, provider, verifier_envelope, app_source FROM kubcode_accounts.oauth_connect_intents
              WHERE state_hash = $1 AND phase = 'exchanging' AND status = 'open' AND expires_at > now()
              FOR UPDATE",
            &[&state_hash],
        )
        .await?;
    let Some(row) = row else {
        db.batch_execute("ROLLBACK").await?;
        return Ok(Exchange::Failed("intent_invalid"));
    };
    let intent = Intent {
        id: row.get(0),
        user_id: row.get(1),
        provider: row.get(2),
        verifier: row.get(3),
        app_source: row.get(4),
    };
    let result = match connect(db, deps, &intent, code).await {
        Ok((connected, app_version)) => upsert(db, deps.wrap_key, &intent, &connected, app_version)
            .await
            .map(|_| connected.account.label),
        Err(e) => Err(e),
    };
    match result {
        Ok(label) => {
            close_intent(db, &intent, "consumed", "oauth_connected").await?;
            db.batch_execute("COMMIT").await?;
            Ok(Exchange::Connected { label })
        }
        Err(code) => {
            // Nothing from the failed attempt is kept; the intent is closed.
            db.batch_execute("ROLLBACK").await?;
            close_intent(db, &intent, "failed", "oauth_connect_failed").await?;
            Ok(Exchange::Failed(code))
        }
    }
}

/// POST /oauth/revoke {connectionId, userId}: the web host marked the row
/// `revoking`. Google's grant is revoked when possible; the row (and its
/// ciphertext) is deleted either way.
pub async fn revoke<U: DekUnwrapper, P: Providers>(
    db: &Client,
    deps: &Deps<'_, U, P>,
    connection_id: Uuid,
    user_id: Uuid,
) -> DbResult<Revoke> {
    db.batch_execute("BEGIN").await?;
    let row = db
        .query_opt(
            "SELECT provider, envelope, version FROM kubcode_accounts.oauth_connections
              WHERE id = $1 AND user_id = $2 AND status = 'revoking' FOR UPDATE",
            &[&connection_id, &user_id],
        )
        .await?;
    let Some(row) = row else {
        db.batch_execute("ROLLBACK").await?;
        return Ok(Revoke::NotFound);
    };
    let (provider, envelope, version): (String, Vec<u8>, i32) =
        (row.get(0), row.get(1), row.get(2));
    let revoked = if provider == "youtube" {
        match u32::try_from(version)
            .ok()
            .and_then(|v| ctx("oauth_connections", connection_id, user_id, "youtube", v).ok())
        {
            Some(c) => match open_text(deps.unwrapper, &envelope, &c).await {
                Ok(json) => match serde_json::from_str::<Value>(&json)
                    .ok()
                    .and_then(|v| v["refresh_token"].as_str().map(str::to_owned))
                {
                    Some(token) => deps
                        .providers
                        .revoke_google(&Zeroizing::new(token))
                        .await
                        .is_ok(),
                    None => false,
                },
                Err(_) => false,
            },
            None => false,
        }
    } else {
        false
    };
    db.execute(
        "DELETE FROM kubcode_accounts.oauth_connections WHERE id = $1 AND user_id = $2",
        &[&connection_id, &user_id],
    )
    .await?;
    audit(db, user_id, "oauth_disconnected", &provider).await?;
    if provider == "youtube" && !revoked {
        audit(db, user_id, "oauth_revoke_failed", &provider).await?;
    }
    db.batch_execute("COMMIT").await?;
    Ok(Revoke::Done { revoked })
}

/// Opens a Google upload session bound to the member's selected shared-app channel.
pub async fn private_upload<U: DekUnwrapper, P: Providers>(
    db: &Client,
    deps: &Deps<'_, U, P>,
    b: &crate::handler::UploadBody,
) -> Result<(String, String), &'static str> {
    let row = db.query_opt("SELECT envelope, version, external_account_id FROM kubcode_accounts.oauth_connections
        WHERE id=$1 AND user_id=$2 AND provider='youtube' AND app_source='kubcode' AND status='active'",
        &[&b.connection_id,&b.user_id]).await.map_err(|_| "db_error")?.ok_or("not_found")?;
    let version: i32 = row.get(1);
    let context = ctx(
        "oauth_connections",
        b.connection_id,
        b.user_id,
        "youtube",
        version.try_into().map_err(|_| "bad_context")?,
    )?;
    let sealed: Vec<u8> = row.get(0);
    let token_json = open_text(deps.unwrapper, &sealed, &context).await?;
    let stored: Value = serde_json::from_str(&token_json).map_err(|_| "unwrap_failed")?;
    let client = deps.kubcode_google.ok_or("app_not_configured")?;
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "unavailable")?;
    let refresh = stored["refresh_token"].as_str().ok_or("reconnect")?;
    let token = http
        .post(crate::providers::GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", client.client_id.as_str()),
            ("client_secret", client.client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh),
        ])
        .send()
        .await
        .map_err(|_| "unavailable")?
        .error_for_status()
        .map_err(|_| "reconnect")?
        .bytes()
        .await
        .map_err(|_| "unavailable")?;
    let token: Value = serde_json::from_slice(&token).map_err(|_| "reconnect")?;
    let access = token["access_token"].as_str().ok_or("reconnect")?;
    let channel: String = row.get(2);
    let identity = http
        .get(crate::providers::YOUTUBE_CHANNELS_URL)
        .bearer_auth(access)
        .send()
        .await
        .map_err(|_| "unavailable")?
        .error_for_status()
        .map_err(|_| "reconnect")?
        .bytes()
        .await
        .map_err(|_| "unavailable")?;
    if crate::providers::parse_youtube_channel(&identity)
        .map_err(|_| "channel_lookup_failed")?
        .external_id
        != channel
    {
        return Err("channel_mismatch");
    }
    let metadata = serde_json::json!({"snippet":{"title":b.title,"categoryId":"22"},"status":{"privacyStatus":"private","selfDeclaredMadeForKids":b.made_for_kids}});
    let res = http.post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false")
        .bearer_auth(access).header("Origin","https://kubcode.dev").header("X-Upload-Content-Type","video/mp4")
        .header("X-Upload-Content-Length", b.size).header("Content-Type","application/json").body(metadata.to_string())
        .send().await.map_err(|_| "unavailable")?.error_for_status().map_err(|_| "upload_refused")?;
    let location = res
        .headers()
        .get("location")
        .and_then(|s| s.to_str().ok())
        .ok_or("missing_session")?;
    Ok((location.to_owned(), channel))
}
