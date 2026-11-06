//! Google (YouTube) and Instagram calls. Endpoints are fixed constants, so a
//! row or request can never point the Lambda at another host. Errors are fixed
//! codes; provider response text is never kept or returned.

use std::future::Future;

use serde::Deserialize;
use serde_json::Value;
use zeroize::Zeroizing;

pub const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const GOOGLE_REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
pub const YOUTUBE_CHANNELS_URL: &str =
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";
pub const INSTAGRAM_TOKEN_URL: &str = "https://api.instagram.com/oauth/access_token";
pub const INSTAGRAM_GRAPH: &str = "https://graph.instagram.com";

pub const YOUTUBE_REDIRECT: &str = "https://kubcode.dev/api/keys/oauth/callback/youtube";
pub const INSTAGRAM_REDIRECT: &str = "https://kubcode.dev/api/keys/oauth/callback/instagram";
const YOUTUBE_UPLOAD_SCOPE: &str = "https://www.googleapis.com/auth/youtube.upload";

/// An OAuth client: kubcode's shared app (from SSM) or the member's own app.
pub struct OAuthClient {
    pub client_id: String,
    pub client_secret: Zeroizing<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    /// YouTube channel id or Instagram user id.
    pub external_id: String,
    pub label: String,
}

/// What a successful connect yields. `stored` is the JSON that gets sealed.
pub struct Connected {
    pub account: Account,
    pub stored: Zeroizing<String>,
    pub expires_in: Option<i64>,
    pub scopes: Vec<String>,
}

/// Fixed error code (`[a-z_]{1,40}`, the DB's `last_error_code` shape).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProviderError(pub &'static str);

pub trait Providers: Send + Sync {
    fn connect_youtube(
        &self,
        client: &OAuthClient,
        code: &str,
        verifier: &str,
    ) -> impl Future<Output = Result<Connected, ProviderError>> + Send;
    fn connect_instagram(
        &self,
        client: &OAuthClient,
        code: &str,
    ) -> impl Future<Output = Result<Connected, ProviderError>> + Send;
    fn revoke_google(
        &self,
        refresh_token: &str,
    ) -> impl Future<Output = Result<(), ProviderError>> + Send;
}

// ------------------------------------------------------------ parsing (pure)

#[derive(Deserialize)]
struct GoogleToken {
    access_token: String,
    refresh_token: Option<String>,
    #[serde(default)]
    scope: String,
}

/// Access token, refresh token and granted scopes.
pub type GoogleGrant = (Zeroizing<String>, Zeroizing<String>, Vec<String>);

/// Google's token response: an offline grant must carry a refresh token and
/// the upload scope (the member may untick scopes on the consent screen).
pub fn parse_google_token(body: &[u8]) -> Result<GoogleGrant, ProviderError> {
    let t: GoogleToken =
        serde_json::from_slice(body).map_err(|_| ProviderError("bad_token_response"))?;
    let refresh = t.refresh_token.ok_or(ProviderError("no_refresh_token"))?;
    let scopes: Vec<String> = t.scope.split_whitespace().map(str::to_owned).collect();
    if !scopes.iter().any(|s| s == YOUTUBE_UPLOAD_SCOPE) {
        return Err(ProviderError("scope_missing"));
    }
    Ok((
        Zeroizing::new(t.access_token),
        Zeroizing::new(refresh),
        scopes,
    ))
}

/// The member's own channel from `channels.list mine=true`.
pub fn parse_youtube_channel(body: &[u8]) -> Result<Account, ProviderError> {
    let v: Value =
        serde_json::from_slice(body).map_err(|_| ProviderError("bad_channel_response"))?;
    let item = v["items"].get(0).ok_or(ProviderError("no_channel"))?;
    let id = item["id"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 128)
        .ok_or(ProviderError("no_channel"))?;
    let title = item["snippet"]["title"].as_str().unwrap_or(id);
    Ok(Account {
        external_id: id.to_owned(),
        label: clip(title),
    })
}

