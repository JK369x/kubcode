//! Contract tests: the billing service and HTTP routing against recorded
//! Stripe fixtures (tests/fixtures) and an in-memory store with the same
//! transition rules as the Postgres one.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use billing_lambda::http::{handle, Nonces};
use billing_lambda::service::{BillingStore, Config, Service};
use billing_lambda::stripe::{
    valid_session_id, HttpRequest, HttpResponse, Stripe, Transport, TransportError, API_VERSION,
};
use billing_lambda::webhook::{self, sign, Event};
use kubcode_billing::entitlement::{entitlement, Entitlement, PaidSpan};
use kubcode_billing::money::Satang;
use kubcode_billing::purchase::Status;
use kubcode_billing::quote::{Kind, Quote};
use kubcode_billing_store::{Fulfilled, Payer, Purchase, StoreError};
use lambda_http::http::HeaderMap;
use serde_json::Value;
use time::OffsetDateTime;
use uuid::Uuid;

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(format!(
        "{}/tests/fixtures/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}
fn fixture_json(name: &str) -> Value {
    serde_json::from_slice(&fixture(name)).unwrap()
}

// ---------------- fake Stripe ----------------

#[derive(Default)]
struct FakeStripe {
    /// Response to the next create, by default the recorded one.
    create: Mutex<Option<(u16, Vec<u8>)>>,
    /// session id → (status, body) for GET.
    sessions: Mutex<HashMap<String, (u16, Vec<u8>)>>,
    requests: Mutex<Vec<HttpRequest>>,
}

#[async_trait]
impl Transport for FakeStripe {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError> {
        self.requests.lock().unwrap().push(req.clone());
        if req.method == "POST" {
            let (status, body) = self
                .create
                .lock()
                .unwrap()
                .clone()
                .unwrap_or((200, fixture("session_created.json")));
            return Ok(HttpResponse { status, body });
        }
        let id = req
            .path
            .trim_start_matches("/checkout/sessions/")
            .split('?')
            .next()
            .unwrap()
            .to_owned();
        match self.sessions.lock().unwrap().get(&id) {
            Some((s, b)) => Ok(HttpResponse {
                status: *s,
                body: b.clone(),
            }),
            None => Ok(HttpResponse {
                status: 404,
                body: fixture("error_404.json"),
            }),
        }
    }
}

impl FakeStripe {
    /// Same session as `name`, with metadata.purchase_id replaced.
    fn serve_for(&self, name: &str, purchase: Uuid) {
        let mut v = fixture_json(name);
        v["metadata"]["purchase_id"] = Value::String(purchase.to_string());
        let id = v["id"].as_str().unwrap().to_owned();
        self.sessions
            .lock()
            .unwrap()
            .insert(id, (200, serde_json::to_vec(&v).unwrap()));
    }
}

// ---------------- in-memory store ----------------

#[derive(Default)]
struct Mem {
    payers: HashMap<Uuid, Payer>,
    purchases: Vec<Purchase>,
    reviews: Vec<(Uuid, String)>,
    events: Vec<String>,
    nonces: Vec<[u8; 32]>,
    grants: u32,
    pi: HashMap<Uuid, (Option<String>, Option<String>)>,
    /// Per purchase: (refunded total, dispute, revoked).
    after: HashMap<Uuid, (i64, Option<kubcode_billing::refund::Dispute>, bool)>,
    revokes: u32,
}

#[derive(Clone, Default)]
struct MemStore(Arc<Mutex<Mem>>);

fn spans(m: &Mem, ws: Uuid) -> Vec<PaidSpan> {
    m.purchases
        .iter()
        .filter(|p| {
            p.workspace == ws
                && p.status == Status::Paid
                && !m.after.get(&p.id).is_some_and(|a| a.2)
        })
        .map(|p| PaidSpan {
            slots: p.slots,
            period_start: p.period_start,
            period_end: p.period_end,
        })
        .collect()
}

#[async_trait]
impl BillingStore for MemStore {
    async fn payer(&self, user: Uuid) -> Result<Option<Payer>, StoreError> {
        Ok(self.0.lock().unwrap().payers.get(&user).cloned())
    }
    async fn entitlement(
        &self,
        ws: Uuid,
        exempt: bool,
        now: OffsetDateTime,
    ) -> Result<Entitlement, StoreError> {
        Ok(entitlement(
            &spans(&self.0.lock().unwrap(), ws),
            now,
            exempt,
        ))
    }
    async fn create_purchase(&self, ws: Uuid, _user: Uuid, q: &Quote) -> Result<Uuid, StoreError> {
        let id = Uuid::new_v4();
        self.0.lock().unwrap().purchases.push(Purchase {
            id,
            workspace: ws,
            kind: q.kind,
            slots: q.slots,
            amount: q.amount,
            period_start: q.period_start,
            period_end: q.period_end,
            status: Status::Pending,
            session_id: None,
        });
        Ok(id)
    }
    async fn attach_session(&self, purchase: Uuid, session: &str) -> Result<(), StoreError> {
        let mut m = self.0.lock().unwrap();
        let p = m
            .purchases
            .iter_mut()
            .find(|p| p.id == purchase && p.status == Status::Pending && p.session_id.is_none())
            .ok_or(StoreError::NotFound)?;
        p.session_id = Some(session.into());
        Ok(())
    }
    async fn abandon(&self, purchase: Uuid) -> Result<(), StoreError> {
        let mut m = self.0.lock().unwrap();
        if let Some(p) = m
            .purchases
            .iter_mut()
            .find(|p| p.id == purchase && p.status == Status::Pending)
        {
            p.status = Status::Failed;
        }
        Ok(())
    }
    async fn purchase(&self, id: Uuid) -> Result<Option<Purchase>, StoreError> {
        Ok(self
            .0
            .lock()
            .unwrap()
            .purchases
            .iter()
            .find(|p| p.id == id)
            .cloned())
    }
    async fn record_event(&self, id: &str, _k: &str, _l: bool) -> Result<bool, StoreError> {
        let mut m = self.0.lock().unwrap();
        if m.events.iter().any(|e| e == id) {
            return Ok(false);
        }
        m.events.push(id.into());
        Ok(true)
    }
    async fn fulfil(
        &mut self,
        purchase: Uuid,
        pi: Option<&str>,
        method: Option<&str>,
        exempt: bool,
        now: OffsetDateTime,
    ) -> Result<Fulfilled, StoreError> {
        let mut m = self.0.lock().unwrap();
        let Some(p) = m
            .purchases
            .iter_mut()
            .find(|p| p.id == purchase && p.status == Status::Pending)
        else {
            return Ok(Fulfilled::AlreadyPaid);
        };
        p.status = Status::Paid;
        let ws = p.workspace;
        m.grants += 1;
        m.pi.insert(purchase, (pi.map(Into::into), method.map(Into::into)));
        Ok(Fulfilled::Granted(entitlement(&spans(&m, ws), now, exempt)))
    }
    async fn close(&self, purchase: Uuid, to: Status) -> Result<bool, StoreError> {
        let mut m = self.0.lock().unwrap();
        match m
            .purchases
            .iter_mut()
            .find(|p| p.id == purchase && p.status == Status::Pending)
        {
            Some(p) => {
                p.status = to;
                Ok(true)
            }
            None => Ok(false),
        }
    }
    async fn flag_review(&self, purchase: Uuid, code: &str) -> Result<(), StoreError> {
        self.0.lock().unwrap().reviews.push((purchase, code.into()));
        Ok(())
    }
    async fn workspace_exempt(&self, ws: Uuid) -> Result<bool, StoreError> {
        Ok(self
            .0
            .lock()
            .unwrap()
            .payers
            .values()
            .any(|p| p.workspace == ws && p.exempt))
    }
    async fn event_seen(&self, id: &str) -> Result<bool, StoreError> {
        Ok(self.0.lock().unwrap().events.iter().any(|e| e == id))
    }
    async fn after_payment(
        &mut self,
        payment_intent: &str,
        ev: kubcode_billing_store::AfterPayment,
        _now: OffsetDateTime,
    ) -> Result<kubcode_billing_store::AfterOutcome, StoreError> {
        use kubcode_billing::refund::{on_dispute, on_refund, PaidFacts};
        use kubcode_billing_store::{AfterOutcome, AfterPayment};
        let mut m = self.0.lock().unwrap();
        let Some(id) =
            m.pi.iter()
                .find(|(_, v)| v.0.as_deref() == Some(payment_intent))
                .map(|(k, _)| *k)
        else {
            return Ok(AfterOutcome::Unknown);
        };
        let amount = m.purchases.iter().find(|p| p.id == id).unwrap().amount;
        let (refunded, dispute, revoked) = m.after.get(&id).copied().unwrap_or((0, None, false));
        let facts = PaidFacts {
            amount,
            refunded: Satang(refunded),
            dispute,
            revoked,
        };
        let c = match ev {
            AfterPayment::Refunded(t) => on_refund(&facts, t),
            AfterPayment::Dispute(d) => on_dispute(&facts, d),
        };
        if c.is_noop() {
            return Ok(AfterOutcome::Unchanged);
        }
        let entry = (
            c.refunded.map(|s| s.0).unwrap_or(refunded),
            c.dispute.or(dispute),
            revoked || c.revoke.is_some(),
        );
        m.after.insert(id, entry);
        match c.review {
            Some(kubcode_billing::refund::Review::Flag(code)) => m.reviews.push((id, code.into())),
            Some(kubcode_billing::refund::Review::Clear) => m.reviews.retain(|r| r.0 != id),
            None => {}
        }
        if c.revoke.is_some() {
            m.revokes += 1;
            return Ok(AfterOutcome::Revoked { paused: 0 });
        }
        Ok(AfterOutcome::Recorded)
    }
    async fn sweep(
        &mut self,
        _now: OffsetDateTime,
    ) -> Result<(usize, usize, usize, usize), StoreError> {
        Ok((1, 0, 0, 0))
    }
}

#[async_trait]
impl Nonces for MemStore {
    async fn use_nonce(&self, hash: &[u8; 32]) -> Result<bool, ()> {
        let mut m = self.0.lock().unwrap();
        if m.nonces.contains(hash) {
            return Ok(false);
        }
        m.nonces.push(*hash);
        Ok(true)
    }
}

// ---------------- harness ----------------

const HMAC: &[u8] = b"FIXTURE-ONLY-billing-hmac-key-000000000000000000";
const WHSEC: &[u8] = b"whsec_FIXTUREONLY0000000000000000";
const NOW: u64 = 1_794_549_300;
const USER: Uuid = Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_00c1);
const WS: Uuid = Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_00a1);

