//! A stateful stand-in for the Zernio API behind the adapter's `Transport`.
//! Response bodies follow the documented shapes in `tests/fixtures/zernio`.
#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use futures::StreamExt;
use kubcode_publishing::contract::{ConnectHarness, EventHarness, Fault, PublisherHarness};
use kubcode_publishing::domain::{Platform, ProviderRef};
use kubcode_publishing::events::Headers;
use kubcode_publishing::ports::{CallbackParams, ConnectionRef, MediaSource};
use kubcode_publishing_zernio::events::{sign, ZernioEvents};
use kubcode_publishing_zernio::limiter::MinuteWindow;
use kubcode_publishing_zernio::transport::{
    HttpRequest, HttpResponse, Method, RequestBody, Transport, TransportError,
};
use kubcode_publishing_zernio::{Zernio, ZernioConfig};
use serde_json::{json, Value};
use time::macros::datetime;
use time::OffsetDateTime;
use url::Url;

pub const API_KEY: &str =
    "sk_test_0000000000000000000000000000000000000000000000000000000000000000";
pub const WEBHOOK_SECRET: &[u8] = b"whsec-test";
pub const BASE: &str = "https://zernio.test/api";

#[derive(Debug, Clone)]
pub struct Recorded {
    pub method: Method,
    pub url: Url,
    pub headers: Vec<(String, String)>,
    pub json: Option<Value>,
    pub uploaded: Option<Vec<u8>>,
}

impl Recorded {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

#[derive(Default)]
struct State {
    profiles: HashMap<String, String>, // externalId -> id
    accounts: HashMap<String, (String, String, bool)>, // id -> (profile, platform, active)
    posts: HashMap<String, Value>,     // id -> post
    keys: HashMap<String, String>,     // idempotency key -> post id
    uploads: HashMap<String, Vec<u8>>, // upload path -> bytes
    fault: Option<Fault>,
    next: u64,
    log: Vec<Recorded>,
}

#[derive(Default, Clone)]
pub struct FakeZernio(Arc<Mutex<State>>);

fn resp(status: u16, body: Value) -> HttpResponse {
    HttpResponse {
        status,
        headers: vec![("content-type".into(), "application/json".into())],
        body: serde_json::to_vec(&body).unwrap(),
    }
}

fn not_found() -> HttpResponse {
    resp(404, json!({"error": "Not found"}))
}

impl FakeZernio {
    fn with<T>(&self, f: impl FnOnce(&mut State) -> T) -> T {
        f(&mut self.0.lock().unwrap())
    }

    fn id(&self) -> String {
        self.with(|s| {
            s.next += 1;
            format!("{:024x}", s.next)
        })
    }

    pub fn log(&self) -> Vec<Recorded> {
        self.with(|s| s.log.clone())
    }

    pub fn inject(&self, f: Fault) {
        self.with(|s| s.fault = Some(f));
    }

    pub fn add_account(&self, profile: &str, platform: &str) -> String {
        let id = self.id();
        self.with(|s| {
            s.accounts
                .insert(id.clone(), (profile.into(), platform.into(), true))
        });
        id
    }

    pub fn set_post_status(&self, id: &str, status: &str) {
        self.with(|s| {
            if let Some(p) = s.posts.get_mut(id) {
                p["status"] = json!(status);
                p["platforms"][0]["status"] = json!(status);
                if status == "published" {
                    p["platforms"][0]["platformPostUrl"] =
                        json!("https://www.youtube.com/watch?v=y7AAfV8ABIo");
                }
            }
        });
    }

    pub fn post_count(&self) -> usize {
        self.with(|s| s.posts.len())
    }

