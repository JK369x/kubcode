//! A small hand-written Stripe client: Checkout Sessions create, retrieve and
//! expire, form-encoded, API version pinned. Behind [`Transport`] so contract
//! tests replay recorded fixtures. The key never appears in errors or logs.

use async_trait::async_trait;
use serde::Deserialize;
use zeroize::Zeroizing;

/// Pinned so a Dashboard default change never alters what we parse.
pub const API_VERSION: &str = "2026-10-28.endive";
pub const API_BASE: &str = "https://api.stripe.com/v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpRequest {
    pub method: &'static str,
    pub path: String,
    /// application/x-www-form-urlencoded pairs (empty for GET).
    pub form: Vec<(String, String)>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransportError;

#[async_trait]
pub trait Transport: Send + Sync {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError>;
}

/// The production transport. Holds the secret key; adds auth and version headers.
pub struct ReqwestTransport {
    http: reqwest::Client,
    base: String,
    key: Zeroizing<String>,
}

impl ReqwestTransport {
    pub fn new(key: Zeroizing<String>, base: String) -> Result<Self, TransportError> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| TransportError)?;
        Ok(ReqwestTransport { http, base, key })
    }
}

#[async_trait]
impl Transport for ReqwestTransport {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError> {
        let url = format!("{}{}", self.base, req.path);
        let mut b = match req.method {
            "GET" => self.http.get(url),
            _ => self.http.post(url).form(&req.form),
        };
        b = b
            .basic_auth(self.key.as_str(), Some(""))
            .header("Stripe-Version", API_VERSION);
        if let Some(k) = req.idempotency_key {
            b = b.header("Idempotency-Key", k);
        }
        let r = b.send().await.map_err(|_| TransportError)?;
        let status = r.status().as_u16();
        let body = r.bytes().await.map_err(|_| TransportError)?.to_vec();
        Ok(HttpResponse { status, body })
    }
}

/// The fields of a Checkout Session we use. Anything else is ignored.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct Session {
    pub id: String,
    pub livemode: bool,
    pub status: Option<String>,
    pub payment_status: String,
    pub amount_total: Option<i64>,
    pub currency: Option<String>,
    pub url: Option<String>,
    pub client_reference_id: Option<String>,
    #[serde(default)]
    pub metadata: std::collections::HashMap<String, String>,
    pub payment_intent: Option<PaymentIntentRef>,
    #[serde(default)]
    pub payment_method_types: Vec<String>,
}