fn now_dt() -> OffsetDateTime {
    OffsetDateTime::from_unix_timestamp(NOW as i64).unwrap()
}

struct H {
    store: MemStore,
    stripe: Stripe<FakeStripe>,
    cfg: Config,
}

fn h() -> H {
    let store = MemStore::default();
    store.0.lock().unwrap().payers.insert(
        USER,
        Payer {
            workspace: WS,
            exempt: false,
        },
    );
    H {
        store,
        stripe: Stripe {
            transport: Arc::new(FakeStripe::default()),
        },
        cfg: Config {
            site_origin: "https://kubcode.dev".into(),
            allow_live: false,
        },
    }
}

impl H {
    fn fake(&self) -> &FakeStripe {
        &self.stripe.transport
    }
    async fn call(&mut self, path: &str, body: &str, nonce: &str) -> (u16, Value) {
        let mut st = self.store.clone();
        let mut svc = Service {
            store: &mut st,
            stripe: &self.stripe,
            cfg: &self.cfg,
            now: now_dt(),
        };
        let mut hm = HeaderMap::new();
        let ts = NOW.to_string();
        hm.insert("x-kubcode-timestamp", ts.parse().unwrap());
        hm.insert("x-kubcode-nonce", nonce.parse().unwrap());
        hm.insert(
            "x-kubcode-signature",
            oauth_connect::auth::sign(HMAC, path, &ts, nonce, body.as_bytes())
                .parse()
                .unwrap(),
        );
        let r = handle(
            &mut svc,
            HMAC,
            &[WHSEC.to_vec()],
            "POST",
            path,
            &hm,
            body.as_bytes(),
            NOW,
        )
        .await;
        (r.status, r.body)
    }
    async fn hook(&mut self, body: &[u8], header: Option<String>) -> (u16, Value) {
        let mut st = self.store.clone();
        let mut svc = Service {
            store: &mut st,
            stripe: &self.stripe,
            cfg: &self.cfg,
            now: now_dt(),
        };
        let mut hm = HeaderMap::new();
        if let Some(h) = header {
            hm.insert("stripe-signature", h.parse().unwrap());
        }
        let r = handle(
            &mut svc,
            HMAC,
            &[WHSEC.to_vec()],
            "POST",
            "/stripe/webhook",
            &hm,
            body,
            NOW,
        )
        .await;
        (r.status, r.body)
    }
    /// Creates a purchase through /api/checkout for 2 slots and returns it.
    async fn bought(&mut self) -> Purchase {
        // The recorded session is 2 × ฿289.
        let (s, b) = self
            .call(
                "/api/checkout",
                r#"{"user_id":"00000000-0000-4000-8000-0000000000c1","kind":"new","slots":2}"#,
                &nonce(1),
            )
            .await;
        assert_eq!((s, b["ok"].clone()), (200, Value::Bool(true)), "{b}");
        self.store
            .0
            .lock()
            .unwrap()
            .purchases
            .last()
            .cloned()
            .unwrap()
    }
    fn grants(&self) -> u32 {
        self.store.0.lock().unwrap().grants
    }
}