    fn fault_response(&self) -> Option<HttpResponse> {
        self.with(|s| s.fault.take()).map(|f| match f {
            Fault::TokenExpired => resp(
                401,
                json!({"error": "Token expired", "code": "TOKEN_EXPIRED", "type": "authentication_error"}),
            ),
            Fault::RateLimited { retry_after_secs } => {
                let mut r = resp(
                    429,
                    json!({"error": "Rate limit exceeded.", "details": {"retryAfterSeconds": retry_after_secs}}),
                );
                r.headers
                    .push(("retry-after".into(), retry_after_secs.to_string()));
                r
            }
            Fault::ServerError => resp(500, json!({"error": "Internal error", "code": "internal_error", "type": "api_error"})),
            Fault::Billing => resp(402, json!({"error": "Payment required", "code": "payment_required"})),
        })
    }

    fn route(&self, req: &HttpRequest, body: Option<&Value>) -> HttpResponse {
        let url = Url::parse(&req.url).unwrap();
        if url.host_str() == Some("storage.zernio.test") {
            return resp(200, json!({}));
        }
        let auth = req
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("authorization"));
        if auth.map(|(_, v)| v.as_str()) != Some(&format!("Bearer {API_KEY}")) {
            return resp(
                401,
                json!({"error": "Missing API key.", "type": "authentication_error", "code": "missing_credentials"}),
            );
        }
        let path = url.path().trim_start_matches("/api");
        let q: HashMap<String, String> = url.query_pairs().into_owned().collect();
        let seg: Vec<&str> = path.trim_matches('/').split('/').collect();
        if path.starts_with("/v1/posts") {
            if let Some(r) = self.fault_response() {
                return r;
            }
        }
        match (req.method, seg.as_slice()) {
            (Method::Post, ["v1", "profiles"]) => {
                let ext = body.unwrap()["externalId"].as_str().unwrap().to_owned();
                if let Some(id) = self.with(|s| s.profiles.get(&ext).cloned()) {
                    return resp(
                        409,
                        json!({"error": "A profile with this externalId already exists", "code": "profile_external_id_conflict", "param": "externalId", "details": {"existingProfileId": id}}),
                    );
                }
                let id = self.id();
                self.with(|s| s.profiles.insert(ext.clone(), id.clone()));
                resp(
                    201,
                    json!({"message": "Profile created successfully", "profile": {"_id": id, "name": body.unwrap()["name"], "externalId": ext, "isDefault": false}}),
                )
            }
            (Method::Get, ["v1", "connect", platform]) => {
                let pid = q.get("profileId").cloned().unwrap_or_default();
                if !self.with(|s| s.profiles.values().any(|v| *v == pid)) {
                    return resp(
                        404,
                        json!({"error": "Profile not found", "code": "profile_not_found"}),
                    );
                }
                assert_eq!(q.get("headless").map(String::as_str), Some("true"));
                assert!(q
                    .get("redirect_url")
                    .unwrap()
                    .starts_with("https://kubcode.dev/"));
                resp(
                    200,
                    json!({"authUrl": format!("https://accounts.example/oauth?platform={platform}")}),
                )
            }
            (Method::Get, ["v1", "accounts"]) => {
                let pid = q.get("profileId").cloned().unwrap_or_default();
                let accounts: Vec<Value> = self.with(|s| {
                    s.accounts
                        .iter()
                        .filter(|(_, (p, _, active))| *p == pid && *active)
                        .map(|(id, (p, plat, active))| {
                            // Populated, as the real GET /v1/accounts returns it.
                            json!({"_id": id, "platform": plat, "username": "lokeekbaeb", "isActive": active, "profileId": {"_id": p, "name": "kubcode", "slug": "kubcode"}})
                        })
                        .collect()
                });
                resp(200, json!({"accounts": accounts}))
            }
            (Method::Get, ["v1", "accounts", "health"]) => {
                let pid = q.get("profileId").cloned().unwrap_or_default();
                let accounts: Vec<Value> = self.with(|s| {
                    s.accounts
                        .iter()
                        .filter(|(_, (p, _, active))| *p == pid && *active)
                        .map(|(id, (_, plat, _))| {
                            json!({"accountId": id, "platform": plat, "status": "healthy", "canPost": true, "needsReconnect": false})
                        })
                        .collect()
                });
                resp(200, json!({"summary": {}, "accounts": accounts}))
            }
            (Method::Delete, ["v1", "accounts", id]) => {
                let found = self.with(|s| match s.accounts.get_mut(*id) {
                    Some(a) if a.2 => {
                        a.2 = false;
                        true
                    }
                    _ => false,
                });
                if found {
                    resp(200, json!({"message": "Account disconnected"}))
                } else {
                    not_found()
                }
            }
            (Method::Post, ["v1", "media", "presign"]) => {
                let name = body.unwrap()["filename"].as_str().unwrap().to_owned();
                let n = self.id();
                resp(
                    200,
                    json!({
                        "uploadUrl": format!("https://storage.zernio.test/temp/{n}_{name}?X-Amz-Signature=x"),
                        "publicUrl": format!("https://media.zernio.test/temp/{n}_{name}"),
                        "key": format!("temp/{n}_{name}"),
                        "expiresIn": 3600
                    }),
                )
            }
            (Method::Post, ["v1", "posts"]) => {
                let key = req
                    .headers
                    .iter()
                    .find(|(k, _)| k.eq_ignore_ascii_case("idempotency-key"))
                    .map(|(_, v)| v.clone())
                    .expect("Idempotency-Key on every create");
                if let Some(id) = self.with(|s| s.keys.get(&key).cloned()) {
                    let post = self.with(|s| s.posts[&id].clone());
                    return resp(200, json!({"post": post}));
                }
                let id = self.id();
                let b = body.unwrap();
                let post = json!({
                    "_id": id, "status": "scheduled", "scheduledFor": b["scheduledFor"],
                    "platforms": [{"platform": b["platforms"][0]["platform"], "status": "pending"}]
                });
                self.with(|s| {
                    s.keys.insert(key, id.clone());
                    s.posts.insert(id.clone(), post.clone());
                });
                resp(
                    201,
                    json!({"message": "Post scheduled successfully", "post": post}),
                )
            }
            (Method::Get, ["v1", "posts", id]) => match self.with(|s| s.posts.get(*id).cloned()) {
                Some(p) => resp(200, json!({"post": p})),
                None => not_found(),
            },
            (Method::Delete, ["v1", "posts", id]) => {
                let st = self.with(|s| s.posts.get(*id).map(|p| p["status"].clone()));
                match st {
                    None => not_found(),
                    Some(s) if s == "published" => resp(
                        400,
                        json!({"error": "Published posts cannot be deleted", "type": "invalid_request_error", "code": "invalid_resource_state"}),
                    ),
                    Some(_) => {
                        self.with(|s| s.posts.remove(*id));
                        resp(200, json!({"message": "Post deleted"}))
                    }
                }
            }
            other => panic!("fake Zernio has no route for {other:?}"),
        }
    }
}

