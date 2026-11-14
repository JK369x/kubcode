//! Postgres store for billing (migration 0013, ADR 0008). Runs as the
//! `kubcode_billing` role. Every money-changing step is one transaction:
//! fulfilment moves a purchase `pending → paid` with `WHERE status = 'pending'`
//! and rewrites the workspace's entitlement row in the same transaction, so a
//! replayed webhook or a racing success page cannot grant twice.

use kubcode_billing::entitlement::{entitlement, slots_at, Entitlement, PaidSpan};
use kubcode_billing::money::Satang;
use kubcode_billing::purchase::Status;
use kubcode_billing::quote::{Kind, Quote};
use kubcode_billing::refund::{on_dispute, on_refund, Change, Dispute, PaidFacts, Review};
use kubcode_billing::sweep::{pause_after_revoke, plan, ChannelSlot};
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

/// A Stripe charge or dispute event about a paid purchase.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AfterPayment {
    /// `charge.refunded`: the charge's running `amount_refunded`.
    Refunded(Satang),
    /// `charge.dispute.created` (Open) or `.closed` (Won / Lost).
    Dispute(Dispute),
}

/// What applying an [`AfterPayment`] event did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AfterOutcome {
    /// No purchase has this payment intent (not ours, or not paid through us).
    Unknown,
    /// Already applied (replay, older event): nothing changed.
    Unchanged,
    /// Recorded (partial refund, dispute opened/won); access unchanged.
    Recorded,
    /// Revoked: entitlement rebuilt, `paused` channels paused now.
    Revoked { paused: usize },
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
              WHERE workspace_id = $1 AND status = 'paid' AND revoked_at IS NULL ORDER BY period_start",
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

/// Whether the workspace belongs to the site owner (never pays, never paused).
async fn exempt_in<C: GenericClient>(c: &C, workspace: Uuid) -> Result<bool> {
    Ok(c.query_opt(
        "SELECT bool_or(u.is_owner) FROM kubcode_accounts.workspace_members m
               JOIN kubcode_accounts.users u ON u.id = m.user_id WHERE m.workspace_id = $1",
        &[&workspace],
    )
    .await?
    .and_then(|r| r.get::<_, Option<bool>>(0))
    .unwrap_or(false))
}

/// Channels that hold a slot: a live connection, or an open billing pause.
struct LoadedChannels {
    rows: Vec<(String, OffsetDateTime, Option<OffsetDateTime>, bool)>,
}

impl LoadedChannels {
    fn as_slots(&self) -> Vec<ChannelSlot<'_>> {
        self.rows
            .iter()
            .map(|(id, created_at, paused_at, disconnected)| ChannelSlot {
                id,
                created_at: *created_at,
                paused_at: *paused_at,
                disconnected: *disconnected,
            })
            .collect()
    }
}

