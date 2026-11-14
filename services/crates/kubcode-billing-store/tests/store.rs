//! The billing store against a throwaway Postgres with every migration,
//! running as `kubcode_billing` (grants and RLS apply).
//!
//!   KUBCODE_TEST_DATABASE_URL=postgres://postgres:…@127.0.0.1:55432/kubcode_local_test \
//!     cargo test -p kubcode-billing-store -- --ignored

use kubcode_billing::entitlement::Standing;
use kubcode_billing::money::Satang;
use kubcode_billing::purchase::Status;
use kubcode_billing::quote::{month_pass, Kind};
use kubcode_billing_store::{Fulfilled, Store};
use time::{Duration, OffsetDateTime};
use tokio_postgres::{Client, NoTls};
use uuid::Uuid;

const NEEDS_DB: &str = "needs KUBCODE_TEST_DATABASE_URL; run with --ignored";

async fn connect(url: &str) -> Client {
    let (c, conn) = tokio_postgres::connect(url, NoTls).await.unwrap();
    tokio::spawn(async move {
        let _ = conn.await;
    });
    c
}

struct Db {
    admin: Client,
    owner: Client,
    url: String,
    name: String,
}

async fn db() -> Db {
    let base = std::env::var("KUBCODE_TEST_DATABASE_URL").expect(NEEDS_DB);
    assert!(
        base.contains("127.0.0.1") || base.contains("localhost"),
        "local test database only"
    );
    let admin = connect(&base).await;
    let name = format!(
        "kc_bill_{}_test",
        &Uuid::new_v4().simple().to_string()[..12]
    );
    admin
        .batch_execute(&format!("CREATE DATABASE {name}"))
        .await
        .unwrap();
    let url = format!("{}/{name}", base.rsplit_once('/').unwrap().0);
    let owner = connect(&url).await;
    owner
        .batch_execute(
            "CREATE SCHEMA IF NOT EXISTS kubcode_accounts;
             CREATE TABLE IF NOT EXISTS kubcode_accounts.schema_migrations (
               version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
             DO $$ BEGIN CREATE ROLE kubcode_worker NOLOGIN;
             EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
             DO $$ BEGIN CREATE ROLE kubcode_app NOLOGIN;
             EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
             DO $$ BEGIN CREATE ROLE kubcode_billing NOLOGIN;
             EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;",
        )
        .await
        .unwrap();
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../db/migrations");
    let mut files: Vec<_> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|f| f.extension().is_some_and(|e| e == "sql"))
        .collect();
    files.sort();
    for f in &files {
        owner
            .batch_execute(&std::fs::read_to_string(f).unwrap())
            .await
            .unwrap();
    }
    Db {
        admin,
        owner,
        url,
        name,
    }
}

impl Db {
    async fn billing(&self) -> Store {
        let c = connect(&self.url).await;
        c.batch_execute("SET ROLE kubcode_billing").await.unwrap();
        Store::new(c)
    }
    /// A user with an owned workspace.
    async fn member(&self, owner: bool) -> (Uuid, Uuid) {
        let u: Uuid = self
            .owner
            .query_one(
                "INSERT INTO kubcode_accounts.users (is_owner) VALUES ($1) RETURNING id",
                &[&owner],
            )
            .await
            .unwrap()
            .get(0);
        let ws: Uuid = self
            .owner
            .query_one(
                "INSERT INTO kubcode_accounts.workspaces (name) VALUES ('w') RETURNING id",
                &[],
            )
            .await
            .unwrap()
            .get(0);
        self.owner
            .execute("INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", &[&ws, &u])
            .await
            .unwrap();
        (u, ws)
    }
    async fn drop(self) {
        drop(self.owner);
        self.admin
            .batch_execute(&format!(
                "DROP DATABASE IF EXISTS {} WITH (FORCE)",
                self.name
            ))
            .await
            .unwrap();
    }
}