#[async_trait]
impl Transport for FakeZernio {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError> {
        let url = Url::parse(&req.url).unwrap();
        let mut json = None;
        let mut uploaded = None;
        let headers = req.headers.clone();
        let method = req.method;
        let req_url = req.url.clone();
        let mut req = req;
        match std::mem::replace(&mut req.body, RequestBody::Empty) {
            RequestBody::Empty => {}
            RequestBody::Json(raw) => json = Some(serde_json::from_slice(&raw).unwrap()),
            RequestBody::Stream { mut stream, .. } => {
                let mut all = Vec::new();
                while let Some(chunk) = stream.next().await {
                    all.extend_from_slice(&chunk.unwrap());
                }
                self.with(|s| s.uploads.insert(url.path().to_owned(), all.clone()));
                uploaded = Some(all);
            }
        }
        let r = self.route(
            &HttpRequest {
                method,
                url: req_url,
                headers: headers.clone(),
                body: RequestBody::Empty,
            },
            json.as_ref(),
        );
        self.with(|s| {
            s.log.push(Recorded {
                method,
                url,
                headers,
                json,
                uploaded,
            })
        });
        Ok(r)
    }
}

pub fn adapter(fake: &FakeZernio) -> Zernio {
    Zernio::new(
        ZernioConfig {
            base_url: BASE.into(),
            api_key: API_KEY.into(),
        },
        Arc::new(fake.clone()),
        Arc::new(MinuteWindow::new(1_000)),
    )
}

