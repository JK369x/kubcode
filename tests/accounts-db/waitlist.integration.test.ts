// Real-PostgreSQL tests for the "แจ้งฉันเมื่อเปิด" waitlist (migration 0012).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { createPgAccountStore } from "../../lib/accounts/store";
import { createPgWaitlistStore, WAITLIST_TOGGLES_PER_HOUR, type WaitlistStore } from "../../lib/waitlist/store";
import { throwawayDb, type ThrowawayDb } from "./harness";

let db: ThrowawayDb;
let store: WaitlistStore;
let seq = 0;

before(async () => {
  db = await throwawayDb();
  store = createPgWaitlistStore(db.appPool);
});
after(async () => db?.cleanup());

async function member(owner = false): Promise<SessionClaims> {
  const n = ++seq;
  const profile = { provider: "google" as const, subject: `g-wl-${n}`, displayName: `M${n}`, email: `wl${n}@example.test` };
  const r = await createPgAccountStore(db.pool).resolveLogin(profile);
  if (r.status !== "ok") throw new Error("login failed");
  await db.pool.query("UPDATE kubcode_accounts.users SET is_owner = $2 WHERE id = $1", [r.userId, owner]);
  return sessionClaims(accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: "google", subject: profile.subject, name: profile.displayName, email: profile.email }));
}

const PACK = { kind: "plan", id: "skill-pack" } as const;
const FB = { kind: "roadmap", id: "facebook" } as const;

test("toggle joins then leaves; joined() lists the member's rows only", async () => {
  const a = await member();
  const b = await member();
  assert.deepEqual(await store.toggle(a, PACK), { ok: true, joined: true });
  assert.deepEqual(await store.toggle(a, FB), { ok: true, joined: true });
  assert.deepEqual(await store.toggle(b, PACK), { ok: true, joined: true });
  assert.deepEqual(await store.joined(a), [PACK, FB]);
  assert.deepEqual(await store.toggle(a, PACK), { ok: true, joined: false });
  assert.deepEqual(await store.joined(a), [FB]);
});

test("parallel joins of the same target leave exactly one row (primary key + member lock)", async () => {
  const a = await member();
  const results = await Promise.all([store.toggle(a, { kind: "plan", id: "social-skill" }), store.toggle(a, { kind: "plan", id: "social-skill" })]);
  const rows = await db.pool.query("SELECT count(*)::int AS n FROM kubcode_accounts.plan_waitlist WHERE user_id = $1 AND target_id = 'social-skill'", [a.uid]);
  // Serialized by the member lock: one join, one leave.
  assert.deepEqual(results.map((r) => r.ok && r.joined).sort(), [false, true]);
  assert.equal(rows.rows[0].n, 0);
});

test("hourly toggle limit", async () => {
  const a = await member();
  for (let i = 0; i < WAITLIST_TOGGLES_PER_HOUR; i++) assert.equal((await store.toggle(a, FB)).ok, true);
  assert.deepEqual(await store.toggle(a, FB), { ok: false, code: "RATE_LIMITED" });
});

test("counts are owner only", async () => {
  const owner = await member(true);
  const m = await member();
  assert.deepEqual(await store.counts(m), { ok: false, code: "FORBIDDEN" });
  const r = await store.counts(owner);
  assert.ok(r.ok);
  const pack = r.counts.find((c) => c.kind === "plan" && c.id === "skill-pack");
  assert.ok(pack && pack.members >= 1);
});

test("a stale session cannot write", async () => {
  const a = await member();
  assert.deepEqual(await store.toggle({ ...a, sv: a.sv + 1 }, PACK), { ok: false, code: "NOT_SIGNED_IN" });
});

test("0012: RLS on, runtime role has no UPDATE, API roles have nothing", async () => {
  const rls = await db.pool.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('plan_waitlist', 'waitlist_toggles') ORDER BY 1");
  assert.deepEqual(rls.rows.map((r) => r.relrowsecurity), [true, true]);
  const priv = await db.pool.query(
    "SELECT has_table_privilege('kubcode_app', 'kubcode_accounts.plan_waitlist', 'UPDATE') AS upd, has_table_privilege('anon', 'kubcode_accounts.plan_waitlist', 'SELECT') AS anon",
  );
  assert.deepEqual(priv.rows[0], { upd: false, anon: false });
  await assert.rejects(db.pool.query("INSERT INTO kubcode_accounts.plan_waitlist (user_id, target_kind, target_id) VALUES (gen_random_uuid(), 'plan', 'Bad Id')"));
});