fn now() -> OffsetDateTime {
    OffsetDateTime::now_utc().replace_nanosecond(0).unwrap()
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn purchase_fulfils_once_and_entitlement_follows() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    let mut st = db.billing().await;
    let payer = st.payer(user).await.unwrap().unwrap();
    assert_eq!((payer.workspace, payer.exempt), (ws, false));
    let ent = st.entitlement(ws, false, now()).await.unwrap();
    assert_eq!(ent.standing, Standing::None);
    let q = month_pass(&ent, 2, now()).unwrap();
    let pid = st.create_purchase(ws, user, &q).await.unwrap();
    st.attach_session(pid, "cs_test_abc").await.unwrap();
    assert!(
        st.attach_session(pid, "cs_test_other").await.is_err(),
        "one session per purchase"
    );
    let p = st
        .purchase_by_session("cs_test_abc")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        (p.id, p.kind, p.slots, p.amount, p.status),
        (pid, Kind::New, 2, Satang(57_800), Status::Pending)
    );
    let first = st
        .fulfil(pid, Some("pi_abc"), Some("card"), false, now())
        .await
        .unwrap();
    let Fulfilled::Granted(e) = first else {
        panic!("expected a grant")
    };
    assert_eq!(
        (e.slots, e.standing, e.paid_until),
        (2, Standing::Active, Some(q.period_end))
    );
    assert_eq!(
        st.fulfil(pid, Some("pi_abc"), Some("card"), false, now())
            .await
            .unwrap(),
        Fulfilled::AlreadyPaid
    );
    let row = db.owner.query_one("SELECT slots, paid_until FROM kubcode_accounts.billing_entitlements WHERE workspace_id = $1", &[&ws]).await.unwrap();
    assert_eq!(row.get::<_, i32>(0), 2);
    assert_eq!(row.get::<_, Option<OffsetDateTime>>(1), Some(q.period_end));
    assert!(
        !st.close(pid, Status::Expired).await.unwrap(),
        "a paid purchase never closes"
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn parallel_fulfils_grant_exactly_once() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    let st = db.billing().await;
    let q = month_pass(&st.entitlement(ws, false, now()).await.unwrap(), 1, now()).unwrap();
    let pid = st.create_purchase(ws, user, &q).await.unwrap();
    let mut stores = Vec::new();
    for _ in 0..6 {
        stores.push(db.billing().await);
    }
    let t = now();
    let results = futures_join(
        stores
            .iter_mut()
            .map(|s| s.fulfil(pid, None, None, false, t)),
    )
    .await;
    let grants = results
        .iter()
        .filter(|r| matches!(r, Ok(Fulfilled::Granted(_))))
        .count();
    assert_eq!(grants, 1);
    assert!(results.iter().all(|r| r.is_ok()));
    db.drop().await;
}