pub struct Harness {
    pub fake: FakeZernio,
    pub zernio: Zernio,
    pub events: ZernioEvents,
}

impl Default for Harness {
    fn default() -> Self {
        let fake = FakeZernio::default();
        let zernio = adapter(&fake);
        Self {
            fake,
            zernio,
            events: ZernioEvents::new(vec![WEBHOOK_SECRET.to_vec()]),
        }
    }
}

#[async_trait]
impl ConnectHarness for Harness {
    type P = Zernio;

    fn provider(&self) -> &Zernio {
        &self.zernio
    }

    async fn approve(&self, profile: &ProviderRef, platform: Platform) -> CallbackParams {
        let id = self.fake.add_account(&profile.0, platform.as_str());
        CallbackParams(vec![
            ("connected".into(), platform.as_str().into()),
            ("profileId".into(), profile.0.clone()),
            ("accountId".into(), id),
            ("username".into(), "lokeekbaeb".into()),
        ])
    }

    fn foreign_callback(&self, platform: Platform) -> CallbackParams {
        let id = self
            .fake
            .add_account("someone-elses-profile", platform.as_str());
        CallbackParams(vec![
            ("connected".into(), platform.as_str().into()),
            ("accountId".into(), id),
        ])
    }

    fn denied_callback(&self, platform: Platform) -> CallbackParams {
        CallbackParams(vec![
            ("error".into(), "oauth_denied".into()),
            ("platform".into(), platform.as_str().into()),
        ])
    }
}

#[async_trait]
impl PublisherHarness for Harness {
    type P = Zernio;

    fn publisher(&self) -> &Zernio {
        &self.zernio
    }

    async fn connection(&self, platform: Platform) -> ConnectionRef {
        let profile = "66a1f0c2a4b9d3e8f1a2b3c4".to_owned();
        let account = self.fake.add_account(&profile, platform.as_str());
        ConnectionRef {
            platform,
            profile: ProviderRef(profile),
            account: ProviderRef(account),
        }
    }

    fn media(&self) -> Box<dyn MediaSource> {
        Box::new(kubcode_publishing::fake::FakeMedia)
    }

    fn inject(&self, fault: Fault) {
        self.fake.inject(fault);
    }

    async fn provider_posts(&self) -> usize {
        self.fake.post_count()
    }

    async fn mark_published(&self, post: &ProviderRef) {
        self.fake.set_post_status(&post.0, "published");
    }

    fn now(&self) -> OffsetDateTime {
        datetime!(2026-11-09 12:00 +07:00)
    }
}

pub fn signed(body: &Value) -> (Headers, Vec<u8>) {
    let raw = serde_json::to_vec(body).unwrap();
    let headers = Headers(vec![
        ("X-Zernio-Signature".into(), sign(WEBHOOK_SECRET, &raw)),
        (
            "X-Zernio-Event".into(),
            body["event"].as_str().unwrap_or("").into(),
        ),
    ]);
    (headers, raw)
}

impl EventHarness for Harness {
    type E = ZernioEvents;

    fn source(&self) -> &ZernioEvents {
        &self.events
    }

    fn published(&self, post: &ProviderRef) -> (Headers, Vec<u8>) {
        let mut body: Value = serde_json::from_str(include_str!(
            "../fixtures/zernio/webhook-post-platform-published.json"
        ))
        .unwrap();
        body["post"]["id"] = json!(post.0);
        signed(&body)
    }

    fn unknown(&self) -> (Headers, Vec<u8>) {
        signed(
            &json!({"id": "evt_x", "event": "analytics.synced", "timestamp": "2026-11-09T00:00:00Z"}),
        )
    }

    fn wrong_secret(&self, body: &[u8]) -> Headers {
        Headers(vec![("X-Zernio-Signature".into(), sign(b"other", body))])
    }
}