fn nonce(n: u8) -> String {
    format!("{:032x}", n)
}

fn signed_event(name: &str, purchase: Uuid) -> (Vec<u8>, String) {
    let mut v = fixture_json(name);
    v["data"]["object"]["metadata"]["purchase_id"] = Value::String(purchase.to_string());
    let body = serde_json::to_vec(&v).unwrap();
    let header = sign(WHSEC, NOW, &body);
    (body, header)
}

// ---------------- tests ----------------

#[test]
fn recorded_session_parses_with_card_and_promptpay_in_thb() {
    let s: billing_lambda::stripe::Session =
        serde_json::from_slice(&fixture("session_created.json")).unwrap();
    assert!(valid_session_id(&s.id));
    assert!(!s.livemode);
    assert_eq!(
        (s.amount_total, s.currency.as_deref()),
        (Some(57_800), Some("thb"))
    );
    assert_eq!(s.payment_method_types, vec!["card", "promptpay"]);
    assert_eq!(API_VERSION, "2026-10-28.endive");
}

#[tokio::test]
async fn checkout_sends_one_thb_line_adaptive_off_and_an_idempotency_key() {
    let mut h = h();
    let p = h.bought().await;
    assert_eq!(
        (p.kind, p.slots, p.amount, p.status),
        (Kind::New, 2, Satang(57_800), Status::Pending)
    );
    assert!(p.session_id.as_deref().is_some_and(valid_session_id));
    let reqs = h.fake().requests.lock().unwrap().clone();
    let req = &reqs[0];
    let f: HashMap<_, _> = req.form.iter().cloned().collect();
    assert_eq!(f["mode"], "payment");
    assert_eq!(f["currency"], "thb");
    assert_eq!(f["adaptive_pricing[enabled]"], "false");
    assert_eq!(f["line_items[0][quantity]"], "2");
    assert_eq!(f["line_items[0][price_data][unit_amount]"], "28900");
    assert_eq!(f["metadata[purchase_id]"], p.id.to_string());
    assert!(
        !f.contains_key("payment_method_types"),
        "methods come from the Dashboard"
    );
    assert!(f["success_url"].starts_with(
        "https://kubcode.dev/account/billing/success?session_id={CHECKOUT_SESSION_ID}"
    ));
    assert_eq!(
        req.idempotency_key.as_deref(),
        Some(format!("kubcode-purchase-{}", p.id).as_str())
    );
}