async fn channel_slots<C: GenericClient>(c: &C, workspace: Uuid) -> Result<LoadedChannels> {
    let rows = c
        .query(
            "SELECT ch.id, ch.created_at,
                    (SELECT p.paused_at FROM kubcode_accounts.billing_channel_pauses p
                      WHERE p.channel_id = ch.id AND p.resumed_at IS NULL) AS paused_at,
                    (SELECT p.disconnected_at FROM kubcode_accounts.billing_channel_pauses p
                      WHERE p.channel_id = ch.id AND p.resumed_at IS NULL) AS disconnected_at,
                    EXISTS (SELECT 1 FROM kubcode_accounts.channel_connections cc
                             WHERE cc.channel_id = ch.id AND cc.status <> 'revoked') AS live
               FROM kubcode_accounts.channels ch WHERE ch.workspace_id = $1",
            &[&workspace],
        )
        .await?;
    let mut out = Vec::new();
    for r in &rows {
        let paused: Option<OffsetDateTime> = r.get(2);
        let disconnected: Option<OffsetDateTime> = r.get(3);
        let live: bool = r.get(4);
        // A channel the creator disconnected themselves holds no slot.
        if !live && paused.is_none() {
            continue;
        }
        out.push((
            r.get::<_, Uuid>(0).to_string(),
            r.get(1),
            paused,
            disconnected.is_some(),
        ));
    }
    Ok(LoadedChannels { rows: out })
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

    /// A refund or dispute on a paid purchase (ADR 0008 amendment 2026-11-14),
    /// found by its payment intent. One transaction under the workspace lock:
    /// the purchase row (refunded total, dispute, review flag, revoke), and on a
    /// revoke the entitlement row and immediate pauses (newest first, no grace).
    /// Idempotent: the domain decides from the stored state, so a replay or an
    /// older event changes nothing.
    pub async fn after_payment(
        &mut self,
        payment_intent: &str,
        ev: AfterPayment,
        now: OffsetDateTime,
    ) -> Result<AfterOutcome> {
        let tx = self.c.transaction().await?;
        let Some(head) = tx
            .query_opt(
                "SELECT workspace_id FROM kubcode_accounts.billing_purchases
                  WHERE stripe_payment_intent_id = $1 AND status = 'paid'",
                &[&payment_intent],
            )
            .await?
        else {
            tx.commit().await?;
            return Ok(AfterOutcome::Unknown);
        };
        let workspace: Uuid = head.get(0);
        tx.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended('kubcode-billing:' || $1::text, 0))",
            &[&workspace.to_string()],
        )
        .await?;
        let r = tx
            .query_one(
                "SELECT id, amount_satang, refunded_satang, dispute, revoked_at IS NOT NULL
                   FROM kubcode_accounts.billing_purchases
                  WHERE stripe_payment_intent_id = $1 AND status = 'paid' FOR UPDATE",
                &[&payment_intent],
            )
            .await?;
        let id: Uuid = r.get(0);
        let dispute: Option<String> = r.get(3);
        let facts = PaidFacts {
            amount: Satang(r.get(1)),
            refunded: Satang(r.get(2)),
            dispute: match dispute.as_deref() {
                None => None,
                Some(d) => Some(Dispute::parse(d).ok_or(StoreError::Corrupt)?),
            },
            revoked: r.get(4),
        };
        let change: Change = match ev {
            AfterPayment::Refunded(total) => on_refund(&facts, total),
            AfterPayment::Dispute(d) => on_dispute(&facts, d),
        };
        if change.is_noop() {
            tx.commit().await?;
            return Ok(AfterOutcome::Unchanged);
        }
        let review: Option<Option<&str>> = match change.review {
            None => None,
            Some(Review::Flag(code)) => Some(Some(code)),
            Some(Review::Clear) => Some(None),
        };
        tx.execute(
            "UPDATE kubcode_accounts.billing_purchases
                SET refunded_satang = COALESCE($2, refunded_satang),
                    dispute = COALESCE($3, dispute),
                    revoked_at = CASE WHEN $4::text IS NOT NULL AND revoked_at IS NULL THEN now() ELSE revoked_at END,
                    revoked_reason = CASE WHEN $4::text IS NOT NULL AND revoked_at IS NULL THEN $4 ELSE revoked_reason END,
                    review_code = CASE WHEN $5 THEN $6 ELSE review_code END
              WHERE id = $1",
            &[
                &id,
                &change.refunded.map(|s| s.0),
                &change.dispute.map(Dispute::as_str),
                &change.revoke.map(|r| r.as_str()),
                &review.is_some(),
                &review.flatten(),
            ],
        )
        .await?;
        let Some(_) = change.revoke else {
            tx.commit().await?;
            return Ok(AfterOutcome::Recorded);
        };
        let exempt = exempt_in(&tx, workspace).await?;
        let spans = paid_spans(&tx, workspace).await?;
        let ent = entitlement(&spans, now, exempt);
        if !exempt {
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
        }
        // No grace for money given back: only what covers `now` counts.
        let loaded = channel_slots(&tx, workspace).await?;
        let slots_in = loaded.as_slots();
        let pause = pause_after_revoke(slots_at(&spans, now), exempt, &slots_in);
        let reason = if slots_at(&spans, now) == 0 {
            "lapsed"
        } else {
            "over_slots"
        };
        for cid in &pause {
            let cid: Uuid = cid.parse().map_err(|_| StoreError::Corrupt)?;
            tx.execute(
                "INSERT INTO kubcode_accounts.billing_channel_pauses (channel_id, reason, paused_at) VALUES ($1, $2, $3)
                 ON CONFLICT (channel_id) WHERE resumed_at IS NULL DO NOTHING",
                &[&cid, &reason, &now],
            )
            .await?;
        }
        tx.commit().await?;
        Ok(AfterOutcome::Revoked {
            paused: pause.len(),
        })
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

    /// Workspaces the sweep must look at: every workspace that has ever paid,
    /// or still has an open pause (a never-paid workspace is not swept).
    pub async fn sweep_workspaces(&self) -> Result<Vec<Uuid>> {
        let rows = self
            .c
            .query(
                "SELECT DISTINCT workspace_id FROM kubcode_accounts.billing_purchases WHERE status = 'paid' AND revoked_at IS NULL
                 UNION
                 SELECT DISTINCT ch.workspace_id FROM kubcode_accounts.billing_channel_pauses p
                   JOIN kubcode_accounts.channels ch ON ch.id = p.channel_id WHERE p.resumed_at IS NULL",
                &[],
            )
            .await?;
        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    /// One workspace: pause channels past their slots, resume those that fit
    /// again, keep the entitlement row current. One transaction under the
    /// workspace lock, so it cannot interleave with a fulfilment.
    pub async fn sweep_workspace(
        &mut self,
        workspace: Uuid,
        now: OffsetDateTime,
    ) -> Result<SweepOutcome> {
        let tx = self.c.transaction().await?;
        tx.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended('kubcode-billing:' || $1::text, 0))",
            &[&workspace.to_string()],
        )
        .await?;
        let exempt = exempt_in(&tx, workspace).await?;
        let ent = entitlement(&paid_spans(&tx, workspace).await?, now, exempt);
        let loaded = channel_slots(&tx, workspace).await?;
        let slots_in = loaded.as_slots();
        let p = plan(&ent, &slots_in, now);
        let reason = if matches!(ent.standing, kubcode_billing::entitlement::Standing::Lapsed) {
            "lapsed"
        } else {
            "over_slots"
        };
        for id in &p.pause {
            let id: Uuid = id.parse().map_err(|_| StoreError::Corrupt)?;
            tx.execute(
                "INSERT INTO kubcode_accounts.billing_channel_pauses (channel_id, reason, paused_at) VALUES ($1, $2, $3)
                 ON CONFLICT (channel_id) WHERE resumed_at IS NULL DO NOTHING",
                &[&id, &reason, &now],
            )
            .await?;
        }
        for id in &p.resume {
            let id: Uuid = id.parse().map_err(|_| StoreError::Corrupt)?;
            tx.execute(
                "UPDATE kubcode_accounts.billing_channel_pauses SET resumed_at = $2 WHERE channel_id = $1 AND resumed_at IS NULL",
                &[&id, &now],
            )
            .await?;
        }
        let slots = i32::try_from(ent.slots.min(50)).map_err(|_| StoreError::Corrupt)?;
        if !exempt {
            tx.execute(
                "INSERT INTO kubcode_accounts.billing_entitlements (workspace_id, slots, period_start, paid_until, updated_at)
                 VALUES ($1, $2, $3, $4, now())
                 ON CONFLICT (workspace_id) DO UPDATE
                   SET slots = EXCLUDED.slots, period_start = EXCLUDED.period_start,
                       paid_until = EXCLUDED.paid_until, updated_at = now()",
                &[&workspace, &slots, &ent.period_start, &ent.paid_until],
            )
            .await?;
        }
        tx.commit().await?;
        Ok(SweepOutcome {
            paused: p.pause.len(),
            resumed: p.resume.len(),
            disconnect_due: p.disconnect.len(),
        })
    }
}

/// Counts only (logged; no ids).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SweepOutcome {
    pub paused: usize,
    pub resumed: usize,
    /// Paused 14+ days: the publishing Lambda disconnects these from Zernio.
    pub disconnect_due: usize,
}
