//! Billing operations (ADR 0008 §4): start a Checkout, fulfil from the
//! webhook or the success page, close failed/expired purchases. Stripe is the
//! only source of truth for "paid"; the browser sends only a session id.

use async_trait::async_trait;
use kubcode_billing::entitlement::{Entitlement, Standing};
use kubcode_billing::money::Satang;
use kubcode_billing::money::PRICE_PER_CHANNEL;
use kubcode_billing::purchase::{decide, on_async_failed, Fulfil, Mismatch, SessionFacts, Status};
use kubcode_billing::quote::{add_slots, month_pass, Kind, Quote, QuoteError};
use kubcode_billing::refund::Dispute;
use kubcode_billing_store::{
    AfterOutcome, AfterPayment, Fulfilled, Payer, Purchase, Store, StoreError,
};
use serde_json::{json, Value};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::stripe::{payment_method, NewSession, Session, Stripe, StripeError, Transport};
use crate::webhook::Event;

/// The store as the service needs it (the Postgres store in production, an
/// in-memory one in tests).
#[async_trait]
pub trait BillingStore: Send {
    async fn payer(&self, user: Uuid) -> Result<Option<Payer>, StoreError>;
    async fn entitlement(
        &self,
        ws: Uuid,
        exempt: bool,
        now: OffsetDateTime,
    ) -> Result<Entitlement, StoreError>;
    async fn create_purchase(&self, ws: Uuid, user: Uuid, q: &Quote) -> Result<Uuid, StoreError>;
    async fn attach_session(&self, purchase: Uuid, session: &str) -> Result<(), StoreError>;
    async fn abandon(&self, purchase: Uuid) -> Result<(), StoreError>;
    async fn purchase(&self, id: Uuid) -> Result<Option<Purchase>, StoreError>;
    async fn record_event(&self, id: &str, kind: &str, livemode: bool) -> Result<bool, StoreError>;
    async fn fulfil(
        &mut self,
        purchase: Uuid,
        pi: Option<&str>,
        method: Option<&str>,
        exempt: bool,
        now: OffsetDateTime,
    ) -> Result<Fulfilled, StoreError>;
    async fn close(&self, purchase: Uuid, to: Status) -> Result<bool, StoreError>;
    async fn flag_review(&self, purchase: Uuid, code: &str) -> Result<(), StoreError>;
    async fn workspace_exempt(&self, ws: Uuid) -> Result<bool, StoreError>;
    async fn event_seen(&self, id: &str) -> Result<bool, StoreError>;
    /// A refund or dispute on the paid purchase with this payment intent.
    async fn after_payment(
        &mut self,
        payment_intent: &str,
        ev: AfterPayment,
        now: OffsetDateTime,
    ) -> Result<AfterOutcome, StoreError>;
    /// The daily sweep: (workspaces, paused, resumed, disconnect_due).
    async fn sweep(
        &mut self,
        now: OffsetDateTime,
    ) -> Result<(usize, usize, usize, usize), StoreError>;
}