#[tokio::test]
async fn checkout_refuses_a_session_whose_total_differs_from_the_quote() {
    let mut h = h();
    // Recorded session is 2 slots; ask for 3.
    let (s, b) = h
        .call(
            "/api/checkout",
            r#"{"user_id":"00000000-0000-4000-8000-0000000000c1","kind":"new","slots":3}"#,
            &nonce(1),
        )
        .await;
    assert_eq!(
        (s, b["code"].as_str()),
        (200, Some("stripe_amount_mismatch"))
    );
    assert_eq!(
        h.store.0.lock().unwrap().purchases[0].status,
        Status::Failed
    );
}

#[tokio::test]
async fn stripe_outage_closes_the_purchase_and_answers_503() {
    let mut h = h();
    *h.fake().create.lock().unwrap() = Some((500, b"{}".to_vec()));
    let (s, _) = h
        .call(
            "/api/checkout",
            r#"{"user_id":"00000000-0000-4000-8000-0000000000c1","kind":"new","slots":2}"#,
            &nonce(1),
        )
        .await;
    assert_eq!(s, 503);
    assert_eq!(
        h.store.0.lock().unwrap().purchases[0].status,
        Status::Failed
    );
}

#[tokio::test]
async fn owner_workspace_cannot_buy_and_bad_input_is_refused() {
    let mut h = h();
    h.store.0.lock().unwrap().payers.insert(
        USER,
        Payer {
            workspace: WS,
            exempt: true,
        },
    );
    let (_, b) = h
        .call(
            "/api/checkout",
            r#"{"user_id":"00000000-0000-4000-8000-0000000000c1","kind":"new","slots":1}"#,
            &nonce(1),
        )
        .await;
    assert_eq!(b["code"], "exempt");
    for (i, body) in [
        r#"{"user_id":"00000000-0000-4000-8000-0000000000c1","kind":"renew","slots":1}"#,
        r#"{"user_id":"00000000-0000-4000-8000-0000000000c1","kind":"new","slots":1,"amount":1}"#,
        r#"{"user_id":"x","kind":"new","slots":1}"#,
    ]
    .iter()
    .enumerate()
    {
        let (s, _) = h.call("/api/checkout", body, &nonce(10 + i as u8)).await;
        assert_eq!(s, 400, "{body}");
    }
    assert!(h.fake().requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn api_calls_need_a_fresh_signature() {
    let mut h = h();
    let body = r#"{"user_id":"00000000-0000-4000-8000-0000000000c1"}"#;
    assert_eq!(h.call("/api/status", body, &nonce(1)).await.0, 200);
    assert_eq!(
        h.call("/api/status", body, &nonce(1)).await.0,
        401,
        "replayed nonce"
    );
    let mut st = h.store.clone();
    let mut svc = Service {
        store: &mut st,
        stripe: &h.stripe,
        cfg: &h.cfg,
        now: now_dt(),
    };
    let r = handle(
        &mut svc,
        HMAC,
        &[],
        "POST",
        "/api/status",
        &HeaderMap::new(),
        body.as_bytes(),
        NOW,
    )
    .await;
    assert_eq!(r.status, 401);
    let r = handle(
        &mut svc,
        HMAC,
        &[],
        "GET",
        "/api/status",
        &HeaderMap::new(),
        b"",
        NOW,
    )
    .await;
    assert_eq!(r.status, 405);
}

#[tokio::test]
async fn webhook_completed_grants_once_and_a_replay_grants_nothing() {
    let mut h = h();
    let p = h.bought().await;
    h.fake().serve_for("session_paid_card.json", p.id);
    let (body, sig) = signed_event("event_completed.json", p.id);
    assert_eq!(h.hook(&body, Some(sig.clone())).await.0, 200);
    assert_eq!(h.grants(), 1);
    assert_eq!(h.store.0.lock().unwrap().purchases[0].status, Status::Paid);
    assert_eq!(
        h.store.0.lock().unwrap().pi[&p.id],
        (Some("pi_3FixtureCardPaid0001".into()), Some("card".into()))
    );
    // Same event again (Stripe retry / `stripe events resend`).
    assert_eq!(h.hook(&body, Some(sig)).await.0, 200);
    assert_eq!(h.grants(), 1, "no double credit");
}

#[tokio::test]
async fn success_page_racing_the_webhook_grants_once() {
    let mut h = h();
    let p = h.bought().await;
    h.fake().serve_for("session_paid_promptpay.json", p.id);
    let sid = p.session_id.clone().unwrap();
    let (_, b) = h
        .call(
            "/api/fulfil",
            &format!(r#"{{"user_id":"{USER}","session_id":"{sid}"}}"#),
            &nonce(2),
        )
        .await;
    assert_eq!(b["result"], "granted");
    assert_eq!(b["entitlement"]["slots"], 2);
    assert_eq!(b["entitlement"]["standing"], "active");
    let (body, sig) = signed_event("event_completed.json", p.id);
    assert_eq!(h.hook(&body, Some(sig)).await.0, 200);
    let (_, b) = h
        .call(
            "/api/fulfil",
            &format!(r#"{{"user_id":"{USER}","session_id":"{sid}"}}"#),
            &nonce(3),
        )
        .await;
    assert_eq!(b["result"], "already_paid");
    assert_eq!(h.grants(), 1);
    assert_eq!(
        h.store.0.lock().unwrap().pi[&p.id].1.as_deref(),
        Some("promptpay")
    );
}

#[tokio::test]
async fn webhook_body_is_never_trusted_for_money() {
    let mut h = h();
    let p = h.bought().await;
    // Stripe (the source of truth) says unpaid, though the event body says paid.
    h.fake().serve_for("session_complete_unpaid.json", p.id);
    let (body, sig) = signed_event("event_completed.json", p.id);
    assert_eq!(h.hook(&body, Some(sig)).await.0, 200);
    assert_eq!(h.grants(), 0);
    assert_eq!(
        h.store.0.lock().unwrap().purchases[0].status,
        Status::Pending,
        "PromptPay not scanned yet: wait"
    );
}

#[tokio::test]
async fn wrong_amount_at_stripe_is_flagged_not_granted() {
    let mut h = h();
    let p = h.bought().await;
    let mut v = fixture_json("session_paid_card.json");
    v["metadata"]["purchase_id"] = Value::String(p.id.to_string());
    v["amount_total"] = Value::from(100);
    h.fake().sessions.lock().unwrap().insert(
        p.session_id.clone().unwrap(),
        (200, serde_json::to_vec(&v).unwrap()),
    );
    let (body, sig) = signed_event("event_completed.json", p.id);
    assert_eq!(h.hook(&body, Some(sig)).await.0, 200);
    assert_eq!(h.grants(), 0);
    assert_eq!(
        h.store.0.lock().unwrap().reviews,
        vec![(p.id, "amount_mismatch".into())]
    );
}

#[tokio::test]
async fn expired_and_async_failed_close_the_purchase() {
    let mut h = h();
    let p = h.bought().await;
    h.fake().serve_for("session_expired.json", p.id);
    let (body, sig) = signed_event("event_expired.json", p.id);
    assert_eq!(h.hook(&body, Some(sig)).await.0, 200);
    assert_eq!(
        h.store.0.lock().unwrap().purchases[0].status,
        Status::Expired
    );

    let mut h2 = self::h();
    let p2 = h2.bought().await;
    let (body, sig) = signed_event("event_async_failed.json", p2.id);
    assert_eq!(h2.hook(&body, Some(sig)).await.0, 200);
    assert_eq!(
        h2.store.0.lock().unwrap().purchases[0].status,
        Status::Failed
    );
}

#[tokio::test]
async fn a_payment_after_expiry_is_flagged_never_granted() {
    let mut h = h();
    let p = h.bought().await;
    h.fake().serve_for("session_expired.json", p.id);
    let (body, sig) = signed_event("event_expired.json", p.id);
    h.hook(&body, Some(sig)).await;
    h.fake().serve_for("session_paid_card.json", p.id);
    let (body, sig) = signed_event("event_async_succeeded.json", p.id);
    assert_eq!(h.hook(&body, Some(sig)).await.0, 200);
    assert_eq!(h.grants(), 0);
    assert_eq!(
        h.store.0.lock().unwrap().reviews.last().unwrap().1,
        "paid_after_close"
    );
}

#[tokio::test]
async fn webhook_signature_is_required_and_checked_on_the_raw_body() {
    let mut h = h();
    let p = h.bought().await;
    h.fake().serve_for("session_paid_card.json", p.id);
    let (body, sig) = signed_event("event_completed.json", p.id);
    assert_eq!(h.hook(&body, None).await.0, 400);
    // Same JSON re-serialized with different whitespace: the signature no longer matches.
    let pretty =
        serde_json::to_vec_pretty(&serde_json::from_slice::<Value>(&body).unwrap()).unwrap();
    assert_eq!(h.hook(&pretty, Some(sig.clone())).await.0, 400);
    // Wrong secret, stale timestamp.
    assert_eq!(
        h.hook(&body, Some(sign(b"whsec_other000000000000000", NOW, &body)))
            .await
            .0,
        400
    );
    assert_eq!(
        h.hook(
            &body,
            Some(sign(WHSEC, NOW - webhook::TOLERANCE_SECS - 1, &body))
        )
        .await
        .0,
        400
    );
    assert_eq!(h.grants(), 0);
    // Several v1 values (secret rotation): any match passes.
    let both = format!("{sig},v1={}", "0".repeat(64));
    assert_eq!(h.hook(&body, Some(both)).await.0, 200);
    assert_eq!(h.grants(), 1);
}

#[tokio::test]
async fn a_session_that_is_not_ours_changes_nothing() {
    let mut h = h();
    let p = h.bought().await;
    // Metadata names our purchase but the session id differs from the one we attached.
    let mut v = fixture_json("session_paid_card.json");
    v["id"] = Value::String("cs_test_someoneelse0001".into());
    v["metadata"]["purchase_id"] = Value::String(p.id.to_string());
    h.fake().sessions.lock().unwrap().insert(
        "cs_test_someoneelse0001".into(),
        (200, serde_json::to_vec(&v).unwrap()),
    );
    let mut ev = fixture_json("event_completed.json");
    ev["data"]["object"] = v;
    let body = serde_json::to_vec(&ev).unwrap();
    assert_eq!(h.hook(&body, Some(sign(WHSEC, NOW, &body))).await.0, 200);
    assert_eq!(h.grants(), 0);
    // Another member cannot fulfil this purchase from the success page.
    let other = Uuid::new_v4();
    h.store.0.lock().unwrap().payers.insert(
        other,
        Payer {
            workspace: Uuid::new_v4(),
            exempt: false,
        },
    );
    h.fake().serve_for("session_paid_card.json", p.id);
    let sid = p.session_id.unwrap();
    let (_, b) = h
        .call(
            "/api/fulfil",
            &format!(r#"{{"user_id":"{other}","session_id":"{sid}"}}"#),
            &nonce(9),
        )
        .await;
    assert_eq!(b["code"], "not_found");
    assert_eq!(h.grants(), 0);
}

#[tokio::test]
async fn live_events_are_ignored_in_test_mode() {
    let mut h = h();
    let p = h.bought().await;
    let mut v = fixture_json("event_completed.json");
    v["livemode"] = Value::Bool(true);
    v["data"]["object"]["metadata"]["purchase_id"] = Value::String(p.id.to_string());
    let body = serde_json::to_vec(&v).unwrap();
    assert_eq!(h.hook(&body, Some(sign(WHSEC, NOW, &body))).await.0, 200);
    assert_eq!(h.grants(), 0);
    assert!(
        h.fake()
            .requests
            .lock()
            .unwrap()
            .iter()
            .all(|r| r.method == "POST"),
        "no session read for a live event"
    );
}

#[tokio::test]
async fn a_stripe_outage_during_a_webhook_asks_for_a_retry_and_does_not_mark_the_event_seen() {
    let mut h = h();
    let p = h.bought().await;
    h.fake()
        .sessions
        .lock()
        .unwrap()
        .insert(p.session_id.clone().unwrap(), (503, b"{}".to_vec()));
    let (body, sig) = signed_event("event_completed.json", p.id);
    assert_eq!(h.hook(&body, Some(sig.clone())).await.0, 500);
    assert!(h.store.0.lock().unwrap().events.is_empty());
    h.fake().serve_for("session_paid_card.json", p.id);
    assert_eq!(h.hook(&body, Some(sig)).await.0, 200);
    assert_eq!(h.grants(), 1);
}

#[test]
fn every_fixture_event_parses_and_has_a_valid_id() {
    for f in [
        "event_completed.json",
        "event_expired.json",
        "event_async_failed.json",
        "event_async_succeeded.json",
    ] {
        let e: Event = serde_json::from_slice(&fixture(f)).unwrap();
        assert!(webhook::valid_event_id(&e.id), "{f}");
        assert!(!e.livemode);
    }
}

#[tokio::test]
async fn sweep_is_signed_and_takes_only_an_empty_body() {
    let mut h = h();
    let (s, b) = h.call("/api/sweep", "{}", &nonce(40)).await;
    assert_eq!(
        (s, b["ok"].clone(), b["workspaces"].clone()),
        (200, Value::Bool(true), Value::from(1))
    );
    assert_eq!(h.call("/api/sweep", r#"{"x":1}"#, &nonce(41)).await.0, 400);
}

#[test]
fn the_method_used_comes_from_the_charge_not_the_allowed_list() {
    use billing_lambda::stripe::{payment_method, Session};
    // Recorded shape (2026-11-13 local E2E): the intent allows card and
    // promptpay; only the charge says which one paid.
    let card: Session = serde_json::from_slice(&fixture("session_paid_card.json")).unwrap();
    let pp: Session = serde_json::from_slice(&fixture("session_paid_promptpay.json")).unwrap();
    assert_eq!(payment_method(&card), Some("card"));
    assert_eq!(payment_method(&pp), Some("promptpay"));
    let mut v = fixture_json("session_paid_card.json");
    v["payment_intent"]["latest_charge"] = Value::String("ch_notexpanded".into());
    let s: Session = serde_json::from_value(v).unwrap();
    assert_eq!(payment_method(&s), None);
}

// ---------------- refunds and disputes (recorded TEST-mode events) ----------------

/// A recorded charge/dispute event, re-pointed at our purchase's payment intent.
fn charge_event(name: &str, pi: &str) -> (Vec<u8>, String) {
    let mut v = fixture_json(name);
    v["data"]["object"]["payment_intent"] = Value::String(pi.into());
    let body = serde_json::to_vec(&v).unwrap();
    let header = sign(WHSEC, NOW, &body);
    (body, header)
}

async fn paid_purchase(h: &mut H) -> (Purchase, String) {
    let p = h.bought().await;
    h.fake().serve_for("session_paid_card.json", p.id);
    let (body, sig) = signed_event("event_completed.json", p.id);
    assert_eq!(h.hook(&body, Some(sig)).await.0, 200);
    let pi = h.store.0.lock().unwrap().pi[&p.id].0.clone().unwrap();
    (p, pi)
}

#[test]
fn recorded_refund_and_dispute_events_have_what_we_read() {
    for (f, kind) in [
        ("event_charge_refunded_partial.json", "charge.refunded"),
        ("event_charge_refunded_full.json", "charge.refunded"),
        ("event_dispute_created.json", "charge.dispute.created"),
        ("event_dispute_closed_lost.json", "charge.dispute.closed"),
    ] {
        let e: Event = serde_json::from_slice(&fixture(f)).unwrap();
        assert_eq!(e.kind, kind, "{f}");
        assert!(!e.livemode);
        assert!(
            e.data.object["payment_intent"]
                .as_str()
                .unwrap()
                .starts_with("pi_"),
            "{f}"
        );
        assert_eq!(e.data.object["currency"], "thb");
    }
    let full = fixture_json("event_charge_refunded_full.json");
    assert_eq!(
        full["data"]["object"]["amount_refunded"],
        full["data"]["object"]["amount"]
    );
    assert_eq!(
        fixture_json("event_dispute_closed_lost.json")["data"]["object"]["status"],
        "lost"
    );
}

#[tokio::test]
async fn a_full_refund_revokes_once_even_when_redelivered() {
    let mut h = h();
    let (p, pi) = paid_purchase(&mut h).await;
    // Partial first (recorded, access unchanged). The recorded charge was ฿578.
    let (b, s) = charge_event("event_charge_refunded_partial.json", &pi);
    assert_eq!(h.hook(&b, Some(s)).await.0, 200);
    assert_eq!(
        h.store.0.lock().unwrap().after[&p.id],
        (10_000, None, false)
    );
    // Then full: revoked.
    let (b, s) = charge_event("event_charge_refunded_full.json", &pi);
    assert_eq!(h.hook(&b, Some(s.clone())).await.0, 200);
    assert_eq!(h.store.0.lock().unwrap().after[&p.id], (57_800, None, true));
    // Same event again (dedupe) and an older partial arriving late: nothing more.
    assert_eq!(h.hook(&b, Some(s)).await.0, 200);
    let mut late = fixture_json("event_charge_refunded_partial.json");
    late["id"] = Value::String("evt_1LatePartialRefund0001".into());
    late["data"]["object"]["payment_intent"] = Value::String(pi.clone());
    let lb = serde_json::to_vec(&late).unwrap();
    assert_eq!(h.hook(&lb, Some(sign(WHSEC, NOW, &lb))).await.0, 200);
    let m = h.store.0.lock().unwrap();
    assert_eq!((m.revokes, m.after[&p.id]), (1, (57_800, None, true)));
}

#[tokio::test]
async fn a_dispute_flags_then_lost_revokes() {
    let mut h = h();
    let (p, pi) = paid_purchase(&mut h).await;
    let (b, s) = charge_event("event_dispute_created.json", &pi);
    assert_eq!(h.hook(&b, Some(s)).await.0, 200);
    {
        let m = h.store.0.lock().unwrap();
        assert_eq!(m.reviews, vec![(p.id, "dispute_open".to_owned())]);
        assert!(!m.after[&p.id].2, "opened: access unchanged");
    }
    let (b, s) = charge_event("event_dispute_closed_lost.json", &pi);
    assert_eq!(h.hook(&b, Some(s)).await.0, 200);
    let m = h.store.0.lock().unwrap();
    assert!(m.after[&p.id].2);
    assert_eq!(m.revokes, 1);
    assert!(m.reviews.is_empty(), "final outcome clears the open flag");
}

#[tokio::test]
async fn a_won_dispute_clears_the_flag_and_keeps_access() {
    let mut h = h();
    let (p, pi) = paid_purchase(&mut h).await;
    let (b, s) = charge_event("event_dispute_created.json", &pi);
    h.hook(&b, Some(s)).await;
    let mut won = fixture_json("event_dispute_closed_lost.json");
    won["id"] = Value::String("evt_1DisputeWonFixture0001".into());
    won["data"]["object"]["status"] = Value::String("won".into());
    won["data"]["object"]["payment_intent"] = Value::String(pi);
    let wb = serde_json::to_vec(&won).unwrap();
    assert_eq!(h.hook(&wb, Some(sign(WHSEC, NOW, &wb))).await.0, 200);
    let m = h.store.0.lock().unwrap();
    assert!(m.reviews.is_empty());
    assert_eq!(
        m.after[&p.id],
        (0, Some(kubcode_billing::refund::Dispute::Won), false)
    );
    assert_eq!(m.revokes, 0);
}

#[tokio::test]
async fn charge_events_that_are_not_ours_or_not_thb_change_nothing() {
    let mut h = h();
    let (p, _pi) = paid_purchase(&mut h).await;
    // A refund of some other charge (the recorded event as is).
    let b = fixture("event_charge_refunded_full.json");
    assert_eq!(h.hook(&b, Some(sign(WHSEC, NOW, &b))).await.0, 200);
    // Wrong currency.
    let mut usd = fixture_json("event_charge_refunded_full.json");
    usd["id"] = Value::String("evt_1UsdRefundFixture00001".into());
    usd["data"]["object"]["currency"] = Value::String("usd".into());
    let ub = serde_json::to_vec(&usd).unwrap();
    assert_eq!(h.hook(&ub, Some(sign(WHSEC, NOW, &ub))).await.0, 200);
    // Unsigned: refused before anything.
    let (b, _) = charge_event("event_charge_refunded_full.json", "pi_whatever1");
    assert_eq!(h.hook(&b, None).await.0, 400);
    let m = h.store.0.lock().unwrap();
    assert!(!m.after.contains_key(&p.id));
    assert_eq!(m.revokes, 0);
}
