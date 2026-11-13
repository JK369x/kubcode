//! Postgres store for billing (migration 0013, ADR 0008). Runs as the
//! `kubcode_billing` role. Every money-changing step is one transaction:
//! fulfilment moves a purchase `pending → paid` with `WHERE status = 'pending'`
//! and rewrites the workspace's entitlement row in the same transaction, so a
//! replayed webhook or a racing success page cannot grant twice.

use kubcode_billing::entitlement::{entitlement, Entitlement, PaidSpan};
use kubcode_billing::money::Satang;
use kubcode_billing::purchase::Status;
use kubcode_billing::quote::{Kind, Quote};
use time::OffsetDateTime;
use tokio_postgres::{Client, GenericClient};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("database error")]
    Db(#[from] tokio_postgres::Error),
    #[error("unexpected stored value")]
    Corrupt,
    #[error("not found")]
    NotFound,
}

pub type Result<T> = std::result::Result<T, StoreError>;

/// A purchase as stored. Stripe ids are only ever read here and in the Lambda.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Purchase {
    pub id: Uuid,
    pub workspace: Uuid,
    pub kind: Kind,
    pub slots: u32,
    pub amount: Satang,
    pub period_start: OffsetDateTime,
    pub period_end: OffsetDateTime,
    pub status: Status,
    pub session_id: Option<String>,
}

/// The member who asked to pay, resolved from the session the web host signed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Payer {
    pub workspace: Uuid,
    /// The owner's own workspace never pays (ADR 0008 §9).
    pub exempt: bool,
}

/// What a successful fulfilment changed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Fulfilled {
    /// This call moved the purchase to paid and rebuilt the entitlement.
    Granted(Entitlement),
    /// Someone already did (replay, race): nothing changed.
    AlreadyPaid,
}

const PURCHASE_COLS: &str = "id, workspace_id, kind, slots, amount_satang, period_start, period_end, status, stripe_checkout_session_id";

fn purchase_from(r: &tokio_postgres::Row) -> Result<Purchase> {
    let kind: String = r.get(2);
    let status: String = r.get(7);
    let slots: i32 = r.get(3);
    Ok(Purchase {
        id: r.get(0),
        workspace: r.get(1),
        kind: Kind::parse(&kind).ok_or(StoreError::Corrupt)?,
        slots: u32::try_from(slots).map_err(|_| StoreError::Corrupt)?,
        amount: Satang(r.get(4)),
        period_start: r.get(5),
        period_end: r.get(6),
        status: Status::parse(&status).ok_or(StoreError::Corrupt)?,
        session_id: r.get(8),
    })
}

/// Paid spans of a workspace (the entitlement's only input).
async fn paid_spans<C: GenericClient>(c: &C, workspace: Uuid) -> Result<Vec<PaidSpan>> {
    let rows = c
        .query(
            "SELECT slots, period_start, period_end FROM kubcode_accounts.billing_purchases
              WHERE workspace_id = $1 AND status = 'paid' ORDER BY period_start",
            &[&workspace],
        )
        .await?;
    rows.iter()
        .map(|r| {
            let slots: i32 = r.get(0);
            Ok(PaidSpan {
                slots: u32::try_from(slots).map_err(|_| StoreError::Corrupt)?,
                period_start: r.get(1),
                period_end: r.get(2),
            })
        })
        .collect()
}

pub struct Store {
    c: Client,
}

impl Store {
    pub fn new(c: Client) -> Self {
        Store { c }
    }

    /// The member's owned workspace (one per creator) and whether it is the
    /// owner's exempt workspace. `None` when the user has no active workspace.
    pub async fn payer(&self, user: Uuid) -> Result<Option<Payer>> {
        let row = self
            .c
            .query_opt(
                "SELECT m.workspace_id, u.is_owner FROM kubcode_accounts.workspace_members m
                   JOIN kubcode_accounts.users u ON u.id = m.user_id
                  WHERE m.user_id = $1 AND m.role = 'owner' AND u.status = 'active'",
                &[&user],
            )
            .await?;
        Ok(row.map(|r| Payer {
            workspace: r.get(0),
            exempt: r.get(1),
        }))
    }