#[async_trait]
impl BillingStore for Store {
    async fn payer(&self, user: Uuid) -> Result<Option<Payer>, StoreError> {
        Store::payer(self, user).await
    }
    async fn entitlement(
        &self,
        ws: Uuid,
        exempt: bool,
        now: OffsetDateTime,
    ) -> Result<Entitlement, StoreError> {
        Store::entitlement(self, ws, exempt, now).await
    }
    async fn create_purchase(&self, ws: Uuid, user: Uuid, q: &Quote) -> Result<Uuid, StoreError> {
        Store::create_purchase(self, ws, user, q).await
    }
    async fn attach_session(&self, purchase: Uuid, session: &str) -> Result<(), StoreError> {
        Store::attach_session(self, purchase, session).await
    }
    async fn abandon(&self, purchase: Uuid) -> Result<(), StoreError> {
        Store::abandon(self, purchase).await
    }
    async fn purchase(&self, id: Uuid) -> Result<Option<Purchase>, StoreError> {
        Store::purchase(self, id).await
    }
    async fn record_event(&self, id: &str, kind: &str, livemode: bool) -> Result<bool, StoreError> {
        Store::record_event(self, id, kind, livemode).await
    }
    async fn fulfil(
        &mut self,
        purchase: Uuid,
        pi: Option<&str>,
        method: Option<&str>,
        exempt: bool,
        now: OffsetDateTime,
    ) -> Result<Fulfilled, StoreError> {
        Store::fulfil(self, purchase, pi, method, exempt, now).await
    }
    async fn close(&self, purchase: Uuid, to: Status) -> Result<bool, StoreError> {
        Store::close(self, purchase, to).await
    }
    async fn flag_review(&self, purchase: Uuid, code: &str) -> Result<(), StoreError> {
        Store::flag_review(self, purchase, code).await
    }
    async fn workspace_exempt(&self, ws: Uuid) -> Result<bool, StoreError> {
        Store::workspace_exempt(self, ws).await
    }
    async fn event_seen(&self, id: &str) -> Result<bool, StoreError> {
        Store::event_seen(self, id).await
    }
    async fn after_payment(
        &mut self,
        payment_intent: &str,
        ev: AfterPayment,
        now: OffsetDateTime,
    ) -> Result<AfterOutcome, StoreError> {
        Store::after_payment(self, payment_intent, ev, now).await
    }
    async fn sweep(
        &mut self,
        now: OffsetDateTime,
    ) -> Result<(usize, usize, usize, usize), StoreError> {
        let mut out = (0, 0, 0, 0);
        for ws in self.sweep_workspaces().await? {
            let o = self.sweep_workspace(ws, now).await?;
            out.0 += 1;
            out.1 += o.paused;
            out.2 += o.resumed;
            out.3 += o.disconnect_due;
        }
        Ok(out)
    }
}

pub struct Config {
    /// e.g. https://kubcode.dev
    pub site_origin: String,
    /// Test mode only until the owner goes live: a live key or a live event is refused.
    pub allow_live: bool,
}

pub struct Service<'a, S: BillingStore, T: Transport + ?Sized> {
    pub store: &'a mut S,
    pub stripe: &'a Stripe<T>,
    pub cfg: &'a Config,
    pub now: OffsetDateTime,
}

/// A refused step: a fixed code the web host maps to Thai copy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refusal(pub &'static str);

impl From<StoreError> for Refusal {
    fn from(_: StoreError) -> Self {
        Refusal("store_unavailable")
    }
}

fn quote_code(e: QuoteError) -> &'static str {
    match e {
        QuoteError::BadSlots => "bad_slots",
        QuoteError::Exempt => "exempt",
        QuoteError::NoActivePass => "no_active_pass",
        QuoteError::TooLateToAdd => "too_late_to_add",
    }
}

pub fn entitlement_json(e: &Entitlement) -> Value {
    let fmt = |t: Option<OffsetDateTime>| {
        t.and_then(|t| {
            t.format(&time::format_description::well_known::Rfc3339)
                .ok()
        })
    };
    json!({
        "slots": if e.exempt { Value::Null } else { json!(e.slots) },
        "standing": match e.standing { Standing::None => "none", Standing::Active => "active", Standing::Grace => "grace", Standing::Lapsed => "lapsed" },
        "exempt": e.exempt,
        "period_start": fmt(e.period_start),
        "paid_until": fmt(e.paid_until),
        "grace_until": fmt(e.grace_until()),
    })
}

/// Outcome of applying a session to a purchase (logged as a code).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Applied {
    Granted,
    AlreadyPaid,
    Waiting,
    Closed,
    Refused,
    Stale,
    Unknown,
}

impl Applied {
    pub fn code(self) -> &'static str {
        match self {
            Applied::Granted => "granted",
            Applied::AlreadyPaid => "already_paid",
            Applied::Waiting => "waiting",
            Applied::Closed => "closed",
            Applied::Refused => "refused",
            Applied::Stale => "stale",
            Applied::Unknown => "unknown_purchase",
        }
    }
}

