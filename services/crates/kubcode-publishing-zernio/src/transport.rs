//! The HTTP seam. Production uses reqwest; tests use a stateful fake Zernio,
//! so every request the adapter builds can be inspected.

use async_trait::async_trait;
use kubcode_publishing::ports::MediaStream;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
    Put,
    Delete,
}

pub enum RequestBody {
    Empty,
    Json(Vec<u8>),
    /// A media upload, streamed so a large Reel never sits in memory.
    Stream {
        stream: MediaStream,
        len: u64,
    },
}

pub struct HttpRequest {
    pub method: Method,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: RequestBody,
}

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpResponse {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

/// The request never reached Zernio or no response came back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransportError;

#[async_trait]
pub trait Transport: Send + Sync {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError>;
}

/// Responses above this size are refused: no Zernio answer we use is close.
const MAX_RESPONSE: usize = 4 * 1024 * 1024;

pub struct ReqwestTransport {
    client: reqwest::Client,
}

impl ReqwestTransport {
    pub fn new(timeout: std::time::Duration) -> Self {
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .redirect(reqwest::redirect::Policy::none())
            .https_only(true)
            .build()
            .expect("static reqwest config");
        Self { client }
    }
}

#[async_trait]
impl Transport for ReqwestTransport {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError> {
        let method = match req.method {
            Method::Get => reqwest::Method::GET,
            Method::Post => reqwest::Method::POST,
            Method::Put => reqwest::Method::PUT,
            Method::Delete => reqwest::Method::DELETE,
        };
        let mut b = self.client.request(method, &req.url);
        for (k, v) in &req.headers {
            b = b.header(k, v);
        }
        b = match req.body {
            RequestBody::Empty => b,
            RequestBody::Json(raw) => b.header("content-type", "application/json").body(raw),
            RequestBody::Stream { stream, len } => b
                .header("content-length", len.to_string())
                .body(reqwest::Body::wrap_stream(stream)),
        };
        let resp = b.send().await.map_err(|_| TransportError)?;
        let status = resp.status().as_u16();
        let headers = resp
            .headers()
            .iter()
            .filter_map(|(k, v)| Some((k.as_str().to_owned(), v.to_str().ok()?.to_owned())))
            .collect();
        if resp
            .content_length()
            .is_some_and(|n| n > MAX_RESPONSE as u64)
        {
            return Err(TransportError);
        }
        let body = resp.bytes().await.map_err(|_| TransportError)?;
        if body.len() > MAX_RESPONSE {
            return Err(TransportError);
        }
        Ok(HttpResponse {
            status,
            headers,
            body: body.to_vec(),
        })
    }
}
