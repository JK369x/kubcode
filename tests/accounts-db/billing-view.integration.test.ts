// The web host's read-only billing view (lib/billing/store.ts) as kubcode_app:
// own workspace only, no Stripe ids, standing from billing_entitlements.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { createPgBillingStore } from "../../lib/billing/store";
import { throwawayDb, type ThrowawayDb } from "./harness";

let db: ThrowawayDb;
let seq = 0;
before(async () => {
  db = await throwawayDb();
});
after(async () => db?.cleanup());

async function member(owner = false): Promise<{ s: SessionClaims; ws: string }> {
  const n = ++seq;
  const p = { provider: "google" as const, subject: `g-bv-${n}`, displayName: `V${n}`, email: `bv${n}@example.test` };
  const r = await createPgAccountStore(db.pool).resolveLogin(p);
  if (r.status !== "ok") throw new Error("seed");
  await db.pool.query("UPDATE kubcode_accounts.users SET is_owner = $2 WHERE id = $1", [r.userId, owner]);
  const ws = (await db.pool.query("INSERT INTO kubcode_accounts.workspaces (name) VALUES ('w') RETURNING id")).rows[0].id as string;
  await db.pool.query("INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [ws, r.userId]);
  return { s: sessionClaims(accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: p.subject, name: p.displayName, email: p.email })), ws };
}

async function channel(ws: string, live: boolean) {
  const id = (await db.pool.query("INSERT INTO kubcode_accounts.channels (workspace_id, platform, display_name) VALUES ($1, 'tiktok', 'c') RETURNING id", [ws])).rows[0].id;
  await db.pool.query(
    "INSERT INTO kubcode_accounts.channel_connections (channel_id, provider, provider_ref, status, revoked_at) VALUES ($1, 'zernio', $2, $3, $4)",
    [id, `acct-${id}`, live ? "active" : "revoked", live ? null : new Date()],
  );
  return id as string;
}

test("view: entitlement, active channels and paid history for the member's own workspace only", async () => {
  const a = await member();
  const b = await member();
  await channel(a.ws, true);
  await channel(a.ws, true);
  await channel(a.ws, false);
  const paidUntil = new Date("2026-12-13T05:00:00Z");
  await db.pool.query("INSERT INTO kubcode_accounts.billing_entitlements (workspace_id, slots, period_start, paid_until) VALUES ($1, 2, $2, $3)", [a.ws, new Date("2026-11-13T05:00:00Z"), paidUntil]);
  await db.pool.query(
    `INSERT INTO kubcode_accounts.billing_purchases (workspace_id, kind, slots, amount_satang, period_start, period_end, status, paid_at, payment_method, stripe_checkout_session_id)
     VALUES ($1, 'new', 2, 57800, '2026-11-13T05:00:00Z', $2, 'paid', now(), 'promptpay', 'cs_test_secretid1')`,
    [a.ws, paidUntil],
  );
  await db.pool.query("INSERT INTO kubcode_accounts.billing_entitlements (workspace_id, slots, paid_until) VALUES ($1, 9, $2)", [b.ws, paidUntil]);
  const store = createPgBillingStore(db.appPool);
  const v = (await store.view(a.s, new Date("2026-12-10T05:00:00Z")))!;
  assert.equal(v.workspaceId, a.ws);
  assert.equal(v.slots, 2);
  assert.equal(v.activeChannels, 2);
  assert.equal(v.standing, "active");
  assert.equal(v.reminder, "t3");
  assert.equal(v.purchases.length, 1);
  assert.deepEqual({ ...v.purchases[0], paidAt: null }, { kind: "new", slots: 2, amountSatang: 57800, status: "paid", paidAt: null, periodEnd: paidUntil.toISOString(), method: "promptpay", refundedSatang: 0, dispute: null, revoked: null });
  assert.ok(!JSON.stringify(v).includes("cs_test_"), "no Stripe ids reach the web host");
  const vb = (await store.view(b.s, new Date("2026-12-10T05:00:00Z")))!;
  assert.equal(vb.slots, 9);
  assert.equal(vb.activeChannels, 0);
});

test("view: owner is exempt; a stale session reads nothing", async () => {
  const o = await member(true);
  const store = createPgBillingStore(db.appPool);
  const v = (await store.view(o.s, new Date()))!;
  assert.equal(v.exempt, true);
  assert.equal(v.standing, "exempt");
  assert.equal(await store.view({ ...o.s, sv: o.s.sv + 1 }, new Date()), null);
});