/// `payment_intent` is an id string, or an object when expanded.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum PaymentIntentRef {
    Id(String),
    Expanded(ExpandedIntent),
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ExpandedIntent {
    pub id: String,
    /// What the intent ALLOWS (e.g. card and promptpay), not what was used.
    #[serde(default)]
    pub payment_method_types: Vec<String>,
    /// Expanded `latest_charge`: its `payment_method_details.type` is what was used.
    #[serde(default)]
    pub latest_charge: Option<ChargeRef>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum ChargeRef {
    Id(String),
    Expanded(ExpandedCharge),
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ExpandedCharge {
    #[serde(default)]
    pub payment_method_details: Option<MethodDetails>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct MethodDetails {
    #[serde(rename = "type")]
    pub kind: String,
}

impl Session {
    pub fn payment_intent_id(&self) -> Option<&str> {
        match &self.payment_intent {
            Some(PaymentIntentRef::Id(s)) => Some(s),
            Some(PaymentIntentRef::Expanded(e)) => Some(&e.id),
            None => None,
        }
    }
    pub fn purchase_id(&self) -> Option<uuid::Uuid> {
        self.metadata
            .get("purchase_id")
            .and_then(|s| s.parse().ok())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StripeError {
    /// Network, 5xx or 429: retry later.
    Temporary,
    /// 4xx: our request was wrong; never retried as is.
    Rejected,
    /// The response did not parse.
    Malformed,
}

/// What we put on a Checkout Session.
pub struct NewSession<'a> {
    pub purchase_id: uuid::Uuid,
    pub workspace_id: uuid::Uuid,
    /// One line item: quantity × unit amount (satang).
    pub quantity: u32,
    pub unit_amount: i64,
    pub product_name: &'a str,
    pub success_url: &'a str,
    pub cancel_url: &'a str,
    pub customer_email: Option<&'a str>,
    /// Unix seconds; Stripe allows 30 minutes to 24 hours.
    pub expires_at: i64,
}

pub struct Stripe<T: Transport + ?Sized> {
    pub transport: std::sync::Arc<T>,
}

fn classify(status: u16) -> Option<StripeError> {
    match status {
        200..=299 => None,
        429 | 500..=599 => Some(StripeError::Temporary),
        _ => Some(StripeError::Rejected),
    }
}

impl<T: Transport + ?Sized> Stripe<T> {
    async fn session_call(&self, req: HttpRequest) -> Result<Session, StripeError> {
        let r = self
            .transport
            .send(req)
            .await
            .map_err(|_| StripeError::Temporary)?;
        if let Some(e) = classify(r.status) {
            return Err(e);
        }
        serde_json::from_slice(&r.body).map_err(|_| StripeError::Malformed)
    }

    /// `POST /v1/checkout/sessions`: mode=payment, THB, one price line,
    /// Adaptive Pricing off, Thai locale. Card and PromptPay come from the
    /// Dashboard configuration (the API rejects `payment_method_types`).
    pub async fn create_session(&self, s: &NewSession<'_>) -> Result<Session, StripeError> {
        let pid = s.purchase_id.to_string();
        let ws = s.workspace_id.to_string();
        let mut form: Vec<(String, String)> = vec![
            ("mode".into(), "payment".into()),
            ("currency".into(), "thb".into()),
            ("locale".into(), "th".into()),
            ("adaptive_pricing[enabled]".into(), "false".into()),
            ("client_reference_id".into(), ws.clone()),
            ("line_items[0][quantity]".into(), s.quantity.to_string()),
            ("line_items[0][price_data][currency]".into(), "thb".into()),
            (
                "line_items[0][price_data][unit_amount]".into(),
                s.unit_amount.to_string(),
            ),
            (
                "line_items[0][price_data][product_data][name]".into(),
                s.product_name.into(),
            ),
            ("metadata[purchase_id]".into(), pid.clone()),
            ("metadata[workspace_id]".into(), ws),
            (
                "payment_intent_data[metadata][purchase_id]".into(),
                pid.clone(),
            ),
            ("success_url".into(), s.success_url.into()),
            ("cancel_url".into(), s.cancel_url.into()),
            ("expires_at".into(), s.expires_at.to_string()),
        ];
        if let Some(e) = s.customer_email {
            form.push(("customer_email".into(), e.into()));
        }
        self.session_call(HttpRequest {
            method: "POST",
            path: "/checkout/sessions".into(),
            form,
            // One Checkout per purchase, even if the web host retries.
            idempotency_key: Some(format!("kubcode-purchase-{pid}")),
        })
        .await
    }

    /// `GET /v1/checkout/sessions/{id}?expand[]=payment_intent`: the source of
    /// truth for fulfilment (never the browser, never the webhook body alone).
    pub async fn retrieve_session(&self, id: &str) -> Result<Session, StripeError> {
        if !valid_session_id(id) {
            return Err(StripeError::Rejected);
        }
        self.session_call(HttpRequest {
            method: "GET",
            path: format!(
                "/checkout/sessions/{id}?expand%5B%5D=payment_intent&expand%5B%5D=payment_intent.latest_charge"
            ),
            form: vec![],
            idempotency_key: None,
        })
        .await
    }
}

pub fn valid_session_id(id: &str) -> bool {
    let rest = id
        .strip_prefix("cs_test_")
        .or_else(|| id.strip_prefix("cs_live_"));
    rest.is_some_and(|r| {
        (1..=200).contains(&r.len()) && r.bytes().all(|b| b.is_ascii_alphanumeric())
    })
}

/// Card or PromptPay: the method actually used, from the intent's latest
/// charge (found by the local E2E: the intent's `payment_method_types` lists
/// every allowed method). Anything else is not recorded.
pub fn payment_method(s: &Session) -> Option<&'static str> {
    let Some(PaymentIntentRef::Expanded(e)) = &s.payment_intent else {
        return None;
    };
    let Some(ChargeRef::Expanded(c)) = &e.latest_charge else {
        return None;
    };
    match c.payment_method_details.as_ref()?.kind.as_str() {
        "card" => Some("card"),
        "promptpay" => Some("promptpay"),
        _ => None,
    }
}