    /// The workspace's entitlement at `now`, computed from paid purchases.
    pub async fn entitlement(
        &self,
        workspace: Uuid,
        exempt: bool,
        now: OffsetDateTime,
    ) -> Result<Entitlement> {
        Ok(entitlement(
            &paid_spans(&self.c, workspace).await?,
            now,
            exempt,
        ))
    }

    /// Stores a pending purchase for a quote; returns its id (also the Stripe
    /// Idempotency-Key and the session's metadata.purchase_id).
    pub async fn create_purchase(&self, workspace: Uuid, user: Uuid, q: &Quote) -> Result<Uuid> {
        let slots = i32::try_from(q.slots).map_err(|_| StoreError::Corrupt)?;
        let row = self
            .c
            .query_one(
                "INSERT INTO kubcode_accounts.billing_purchases
                   (workspace_id, user_id, kind, slots, amount_satang, period_start, period_end)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
                &[
                    &workspace,
                    &user,
                    &q.kind.as_str(),
                    &slots,
                    &q.amount.0,
                    &q.period_start,
                    &q.period_end,
                ],
            )
            .await?;
        Ok(row.get(0))
    }

    /// Records the Checkout Session created for a pending purchase.
    pub async fn attach_session(&self, purchase: Uuid, session_id: &str) -> Result<()> {
        let n = self
            .c
            .execute(
                "UPDATE kubcode_accounts.billing_purchases SET stripe_checkout_session_id = $2
                  WHERE id = $1 AND status = 'pending' AND stripe_checkout_session_id IS NULL",
                &[&purchase, &session_id],
            )
            .await?;
        if n == 1 {
            Ok(())
        } else {
            Err(StoreError::NotFound)
        }
    }

    /// A Checkout that could not be created: close the purchase.
    pub async fn abandon(&self, purchase: Uuid) -> Result<()> {
        self.c
            .execute(
                "UPDATE kubcode_accounts.billing_purchases SET status = 'failed', closed_at = now()
                  WHERE id = $1 AND status = 'pending'",
                &[&purchase],
            )
            .await?;
        Ok(())
    }

    pub async fn purchase(&self, id: Uuid) -> Result<Option<Purchase>> {
        let row = self
            .c
            .query_opt(
                &format!(
                    "SELECT {PURCHASE_COLS} FROM kubcode_accounts.billing_purchases WHERE id = $1"
                ),
                &[&id],
            )
            .await?;
        row.as_ref().map(purchase_from).transpose()
    }

    pub async fn purchase_by_session(&self, session_id: &str) -> Result<Option<Purchase>> {
        let row = self
            .c
            .query_opt(
                &format!("SELECT {PURCHASE_COLS} FROM kubcode_accounts.billing_purchases WHERE stripe_checkout_session_id = $1"),
                &[&session_id],
            )
            .await?;
        row.as_ref().map(purchase_from).transpose()
    }

    /// Whether the workspace's owner is the site owner (exempt from billing).
    pub async fn workspace_exempt(&self, workspace: Uuid) -> Result<bool> {
        let row = self
            .c
            .query_opt(
                "SELECT bool_or(u.is_owner) FROM kubcode_accounts.workspace_members m
                   JOIN kubcode_accounts.users u ON u.id = m.user_id
                  WHERE m.workspace_id = $1 AND m.role = 'owner'",
                &[&workspace],
            )
            .await?;
        Ok(row
            .and_then(|r| r.get::<_, Option<bool>>(0))
            .unwrap_or(false))
    }

    pub async fn event_seen(&self, event_id: &str) -> Result<bool> {
        Ok(self
            .c
            .query_opt(
                "SELECT 1 FROM kubcode_accounts.stripe_events WHERE event_id = $1",
                &[&event_id],
            )
            .await?
            .is_some())
    }

