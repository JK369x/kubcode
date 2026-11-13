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