/// Short-lived token from the code exchange. Instagram has answered both flat
/// and `{"data":[…]}` shapes, so both are accepted.
pub fn parse_instagram_short(
    body: &[u8],
) -> Result<(Zeroizing<String>, Vec<String>), ProviderError> {
    let v: Value = serde_json::from_slice(body).map_err(|_| ProviderError("bad_token_response"))?;
    let t = if v["data"].is_array() {
        &v["data"][0]
    } else {
        &v
    };
    let token = t["access_token"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or(ProviderError("bad_token_response"))?;
    let scopes = match &t["permissions"] {
        Value::Array(a) => a
            .iter()
            .filter_map(|p| p.as_str().map(str::to_owned))
            .collect(),
        Value::String(s) => s
            .split(',')
            .map(|p| p.trim().to_owned())
            .filter(|p| !p.is_empty())
            .collect(),
        _ => Vec::new(),
    };
    Ok((Zeroizing::new(token.to_owned()), scopes))
}

/// The 60-day token from `ig_exchange_token`.
pub fn parse_instagram_long(body: &[u8]) -> Result<(Zeroizing<String>, i64), ProviderError> {
    let v: Value = serde_json::from_slice(body).map_err(|_| ProviderError("bad_token_response"))?;
    let token = v["access_token"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or(ProviderError("bad_token_response"))?;
    let expires = v["expires_in"]
        .as_i64()
        .filter(|n| *n > 0)
        .ok_or(ProviderError("bad_token_response"))?;
    Ok((Zeroizing::new(token.to_owned()), expires))
}

/// `/me?fields=user_id,username`: the professional account id and @handle.
pub fn parse_instagram_me(body: &[u8]) -> Result<Account, ProviderError> {
    let v: Value =
        serde_json::from_slice(body).map_err(|_| ProviderError("bad_profile_response"))?;
    let id = match (&v["user_id"], &v["id"]) {
        (Value::String(s), _) | (_, Value::String(s)) => s.clone(),
        (Value::Number(n), _) | (_, Value::Number(n)) => n.to_string(),
        _ => return Err(ProviderError("bad_profile_response")),
    };
    if id.is_empty() || id.len() > 128 {
        return Err(ProviderError("bad_profile_response"));
    }
    let label = v["username"]
        .as_str()
        .map(|u| format!("@{u}"))
        .unwrap_or_else(|| id.clone());
    Ok(Account {
        external_id: id,
        label: clip(&label),
    })
}

/// Labels are shown in the UI and limited to 200 characters by the DB.
fn clip(s: &str) -> String {
    s.chars().take(200).collect()
}

pub fn stored_json(field: &str, value: &str) -> Zeroizing<String> {
    Zeroizing::new(serde_json::json!({ field: value }).to_string())
}

// ------------------------------------------------------------ HTTP

pub struct HttpProviders {
    http: reqwest::Client,
}

impl HttpProviders {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("static reqwest config");
        Self { http }
    }

    async fn body(
        res: reqwest::Result<reqwest::Response>,
        code: &'static str,
    ) -> Result<Vec<u8>, ProviderError> {
        let res = res.map_err(|_| ProviderError("provider_unreachable"))?;
        if !res.status().is_success() {
            return Err(ProviderError(code));
        }
        res.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|_| ProviderError("provider_unreachable"))
    }
}

impl Default for HttpProviders {
    fn default() -> Self {
        Self::new()
    }
}

