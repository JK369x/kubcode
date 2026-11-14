// Migration 0013 (billing, ADR 0008): roles, grants, RLS and constraints.
// The billing store itself is Rust (services/crates/kubcode-billing-store, PR2);
// this suite pins what each database role may do.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createPgAccountStore } from "../../lib/accounts/store";
import { createPool } from "../../lib/accounts/db";
import { throwawayDb, type ThrowawayDb } from "./harness";
import type { Pool } from "pg";

let db: ThrowawayDb;
let billing: Pool;
let seq = 0;

before(async () => {
  db = await throwawayDb();
  const url = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
  url.pathname = `/${(await db.pool.query("SELECT current_database() AS d")).rows[0].d}`;
  billing = createPool(url.href, { max: 2, options: "-c role=kubcode_billing" }, {});
});
after(async () => {
  await billing?.end();
  await db?.cleanup();
});

async function workspace(): Promise<{ ws: string; uid: string }> {
  const n = ++seq;
  const r = await createPgAccountStore(db.pool).resolveLogin({ provider: "google", subject: `g-bill-${n}`, displayName: `B${n}`, email: `b${n}@example.test` });
  if (r.status !== "ok") throw new Error("seed");
  const ws = (await db.pool.query("INSERT INTO kubcode_accounts.workspaces (name) VALUES ($1) RETURNING id", [`ws${n}`])).rows[0].id as string;
  await db.pool.query("INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [ws, r.userId]);
  return { ws, uid: r.userId };
}

const purchase = (ws: string, extra: Record<string, unknown> = {}) => ({
  ws,
  kind: "new",
  slots: 2,
  amount: 57_800,
  start: "2026-11-13T05:00:00Z",
  end: "2026-12-13T05:00:00Z",
  ...extra,
});

async function insertPurchase(p: Pool, x: ReturnType<typeof purchase>) {
  return (
    await p.query(
      `INSERT INTO kubcode_accounts.billing_purchases (workspace_id, kind, slots, amount_satang, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [x.ws, x.kind, x.slots, x.amount, x.start, x.end],
    )
  ).rows[0].id as string;
}

test("0013: the billing role is NOLOGIN and has no superpowers", async () => {
  const r = await db.pool.query(
    "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = 'kubcode_billing'",
  );
  assert.deepEqual(r.rows[0], { rolcanlogin: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
});

test("billing role: creates a pending purchase, fulfils it once, records events once; never deletes", async () => {
  const { ws } = await workspace();
  const id = await insertPurchase(billing, purchase(ws));
  const paid = await billing.query(
    `UPDATE kubcode_accounts.billing_purchases SET status = 'paid', paid_at = now(),
            stripe_checkout_session_id = 'cs_test_abc123', payment_method = 'card'
      WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  assert.equal(paid.rowCount, 1);
  const again = await billing.query("UPDATE kubcode_accounts.billing_purchases SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'pending'", [id]);
  assert.equal(again.rowCount, 0, "a second fulfil changes nothing");
  await billing.query("INSERT INTO kubcode_accounts.stripe_events (event_id, type, livemode) VALUES ('evt_1abc', 'checkout.session.completed', false)");
  await assert.rejects(
    billing.query("INSERT INTO kubcode_accounts.stripe_events (event_id, type, livemode) VALUES ('evt_1abc', 'checkout.session.completed', false)"),
    (e: { code?: string }) => e.code === "23505",
  );
  await assert.rejects(billing.query("DELETE FROM kubcode_accounts.billing_purchases WHERE id = $1", [id]), (e: { code?: string }) => e.code === "42501");
  await assert.rejects(billing.query("DELETE FROM kubcode_accounts.stripe_events"), (e: { code?: string }) => e.code === "42501");
  // Nonces are the only thing billing may delete.
  await billing.query("INSERT INTO kubcode_accounts.billing_request_nonces (nonce_hash) VALUES (sha256('n1'::bytea))");
  await billing.query("DELETE FROM kubcode_accounts.billing_request_nonces WHERE created_at < now() - interval '20 minutes'");
  await assert.rejects(
    billing.query("UPDATE kubcode_accounts.billing_purchases SET amount_satang = 1 WHERE id = $1", [id]),
    (e: { code?: string }) => e.code === "42501",
    "amount is fixed at creation",
  );
  await billing.query(
    "INSERT INTO kubcode_accounts.billing_entitlements (workspace_id, slots, period_start, paid_until) VALUES ($1, 2, $2, $3)",
    [ws, "2026-11-13T05:00:00Z", "2026-12-13T05:00:00Z"],
  );
});

test("constraints: THB only, ≥ ฿10, sane slots and periods, paid_at follows status, Stripe id shapes", async () => {
  const { ws } = await workspace();
  const bad = async (x: ReturnType<typeof purchase>) => assert.rejects(insertPurchase(db.pool, x), (e: { code?: string }) => e.code === "23514");
  await bad(purchase(ws, { amount: 999 }));
  await bad(purchase(ws, { slots: 0 }));
  await bad(purchase(ws, { slots: 51 }));
  await bad(purchase(ws, { kind: "refund" }));
  await bad(purchase(ws, { end: "2026-11-13T05:00:00Z" }));
  const id = await insertPurchase(db.pool, purchase(ws));
  await assert.rejects(db.pool.query("UPDATE kubcode_accounts.billing_purchases SET status = 'paid' WHERE id = $1", [id]), (e: { code?: string }) => e.code === "23514");
  await assert.rejects(db.pool.query("UPDATE kubcode_accounts.billing_purchases SET currency = 'usd' WHERE id = $1", [id]), (e: { code?: string }) => e.code === "23514");
  await assert.rejects(
    db.pool.query("UPDATE kubcode_accounts.billing_purchases SET stripe_checkout_session_id = 'not-a-session' WHERE id = $1", [id]),
    (e: { code?: string }) => e.code === "23514",
  );
  await assert.rejects(db.pool.query("INSERT INTO kubcode_accounts.stripe_events (event_id, type, livemode) VALUES ('x', 't', false)"), (e: { code?: string }) => e.code === "23514");
});

test("web role: reads only its own workspace's billing rows, never Stripe ids, cannot write purchases", async () => {
  const a = await workspace();
  const b = await workspace();
  await insertPurchase(db.pool, purchase(a.ws));
  await insertPurchase(db.pool, purchase(b.ws));
  const c = await db.appPool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('kubcode.user_id', $1, true)", [a.uid]);
    const mine = await c.query("SELECT workspace_id, slots, amount_satang, status FROM kubcode_accounts.billing_purchases");
    assert.deepEqual(mine.rows.map((r) => r.workspace_id), [a.ws]);
    await assert.rejects(c.query("SELECT stripe_checkout_session_id FROM kubcode_accounts.billing_purchases"), (e: { code?: string }) => e.code === "42501");
    await c.query("ROLLBACK");
    await c.query("BEGIN");
    await c.query("SELECT set_config('kubcode.user_id', $1, true)", [a.uid]);
    await assert.rejects(
      c.query("INSERT INTO kubcode_accounts.billing_purchases (workspace_id, kind, slots, amount_satang, period_start, period_end) VALUES ($1, 'new', 1, 28900, now(), now() + interval '1 month')", [a.ws]),
      (e: { code?: string }) => e.code === "42501",
    );
    await c.query("ROLLBACK");
    await c.query("BEGIN");
    await assert.rejects(c.query("SELECT * FROM kubcode_accounts.stripe_events"), (e: { code?: string }) => e.code === "42501");
    await c.query("ROLLBACK");
  } finally {
    c.release();
  }
});

test("pauses: one open pause per channel; the worker reads pauses and entitlements but cannot write them", async () => {
  const { ws } = await workspace();
  const ch = (await db.pool.query("INSERT INTO kubcode_accounts.channels (workspace_id, platform, display_name) VALUES ($1, 'tiktok', 'x') RETURNING id", [ws])).rows[0].id;
  await billing.query("INSERT INTO kubcode_accounts.billing_channel_pauses (channel_id, reason) VALUES ($1, 'lapsed')", [ch]);
  await assert.rejects(billing.query("INSERT INTO kubcode_accounts.billing_channel_pauses (channel_id, reason) VALUES ($1, 'lapsed')", [ch]), (e: { code?: string }) => e.code === "23505");
  await billing.query("UPDATE kubcode_accounts.billing_channel_pauses SET resumed_at = now() WHERE channel_id = $1 AND resumed_at IS NULL", [ch]);
  await billing.query("INSERT INTO kubcode_accounts.billing_channel_pauses (channel_id, reason) VALUES ($1, 'over_slots')", [ch]);
  const seen = await db.workerPool.query("SELECT count(*)::int AS n FROM kubcode_accounts.billing_channel_pauses WHERE channel_id = $1", [ch]);
  assert.equal(seen.rows[0].n, 2);
  await assert.rejects(db.workerPool.query("INSERT INTO kubcode_accounts.billing_channel_pauses (channel_id, reason) VALUES ($1, 'lapsed')", [ch]), (e: { code?: string }) => e.code === "42501");
  await assert.rejects(db.workerPool.query("SELECT * FROM kubcode_accounts.billing_purchases"), (e: { code?: string }) => e.code === "42501");
});

test("API roles have nothing on the billing tables", async () => {
  for (const t of ["billing_purchases", "billing_entitlements", "stripe_events", "billing_reminders", "billing_channel_pauses", "billing_request_nonces"]) {
    const r = await db.pool.query(
      "SELECT has_table_privilege('anon', $1, 'SELECT') AS a, has_table_privilege('authenticated', $1, 'SELECT') AS b",
      [`kubcode_accounts.${t}`],
    );
    assert.deepEqual(r.rows[0], { a: false, b: false }, t);
  }
});

test("0014: refund/dispute columns — billing writes them, the web reads them, constraints hold", async () => {
  const { ws } = await workspace();
  const id = await insertPurchase(billing, purchase(ws));
  await billing.query(
    "UPDATE kubcode_accounts.billing_purchases SET status = 'paid', paid_at = now(), stripe_payment_intent_id = 'pi_refund0001' WHERE id = $1",
    [id],
  );
  const r = await billing.query(
    `UPDATE kubcode_accounts.billing_purchases
        SET refunded_satang = 28900, revoked_at = now(), revoked_reason = 'refunded', dispute = 'lost'
      WHERE stripe_payment_intent_id = 'pi_refund0001'`,
  );
  assert.equal(r.rowCount, 1);
  const bad = (sql: string) => assert.rejects(db.pool.query(sql, [id]), (e: { code?: string }) => e.code === "23514", sql);
  await bad("UPDATE kubcode_accounts.billing_purchases SET refunded_satang = -1 WHERE id = $1");
  await bad("UPDATE kubcode_accounts.billing_purchases SET dispute = 'maybe' WHERE id = $1");
  await bad("UPDATE kubcode_accounts.billing_purchases SET revoked_reason = NULL WHERE id = $1");
  await bad("UPDATE kubcode_accounts.billing_purchases SET revoked_reason = 'whim' WHERE id = $1");
  // Only a paid purchase can be revoked.
  const pending = await insertPurchase(billing, purchase(ws));
  await assert.rejects(
    db.pool.query("UPDATE kubcode_accounts.billing_purchases SET revoked_at = now(), revoked_reason = 'refunded' WHERE id = $1", [pending]),
    (e: { code?: string }) => e.code === "23514",
  );
  const idx = await db.pool.query("SELECT 1 FROM pg_indexes WHERE schemaname = 'kubcode_accounts' AND indexname = 'billing_purchases_payment_intent_idx'");
  assert.equal(idx.rowCount, 1);
  // The web reads the new columns (never Stripe ids) for the history labels.
  const cols = await db.pool.query(
    `SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'kubcode_app' AND table_name = 'billing_purchases' AND privilege_type = 'SELECT'
        AND column_name IN ('refunded_satang', 'dispute', 'revoked_at', 'revoked_reason', 'stripe_payment_intent_id')`,
  );
  assert.deepEqual(cols.rows.map((x) => x.column_name).sort(), ["dispute", "refunded_satang", "revoked_at", "revoked_reason"]);
  const upd = await db.pool.query(
    `SELECT 1 FROM information_schema.column_privileges
      WHERE grantee = 'kubcode_app' AND table_name = 'billing_purchases' AND privilege_type = 'UPDATE'`,
  );
  assert.equal(upd.rowCount, 0, "the web never writes purchases");
});