impl<S: BillingStore, T: Transport + ?Sized> Service<'_, S, T> {
    /// What the member has now and what N slots would cost (for /account/billing).
    pub async fn status(&self, user: Uuid) -> Result<Value, Refusal> {
        let payer = self
            .store
            .payer(user)
            .await?
            .ok_or(Refusal("no_workspace"))?;
        let ent = self
            .store
            .entitlement(payer.workspace, payer.exempt, self.now)
            .await?;
        Ok(
            json!({"ok": true, "entitlement": entitlement_json(&ent), "price_per_channel_satang": PRICE_PER_CHANNEL.0}),
        )
    }

    /// Creates a pending purchase and its Checkout Session; returns the URL.
    pub async fn checkout(
        &mut self,
        user: Uuid,
        kind: Kind,
        slots: u32,
        email: Option<&str>,
    ) -> Result<Value, Refusal> {
        let payer = self
            .store
            .payer(user)
            .await?
            .ok_or(Refusal("no_workspace"))?;
        let ent = self
            .store
            .entitlement(payer.workspace, payer.exempt, self.now)
            .await?;
        let q = match kind {
            Kind::Add => add_slots(&ent, slots, self.now),
            Kind::New | Kind::Renew => month_pass(&ent, slots, self.now),
        }
        .map_err(|e| Refusal(quote_code(e)))?;
        let purchase = self
            .store
            .create_purchase(payer.workspace, user, &q)
            .await?;
        // One line item whose total is the quoted amount: N × 289 for a pass,
        // or a prorated add as one line of quantity 1.
        let (quantity, unit) = if q.kind == Kind::Add {
            (1, q.amount.0)
        } else {
            (q.slots, PRICE_PER_CHANNEL.0)
        };
        let name = match q.kind {
            Kind::Add => format!("kubcode Social — เพิ่ม {} ช่อง ถึงวันหมดอายุเดิม", q.slots),
            _ => "kubcode Social — 1 ช่อง 1 เดือน".to_string(),
        };
        let success = format!(
            "{}/account/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            self.cfg.site_origin
        );
        let cancel = format!("{}/account/billing/cancel", self.cfg.site_origin);
        let created = self
            .stripe
            .create_session(&NewSession {
                purchase_id: purchase,
                workspace_id: payer.workspace,
                quantity,
                unit_amount: unit,
                product_name: &name,
                success_url: &success,
                cancel_url: &cancel,
                customer_email: email,
                expires_at: (self.now + Duration::hours(24) - Duration::minutes(5))
                    .unix_timestamp(),
            })
            .await;
        let session = match created {
            Ok(s) => s,
            Err(e) => {
                let _ = self.store.abandon(purchase).await;
                return Err(Refusal(if e == StripeError::Temporary {
                    "stripe_unavailable"
                } else {
                    "stripe_rejected"
                }));
            }
        };
        if session.livemode && !self.cfg.allow_live {
            let _ = self.store.abandon(purchase).await;
            return Err(Refusal("live_mode_refused"));
        }
        if session.amount_total != Some(q.amount.0) || session.currency.as_deref() != Some("thb") {
            let _ = self.store.abandon(purchase).await;
            return Err(Refusal("stripe_amount_mismatch"));
        }
        let Some(url) = session.url.clone() else {
            let _ = self.store.abandon(purchase).await;
            return Err(Refusal("stripe_rejected"));
        };
        self.store.attach_session(purchase, &session.id).await?;
        Ok(
            json!({"ok": true, "url": url, "purchase_id": purchase, "amount_satang": q.amount.0, "kind": q.kind.as_str(), "slots": q.slots}),
        )
    }

    /// Applies what Stripe says about a session to the purchase named in its metadata.
    pub async fn apply_session(&mut self, s: &Session) -> Result<Applied, Refusal> {
        let Some(pid) = s.purchase_id() else {
            return Ok(Applied::Unknown);
        };
        let Some(p) = self.store.purchase(pid).await? else {
            return Ok(Applied::Unknown);
        };
        // The session must be the one we attached (metadata alone is not proof).
        if p.session_id.as_deref() != Some(s.id.as_str()) {
            return Ok(Applied::Unknown);
        }
        let facts = SessionFacts {
            payment_status: &s.payment_status,
            status: s.status.as_deref().unwrap_or(""),
            amount_total: s.amount_total,
            currency: s.currency.as_deref(),
        };
        Ok(match decide(p.status, p.amount, &facts) {
            Fulfil::MarkPaid => {
                let exempt = self.store.workspace_exempt(p.workspace).await?;
                match self
                    .store
                    .fulfil(
                        p.id,
                        s.payment_intent_id(),
                        payment_method(s),
                        exempt,
                        self.now,
                    )
                    .await?
                {
                    Fulfilled::Granted(_) => Applied::Granted,
                    Fulfilled::AlreadyPaid => Applied::AlreadyPaid,
                }
            }
            Fulfil::AlreadyPaid => Applied::AlreadyPaid,
            Fulfil::Wait => Applied::Waiting,
            Fulfil::Close(to) => {
                self.store.close(p.id, to).await?;
                Applied::Closed
            }
            Fulfil::Refuse(m) => {
                self.store
                    .flag_review(
                        p.id,
                        match m {
                            Mismatch::Amount => "amount_mismatch",
                            Mismatch::Currency => "currency_mismatch",
                        },
                    )
                    .await?;
                Applied::Refused
            }
            Fulfil::Stale => {
                self.store.flag_review(p.id, "paid_after_close").await?;
                Applied::Stale
            }
        })
    }

    /// Grace → pause, renewal → resume, for every workspace that has paid.
    /// Disconnecting from Zernio is the publishing Lambda's half.
    pub async fn sweep(&mut self) -> Result<Value, Refusal> {
        let (ws, paused, resumed, due) = self.store.sweep(self.now).await?;
        Ok(
            json!({"ok": true, "workspaces": ws, "paused": paused, "resumed": resumed, "disconnect_due": due}),
        )
    }

    /// The success page: the browser sends a session id; we ask Stripe.
    /// Only the member who owns the purchase gets an answer.
    pub async fn fulfil_from_page(
        &mut self,
        user: Uuid,
        session_id: &str,
    ) -> Result<Value, Refusal> {
        let payer = self
            .store
            .payer(user)
            .await?
            .ok_or(Refusal("no_workspace"))?;
        let s = self
            .stripe
            .retrieve_session(session_id)
            .await
            .map_err(|e| {
                Refusal(if e == StripeError::Temporary {
                    "stripe_unavailable"
                } else {
                    "not_found"
                })
            })?;
        if s.livemode && !self.cfg.allow_live {
            return Err(Refusal("live_mode_refused"));
        }
        let Some(p) = (match s.purchase_id() {
            Some(id) => self.store.purchase(id).await?,
            None => None,
        }) else {
            return Err(Refusal("not_found"));
        };
        if p.workspace != payer.workspace {
            return Err(Refusal("not_found"));
        }
        let applied = self.apply_session(&s).await?;
        let ent = self
            .store
            .entitlement(payer.workspace, payer.exempt, self.now)
            .await?;
        Ok(json!({"ok": true, "result": applied.code(), "entitlement": entitlement_json(&ent)}))
    }

    /// A verified webhook event. Returns the outcome code; `Err` means "ask
    /// Stripe to retry" (the event id is recorded only after success, so a
    /// retry is not mistaken for a duplicate).
    pub async fn webhook(&mut self, ev: &Event) -> Result<&'static str, Refusal> {
        if ev.livemode && !self.cfg.allow_live {
            return Ok("live_ignored");
        }
        // Seen and processed before: answer 200. Two concurrent deliveries of
        // one event both get past this check; fulfilment is idempotent and
        // the record below is ON CONFLICT DO NOTHING, so that is harmless.
        if self.store.event_seen(&ev.id).await? {
            return Ok("duplicate");
        }
        let code = match ev.kind.as_str() {
            "checkout.session.completed"
            | "checkout.session.async_payment_succeeded"
            | "checkout.session.expired" => {
                // Never trust the event body for money: re-read the session.
                let id = ev
                    .data
                    .object
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let s = self.stripe.retrieve_session(id).await.map_err(|e| {
                    Refusal(if e == StripeError::Temporary {
                        "stripe_unavailable"
                    } else {
                        "stripe_rejected"
                    })
                })?;
                self.apply_session(&s).await?.code()
            }
            "checkout.session.async_payment_failed" => {
                let pid = ev
                    .data
                    .object
                    .get("metadata")
                    .and_then(|m| m.get("purchase_id"))
                    .and_then(Value::as_str)
                    .and_then(|s| s.parse::<Uuid>().ok());
                match pid {
                    Some(pid) => match self.store.purchase(pid).await? {
                        Some(p)
                            if p.session_id.as_deref()
                                == ev.data.object.get("id").and_then(Value::as_str) =>
                        {
                            if let Fulfil::Close(to) = on_async_failed(p.status) {
                                self.store.close(p.id, to).await?;
                            }
                            "closed"
                        }
                        _ => "unknown_purchase",
                    },
                    None => "unknown_purchase",
                }
            }
            // Refunds and disputes (ADR 0008 amendment 2026-11-14). The event is
            // authenticated by its signature; its body is used as is (re-reading
            // a dispute would need a Disputes permission the live key lacks).
            // Ordering and replays are safe: the refunded total only grows and
            // a final dispute outcome is never reopened.
            "charge.refunded" => {
                let o = &ev.data.object;
                match (
                    payment_intent_of(o),
                    o.get("amount_refunded").and_then(Value::as_i64),
                    o.get("currency").and_then(Value::as_str),
                ) {
                    (Some(pi), Some(total), Some("thb")) if total >= 0 => after_code(
                        self.store
                            .after_payment(pi, AfterPayment::Refunded(Satang(total)), self.now)
                            .await?,
                    ),
                    (Some(_), Some(_), Some(_)) => "refused",
                    _ => "malformed",
                }
            }
            "charge.dispute.created" | "charge.dispute.closed" => {
                let o = &ev.data.object;
                let outcome = if ev.kind == "charge.dispute.created" {
                    Some(Dispute::Open)
                } else {
                    o.get("status")
                        .and_then(Value::as_str)
                        .and_then(Dispute::from_closed_status)
                };
                match (payment_intent_of(o), outcome) {
                    (Some(pi), Some(d)) => after_code(
                        self.store
                            .after_payment(pi, AfterPayment::Dispute(d), self.now)
                            .await?,
                    ),
                    (Some(_), None) => "ignored",
                    _ => "malformed",
                }
            }
            _ => "ignored",
        };
        self.store
            .record_event(&ev.id, &ev.kind, ev.livemode)
            .await?;
        Ok(code)
    }
}

/// The payment intent id on a charge or dispute object (string, or expanded).
fn payment_intent_of(o: &Value) -> Option<&str> {
    let v = o.get("payment_intent")?;
    let id = v.as_str().or_else(|| v.get("id").and_then(Value::as_str))?;
    let ok = id.strip_prefix("pi_").is_some_and(|r| {
        (1..=200).contains(&r.len()) && r.bytes().all(|b| b.is_ascii_alphanumeric())
    });
    ok.then_some(id)
}

fn after_code(o: AfterOutcome) -> &'static str {
    match o {
        AfterOutcome::Unknown => "unknown_purchase",
        AfterOutcome::Unchanged => "unchanged",
        AfterOutcome::Recorded => "recorded",
        AfterOutcome::Revoked { .. } => "revoked",
    }
}