impl Providers for HttpProviders {
    async fn connect_youtube(
        &self,
        client: &OAuthClient,
        code: &str,
        verifier: &str,
    ) -> Result<Connected, ProviderError> {
        let form = [
            ("code", code),
            ("client_id", client.client_id.as_str()),
            ("client_secret", client.client_secret.as_str()),
            ("redirect_uri", YOUTUBE_REDIRECT),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier),
        ];
        let body = Self::body(
            self.http.post(GOOGLE_TOKEN_URL).form(&form).send().await,
            "exchange_failed",
        )
        .await?;
        let (access, refresh, scopes) = parse_google_token(&body)?;
        let channel = self
            .http
            .get(YOUTUBE_CHANNELS_URL)
            .bearer_auth(access.as_str())
            .send()
            .await;
        let account = parse_youtube_channel(&Self::body(channel, "channel_lookup_failed").await?)?;
        Ok(Connected {
            account,
            stored: stored_json("refresh_token", &refresh),
            expires_in: None,
            scopes,
        })
    }

    async fn connect_instagram(
        &self,
        client: &OAuthClient,
        code: &str,
    ) -> Result<Connected, ProviderError> {
        let form = [
            ("client_id", client.client_id.as_str()),
            ("client_secret", client.client_secret.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", INSTAGRAM_REDIRECT),
            ("code", code),
        ];
        let body = Self::body(
            self.http.post(INSTAGRAM_TOKEN_URL).form(&form).send().await,
            "exchange_failed",
        )
        .await?;
        let (short, scopes) = parse_instagram_short(&body)?;
        let long = self
            .http
            .get(format!("{INSTAGRAM_GRAPH}/access_token"))
            .query(&[
                ("grant_type", "ig_exchange_token"),
                ("client_secret", client.client_secret.as_str()),
                ("access_token", short.as_str()),
            ])
            .send()
            .await;
        let (token, expires_in) =
            parse_instagram_long(&Self::body(long, "long_lived_failed").await?)?;
        let me = self
            .http
            .get(format!("{INSTAGRAM_GRAPH}/v21.0/me"))
            .query(&[
                ("fields", "user_id,username"),
                ("access_token", token.as_str()),
            ])
            .send()
            .await;
        let account = parse_instagram_me(&Self::body(me, "profile_lookup_failed").await?)?;
        Ok(Connected {
            account,
            stored: stored_json("access_token", &token),
            expires_in: Some(expires_in),
            scopes,
        })
    }

    async fn revoke_google(&self, refresh_token: &str) -> Result<(), ProviderError> {
        let res = self
            .http
            .post(GOOGLE_REVOKE_URL)
            .form(&[("token", refresh_token)])
            .send()
            .await;
        Self::body(res, "revoke_failed").await.map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn google_token_needs_a_refresh_token_and_the_upload_scope() {
        let ok = br#"{"access_token":"ya29.x","expires_in":3599,"refresh_token":"1//r","scope":"https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload","token_type":"Bearer"}"#;
        let (access, refresh, scopes) = parse_google_token(ok).unwrap();
        assert_eq!((access.as_str(), refresh.as_str()), ("ya29.x", "1//r"));
        assert_eq!(scopes.len(), 2);
        let no_refresh =
            br#"{"access_token":"a","scope":"https://www.googleapis.com/auth/youtube.upload"}"#;
        assert_eq!(
            parse_google_token(no_refresh).err(),
            Some(ProviderError("no_refresh_token"))
        );
        let readonly = br#"{"access_token":"a","refresh_token":"r","scope":"https://www.googleapis.com/auth/youtube.readonly"}"#;
        assert_eq!(
            parse_google_token(readonly).err(),
            Some(ProviderError("scope_missing"))
        );
        assert_eq!(
            parse_google_token(b"<html>").err(),
            Some(ProviderError("bad_token_response"))
        );
    }

    #[test]
    fn youtube_channel_is_the_first_item() {
        let body = br#"{"items":[{"id":"UC123","snippet":{"title":"STORY GRID"}}]}"#;
        assert_eq!(
            parse_youtube_channel(body).unwrap(),
            Account {
                external_id: "UC123".into(),
                label: "STORY GRID".into()
            }
        );
        assert_eq!(
            parse_youtube_channel(br#"{"items":[]}"#).err(),
            Some(ProviderError("no_channel"))
        );
        let long = format!(
            r#"{{"items":[{{"id":"UC1","snippet":{{"title":"{}"}}}}]}}"#,
            "ก".repeat(300)
        );
        assert_eq!(
            parse_youtube_channel(long.as_bytes())
                .unwrap()
                .label
                .chars()
                .count(),
            200
        );
    }

    #[test]
    fn instagram_short_token_accepts_flat_and_data_shapes() {
        let flat = br#"{"access_token":"IGQ1","user_id":17841400000000000,"permissions":"instagram_business_basic,instagram_business_content_publish"}"#;
        let (t, scopes) = parse_instagram_short(flat).unwrap();
        assert_eq!(t.as_str(), "IGQ1");
        assert_eq!(
            scopes,
            [
                "instagram_business_basic",
                "instagram_business_content_publish"
            ]
        );
        let wrapped = br#"{"data":[{"access_token":"IGQ2","user_id":"1","permissions":["instagram_business_basic"]}]}"#;
        let (t, scopes) = parse_instagram_short(wrapped).unwrap();
        assert_eq!((t.as_str(), scopes.len()), ("IGQ2", 1));
        assert!(parse_instagram_short(br#"{"error_message":"bad code"}"#).is_err());
    }

    #[test]
    fn instagram_long_token_and_profile() {
        let (t, exp) = parse_instagram_long(
            br#"{"access_token":"IGL","token_type":"bearer","expires_in":5183944}"#,
        )
        .unwrap();
        assert_eq!((t.as_str(), exp), ("IGL", 5_183_944));
        assert!(parse_instagram_long(br#"{"access_token":"IGL"}"#).is_err());
        let me = parse_instagram_me(
            br#"{"user_id":"17841400000000000","username":"story.grids","id":"999"}"#,
        )
        .unwrap();
        assert_eq!(
            me,
            Account {
                external_id: "17841400000000000".into(),
                label: "@story.grids".into()
            }
        );
        let numeric = parse_instagram_me(br#"{"id":42}"#).unwrap();
        assert_eq!(
            numeric,
            Account {
                external_id: "42".into(),
                label: "42".into()
            }
        );
        assert!(parse_instagram_me(br#"{"username":"x"}"#).is_err());
    }

    #[test]
    fn stored_token_json_is_a_single_field() {
        assert_eq!(
            stored_json("refresh_token", "1//r\"q").as_str(),
            r#"{"refresh_token":"1//r\"q"}"#
        );
    }
}