async fn futures_join<F: std::future::Future>(fs: impl Iterator<Item = F>) -> Vec<F::Output> {
    let mut handles = Vec::new();
    for f in fs {
        handles.push(f);
    }
    let mut out = Vec::new();
    // Poll all concurrently on this task.
    let mut pinned: Vec<std::pin::Pin<Box<F>>> = handles.into_iter().map(Box::pin).collect();
    let mut done: Vec<Option<F::Output>> = (0..pinned.len()).map(|_| None).collect();
    std::future::poll_fn(|cx| {
        let mut pending = false;
        for (i, f) in pinned.iter_mut().enumerate() {
            if done[i].is_none() {
                match f.as_mut().poll(cx) {
                    std::task::Poll::Ready(v) => done[i] = Some(v),
                    std::task::Poll::Pending => pending = true,
                }
            }
        }
        if pending {
            std::task::Poll::Pending
        } else {
            std::task::Poll::Ready(())
        }
    })
    .await;
    for d in done {
        out.push(d.unwrap());
    }
    out
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn events_nonces_closing_and_review() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    let st = db.billing().await;
    assert!(!st.event_seen("evt_1abc").await.unwrap());
    assert!(st
        .record_event("evt_1abc", "checkout.session.completed", false)
        .await
        .unwrap());
    assert!(!st
        .record_event("evt_1abc", "checkout.session.completed", false)
        .await
        .unwrap());
    assert!(st.event_seen("evt_1abc").await.unwrap());
    let h = [7u8; 32];
    assert!(st.use_nonce(&h).await.unwrap());
    assert!(!st.use_nonce(&h).await.unwrap());
    let q = month_pass(&st.entitlement(ws, false, now()).await.unwrap(), 1, now()).unwrap();
    let pid = st.create_purchase(ws, user, &q).await.unwrap();
    assert!(st.close(pid, Status::Expired).await.unwrap());
    assert!(
        !st.close(pid, Status::Failed).await.unwrap(),
        "final states stay"
    );
    st.flag_review(pid, "paid_after_close").await.unwrap();
    let r: Option<String> = db
        .owner
        .query_one(
            "SELECT review_code FROM kubcode_accounts.billing_purchases WHERE id = $1",
            &[&pid],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(r.as_deref(), Some("paid_after_close"));
    assert!(
        st.close(pid, Status::Paid).await.is_err(),
        "close only to failed/expired"
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn renewal_chains_and_owner_is_exempt() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    let mut st = db.billing().await;
    let t = now();
    let q1 = month_pass(&st.entitlement(ws, false, t).await.unwrap(), 1, t).unwrap();
    let p1 = st.create_purchase(ws, user, &q1).await.unwrap();
    st.fulfil(p1, None, Some("promptpay"), false, t)
        .await
        .unwrap();
    let t2 = t + Duration::days(25);
    let ent = st.entitlement(ws, false, t2).await.unwrap();
    let q2 = month_pass(&ent, 3, t2).unwrap();
    assert_eq!((q2.kind, q2.period_start), (Kind::Renew, q1.period_end));
    let p2 = st.create_purchase(ws, user, &q2).await.unwrap();
    let Fulfilled::Granted(e) = st.fulfil(p2, None, None, false, t2).await.unwrap() else {
        panic!()
    };
    assert_eq!(
        (e.slots, e.paid_until),
        (1, Some(q2.period_end)),
        "3 slots start when the first pass ends"
    );
    let (owner, ows) = db.member(true).await;
    let op = st.payer(owner).await.unwrap().unwrap();
    assert!(op.exempt);
    assert!(st.workspace_exempt(ows).await.unwrap());
    assert!(!st.workspace_exempt(ws).await.unwrap());
    db.drop().await;
}

impl Db {
    async fn channel(&self, ws: Uuid, days_ago: i64) -> Uuid {
        let id: Uuid = self
            .owner
            .query_one(
                "INSERT INTO kubcode_accounts.channels (workspace_id, platform, display_name, created_at) VALUES ($1, 'tiktok', 'c', now() - make_interval(days => $2::int)) RETURNING id",
                &[&ws, &(days_ago as i32)],
            )
            .await
            .unwrap()
            .get(0);
        self.owner
            .execute(
                "INSERT INTO kubcode_accounts.channel_connections (channel_id, provider, provider_ref, status) VALUES ($1, 'zernio', $2, 'active')",
                &[&id, &format!("acct-{id}")],
            )
            .await
            .unwrap();
        id
    }
    async fn open_pauses(&self, ws: Uuid) -> Vec<Uuid> {
        self.owner
            .query(
                "SELECT p.channel_id FROM kubcode_accounts.billing_channel_pauses p JOIN kubcode_accounts.channels c ON c.id = p.channel_id
                  WHERE c.workspace_id = $1 AND p.resumed_at IS NULL ORDER BY c.created_at",
                &[&ws],
            )
            .await
            .unwrap()
            .iter()
            .map(|r| r.get(0))
            .collect()
    }
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn sweep_pauses_after_grace_and_resumes_on_renewal_newest_first() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    let old = db.channel(ws, 30).await;
    let newer = db.channel(ws, 2).await;
    let mut st = db.billing().await;
    let t0 = now();
    let q = month_pass(&st.entitlement(ws, false, t0).await.unwrap(), 1, t0).unwrap();
    let p = st.create_purchase(ws, user, &q).await.unwrap();
    st.fulfil(p, None, None, false, t0).await.unwrap();
    // Active with 1 slot and 2 channels: the newer one pauses.
    let o = st
        .sweep_workspace(ws, t0 + Duration::days(1))
        .await
        .unwrap();
    assert_eq!((o.paused, o.resumed), (1, 0));
    assert_eq!(db.open_pauses(ws).await, vec![newer]);
    // Idempotent.
    assert_eq!(
        st.sweep_workspace(ws, t0 + Duration::days(1))
            .await
            .unwrap()
            .paused,
        0
    );
    // Grace: nothing more pauses.
    let grace = q.period_end + Duration::days(2);
    assert_eq!(st.sweep_workspace(ws, grace).await.unwrap().paused, 0);
    // Lapsed: the older one pauses too.
    let lapsed = q.period_end + Duration::days(3);
    assert_eq!(st.sweep_workspace(ws, lapsed).await.unwrap().paused, 1);
    assert_eq!(db.open_pauses(ws).await, vec![old, newer]);
    let ent: i32 = db
        .owner
        .query_one(
            "SELECT slots FROM kubcode_accounts.billing_entitlements WHERE workspace_id = $1",
            &[&ws],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(ent, 0);
    // 14 days paused: due for disconnect (the publishing worker does it).
    assert_eq!(
        st.sweep_workspace(ws, lapsed + Duration::days(14))
            .await
            .unwrap()
            .disconnect_due,
        2
    );
    // Renew 2 slots: both resume, history kept.
    let q2 = month_pass(&st.entitlement(ws, false, lapsed).await.unwrap(), 2, lapsed).unwrap();
    let p2 = st.create_purchase(ws, user, &q2).await.unwrap();
    st.fulfil(p2, None, None, false, lapsed).await.unwrap();
    let o = st
        .sweep_workspace(ws, lapsed + Duration::minutes(1))
        .await
        .unwrap();
    assert_eq!(o.resumed, 2);
    assert!(db.open_pauses(ws).await.is_empty());
    // One pause row per channel (the newer one's over-slots pause carried
    // through the lapse); both kept with resumed_at set, nothing deleted.
    let rows: i64 = db
        .owner
        .query_one("SELECT count(*) FROM kubcode_accounts.billing_channel_pauses WHERE resumed_at IS NOT NULL", &[])
        .await
        .unwrap()
        .get(0);
    assert_eq!(rows, 2, "history kept");
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn sweep_skips_never_paid_and_owner_workspaces() {
    let db = db().await;
    let (_u, free_ws) = db.member(false).await;
    db.channel(free_ws, 1).await;
    let (_o, owner_ws) = db.member(true).await;
    db.channel(owner_ws, 1).await;
    let st = db.billing().await;
    let list = st.sweep_workspaces().await.unwrap();
    assert!(!list.contains(&free_ws) && !list.contains(&owner_ws));
    let mut st = st;
    assert_eq!(st.sweep_workspace(owner_ws, now()).await.unwrap().paused, 0);
    assert_eq!(st.sweep_workspace(free_ws, now()).await.unwrap().paused, 0);
    db.drop().await;
}

// ---------------- refunds and disputes (0014) ----------------

use kubcode_billing::money::Satang as Sat;
use kubcode_billing::quote::add_slots;
use kubcode_billing::refund::Dispute;
use kubcode_billing_store::{AfterOutcome, AfterPayment};

impl Db {
    async fn paid(
        &self,
        st: &mut Store,
        user: Uuid,
        ws: Uuid,
        q: &kubcode_billing::quote::Quote,
        pi: &str,
        t: OffsetDateTime,
    ) -> Uuid {
        let id = st.create_purchase(ws, user, q).await.unwrap();
        st.fulfil(id, Some(pi), Some("card"), false, t)
            .await
            .unwrap();
        id
    }
    async fn ent(&self, ws: Uuid) -> (i32, Option<OffsetDateTime>) {
        let r = self.owner.query_one("SELECT slots, paid_until FROM kubcode_accounts.billing_entitlements WHERE workspace_id = $1", &[&ws]).await.unwrap();
        (r.get(0), r.get(1))
    }
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn refunding_an_early_renewal_shortens_paid_until_and_keeps_channels() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    db.channel(ws, 10).await;
    let mut st = db.billing().await;
    let t = now();
    let q1 = month_pass(&st.entitlement(ws, false, t).await.unwrap(), 1, t).unwrap();
    db.paid(&mut st, user, ws, &q1, "pi_first0001", t).await;
    let t2 = t + Duration::days(5);
    let q2 = month_pass(&st.entitlement(ws, false, t2).await.unwrap(), 1, t2).unwrap();
    db.paid(&mut st, user, ws, &q2, "pi_renew0001", t2).await;
    assert_eq!(db.ent(ws).await, (1, Some(q2.period_end)));
    let o = st
        .after_payment("pi_renew0001", AfterPayment::Refunded(Sat(28_900)), t2)
        .await
        .unwrap();
    assert_eq!(
        o,
        AfterOutcome::Revoked { paused: 0 },
        "the first month still covers the one channel"
    );
    assert_eq!(db.ent(ws).await, (1, Some(q1.period_end)));
    assert!(db.open_pauses(ws).await.is_empty());
    let r = db.owner.query_one("SELECT status, refunded_satang, revoked_reason FROM kubcode_accounts.billing_purchases WHERE stripe_payment_intent_id = 'pi_renew0001'", &[]).await.unwrap();
    assert_eq!(
        (
            r.get::<_, String>(0),
            r.get::<_, i64>(1),
            r.get::<_, Option<String>>(2)
        ),
        ("paid".into(), 28_900, Some("refunded".into()))
    );
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn refunding_a_mid_pass_add_pauses_the_newest_channel_now() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    let _old = db.channel(ws, 20).await;
    let newer = db.channel(ws, 1).await;
    let mut st = db.billing().await;
    let t = now();
    let q1 = month_pass(&st.entitlement(ws, false, t).await.unwrap(), 1, t).unwrap();
    db.paid(&mut st, user, ws, &q1, "pi_pass0001", t).await;
    let t2 = t + Duration::days(3);
    let add = add_slots(&st.entitlement(ws, false, t2).await.unwrap(), 1, t2).unwrap();
    db.paid(&mut st, user, ws, &add, "pi_add0001", t2).await;
    assert_eq!(db.ent(ws).await.0, 2);
    // Partial refund of the add: recorded, nothing else.
    assert_eq!(
        st.after_payment("pi_add0001", AfterPayment::Refunded(Sat(1_000)), t2)
            .await
            .unwrap(),
        AfterOutcome::Recorded
    );
    assert_eq!(db.ent(ws).await.0, 2);
    assert!(db.open_pauses(ws).await.is_empty());
    // Full refund: back to 1 slot, the newer channel pauses at once (no grace).
    let full = Sat(add.amount.0);
    assert_eq!(
        st.after_payment("pi_add0001", AfterPayment::Refunded(full), t2)
            .await
            .unwrap(),
        AfterOutcome::Revoked { paused: 1 }
    );
    assert_eq!(db.ent(ws).await, (1, Some(q1.period_end)));
    assert_eq!(db.open_pauses(ws).await, vec![newer]);
    // The regular sweep agrees (no resume, no extra pause).
    let o = st
        .sweep_workspace(ws, t2 + Duration::minutes(1))
        .await
        .unwrap();
    assert_eq!((o.paused, o.resumed), (0, 0));
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn refunding_the_only_pass_pauses_everything_now_and_grace_does_not_resume() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    let a = db.channel(ws, 5).await;
    let mut st = db.billing().await;
    let t = now();
    let q = month_pass(&st.entitlement(ws, false, t).await.unwrap(), 1, t).unwrap();
    db.paid(&mut st, user, ws, &q, "pi_only0001", t).await;
    let o = st
        .after_payment(
            "pi_only0001",
            AfterPayment::Refunded(Sat(28_900)),
            t + Duration::days(1),
        )
        .await
        .unwrap();
    assert_eq!(o, AfterOutcome::Revoked { paused: 1 });
    assert_eq!(db.open_pauses(ws).await, vec![a]);
    assert_eq!(db.ent(ws).await, (0, None));
    let o = st.sweep_workspace(ws, t + Duration::days(1)).await.unwrap();
    assert_eq!(o.resumed, 0);
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn double_delivery_in_parallel_has_one_effect() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    db.channel(ws, 5).await;
    db.channel(ws, 1).await;
    let mut st = db.billing().await;
    let t = now();
    let q = month_pass(&st.entitlement(ws, false, t).await.unwrap(), 2, t).unwrap();
    db.paid(&mut st, user, ws, &q, "pi_twice0001", t).await;
    let mut stores = Vec::new();
    for _ in 0..4 {
        stores.push(db.billing().await);
    }
    let results = futures_join(
        stores
            .iter_mut()
            .map(|s| s.after_payment("pi_twice0001", AfterPayment::Refunded(Sat(57_800)), t)),
    )
    .await;
    let revoked = results
        .iter()
        .filter(|r| matches!(r, Ok(AfterOutcome::Revoked { .. })))
        .count();
    let unchanged = results
        .iter()
        .filter(|r| matches!(r, Ok(AfterOutcome::Unchanged)))
        .count();
    assert_eq!((revoked, unchanged), (1, 3));
    assert_eq!(db.open_pauses(ws).await.len(), 2);
    db.drop().await;
}

#[tokio::test]
#[ignore = "needs KUBCODE_TEST_DATABASE_URL"]
async fn disputes_flag_win_or_revoke_and_the_owner_is_never_touched() {
    let db = db().await;
    let (user, ws) = db.member(false).await;
    db.channel(ws, 5).await;
    let mut st = db.billing().await;
    let t = now();
    let q = month_pass(&st.entitlement(ws, false, t).await.unwrap(), 1, t).unwrap();
    db.paid(&mut st, user, ws, &q, "pi_disp0001", t).await;
    assert_eq!(
        st.after_payment("pi_disp0001", AfterPayment::Dispute(Dispute::Open), t)
            .await
            .unwrap(),
        AfterOutcome::Recorded
    );
    let r = db.owner.query_one("SELECT review_code, dispute FROM kubcode_accounts.billing_purchases WHERE stripe_payment_intent_id = 'pi_disp0001'", &[]).await.unwrap();
    assert_eq!(
        (r.get::<_, Option<String>>(0), r.get::<_, Option<String>>(1)),
        (Some("dispute_open".into()), Some("open".into()))
    );
    assert!(
        db.open_pauses(ws).await.is_empty(),
        "opened: no access change"
    );
    assert_eq!(
        st.after_payment("pi_disp0001", AfterPayment::Dispute(Dispute::Open), t)
            .await
            .unwrap(),
        AfterOutcome::Unchanged
    );
    assert!(matches!(
        st.after_payment("pi_disp0001", AfterPayment::Dispute(Dispute::Lost), t)
            .await
            .unwrap(),
        AfterOutcome::Revoked { paused: 1 }
    ));
    let r = db.owner.query_one("SELECT review_code, dispute FROM kubcode_accounts.billing_purchases WHERE stripe_payment_intent_id = 'pi_disp0001'", &[]).await.unwrap();
    assert_eq!(
        (r.get::<_, Option<String>>(0), r.get::<_, Option<String>>(1)),
        (None, Some("lost".into()))
    );
    // Won path on another purchase.
    let (u2, ws2) = db.member(false).await;
    let q2 = month_pass(&st.entitlement(ws2, false, t).await.unwrap(), 1, t).unwrap();
    db.paid(&mut st, u2, ws2, &q2, "pi_won0001", t).await;
    st.after_payment("pi_won0001", AfterPayment::Dispute(Dispute::Open), t)
        .await
        .unwrap();
    assert_eq!(
        st.after_payment("pi_won0001", AfterPayment::Dispute(Dispute::Won), t)
            .await
            .unwrap(),
        AfterOutcome::Recorded
    );
    assert_eq!(db.ent(ws2).await.0, 1);
    // Unknown payment intent.
    assert_eq!(
        st.after_payment("pi_nobody0001", AfterPayment::Refunded(Sat(1)), t)
            .await
            .unwrap(),
        AfterOutcome::Unknown
    );
    // The owner: a refund on an owner workspace purchase never pauses.
    let (owner, ows) = db.member(true).await;
    db.channel(ows, 2).await;
    let oq = kubcode_billing::quote::Quote {
        kind: Kind::New,
        slots: 1,
        amount: Sat(28_900),
        period_start: t,
        period_end: t + Duration::days(30),
    };
    let oid = st.create_purchase(ows, owner, &oq).await.unwrap();
    st.fulfil(oid, Some("pi_owner0001"), None, true, t)
        .await
        .unwrap();
    assert_eq!(
        st.after_payment("pi_owner0001", AfterPayment::Refunded(Sat(28_900)), t)
            .await
            .unwrap(),
        AfterOutcome::Revoked { paused: 0 }
    );
    assert!(db.open_pauses(ows).await.is_empty());
    db.drop().await;
}