    /// Replay guard for HMAC requests from the web host: true when new.
    /// Prunes nonces older than the signature window first.
    pub async fn use_nonce(&self, nonce_hash: &[u8; 32]) -> Result<bool> {
        self.c
            .execute(
                "DELETE FROM kubcode_accounts.billing_request_nonces WHERE created_at < now() - interval '20 minutes'",
                &[],
            )
            .await?;
        let n = self
            .c
            .execute(
                "INSERT INTO kubcode_accounts.billing_request_nonces (nonce_hash) VALUES ($1) ON CONFLICT DO NOTHING",
                &[&nonce_hash.as_slice()],
            )
            .await?;
        Ok(n == 1)
    }

    /// Webhook dedupe: true when this event id is new.
    pub async fn record_event(&self, event_id: &str, kind: &str, livemode: bool) -> Result<bool> {
        let n = self
            .c
            .execute(
                "INSERT INTO kubcode_accounts.stripe_events (event_id, type, livemode) VALUES ($1, $2, $3)
                 ON CONFLICT (event_id) DO NOTHING",
                &[&event_id, &kind, &livemode],
            )
            .await?;
        Ok(n == 1)
    }

    /// pending → paid and the entitlement row, in one transaction. Idempotent:
    /// a second call (replay, success page racing the webhook) changes nothing.
    pub async fn fulfil(
        &mut self,
        purchase: Uuid,
        payment_intent: Option<&str>,
        method: Option<&str>,
        exempt: bool,
        now: OffsetDateTime,
    ) -> Result<Fulfilled> {
        let tx = self.c.transaction().await?;
        let row = tx
            .query_opt(
                "UPDATE kubcode_accounts.billing_purchases
                    SET status = 'paid', paid_at = now(), stripe_payment_intent_id = $2, payment_method = $3
                  WHERE id = $1 AND status = 'pending'
                  RETURNING workspace_id",
                &[&purchase, &payment_intent, &method],
            )
            .await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(Fulfilled::AlreadyPaid);
        };
        let workspace: Uuid = row.get(0);
        // Serialize entitlement rebuilds per workspace.
        tx.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended('kubcode-billing:' || $1::text, 0))",
            &[&workspace.to_string()],
        )
        .await?;
        let ent = entitlement(&paid_spans(&tx, workspace).await?, now, exempt);
        let slots = i32::try_from(ent.slots.min(50)).map_err(|_| StoreError::Corrupt)?;
        tx.execute(
            "INSERT INTO kubcode_accounts.billing_entitlements (workspace_id, slots, period_start, paid_until, updated_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (workspace_id) DO UPDATE
               SET slots = EXCLUDED.slots, period_start = EXCLUDED.period_start,
                   paid_until = EXCLUDED.paid_until, updated_at = now()",
            &[&workspace, &slots, &ent.period_start, &ent.paid_until],
        )
        .await?;
        tx.commit().await?;
        Ok(Fulfilled::Granted(ent))
    }

    /// pending → failed | expired. No effect on any other state.
    pub async fn close(&self, purchase: Uuid, to: Status) -> Result<bool> {
        if !matches!(to, Status::Failed | Status::Expired) {
            return Err(StoreError::Corrupt);
        }
        let n = self
            .c
            .execute(
                "UPDATE kubcode_accounts.billing_purchases SET status = $2, closed_at = now()
                  WHERE id = $1 AND status = 'pending'",
                &[&purchase, &to.as_str()],
            )
            .await?;
        Ok(n == 1)
    }

    /// Paid at Stripe but not what we asked for (or on a closed purchase):
    /// grant nothing, flag for the owner.
    pub async fn flag_review(&self, purchase: Uuid, code: &str) -> Result<()> {
        self.c
            .execute(
                "UPDATE kubcode_accounts.billing_purchases SET review_code = $2 WHERE id = $1",
                &[&purchase, &code],
            )
            .await?;
        Ok(())
    }
}
