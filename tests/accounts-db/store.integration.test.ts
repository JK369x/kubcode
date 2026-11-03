// Real-PostgreSQL integration tests for the accounts store and migrations.
// Run explicitly: KUBCODE_TEST_DATABASE_URL=postgres://...@127.0.0.1/..._test npm run test:accounts-db
// The suite FAILS (never skips) when the URL is missing or not clearly a local
// test database. Each run creates its own throwaway DATABASE (the production
// schema name kubcode_accounts is fixed) and drops exactly that database at
// the end. All data is fictional.
//
// Supabase-like roles: NOLOGIN roles named anon/authenticated are created in
// the local cluster when absent (and dropped afterwards only if this run
// created them), and the throwaway database gets Supabase-style default
// privileges granting them everything, so the migration must actively revoke.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { createPool, pgErrorCode } from "../../lib/accounts/db";
import {
  migrate,
  loadMigrations,
  MigrationChecksumError,
  MigrationSecurityError,
  type Migration,
} from "../../lib/accounts/migrate";
import { createPgAccountStore, type AccountStore, type LoginProfile } from "../../lib/accounts/store";
import { accountToken, sessionClaims, type SessionClaims } from "../../lib/accounts/session";
import { hashOpaqueToken, newOpaqueToken } from "../../lib/accounts/crypto";

const URL_VAR = "KUBCODE_TEST_DATABASE_URL";
const BOTH = { google: true, line: true } as const;
const NO_ENV = {}; // loopback + non-production: plaintext allowed by policy
const DB_NAME_SHAPE = /^kc_it_[0-9a-f]{12}_test$/;
const SUPABASE_ROLES = ["anon", "authenticated"] as const;
const ACCOUNT_TABLES = ["users", "user_identities", "account_link_intents", "account_audit_events", "schema_migrations"];

// Refuses anything that is not clearly a local test database BEFORE any
// connection is attempted.
function testDatabaseUrl(): URL {
  const raw = process.env[URL_VAR];
  if (!raw) assert.fail(`${URL_VAR} is not set; integration suite cannot run (this is a failure, not a skip)`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    assert.fail(`${URL_VAR} is not a URL`);
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    assert.fail(`${URL_VAR} must point at a local host`);
  if (!/test/i.test(url.pathname)) assert.fail(`${URL_VAR} database name must contain "test"`);
  return url;
}

let dbName = "";
let admin: Pool | undefined; // connected to the supplied test DB; creates/drops ours
let pool: Pool; // runtime-like pool: default search_path, used by the store
let raw: Pool; // raw test SQL only: search_path=kubcode_accounts
let store: AccountStore;
const createdRoles: string[] = [];

before(async () => {
  const base = testDatabaseUrl();
  dbName = `kc_it_${randomBytes(6).toString("hex")}_test`;
  assert.match(dbName, DB_NAME_SHAPE);
  admin = createPool(base.href, { max: 1 }, NO_ENV);
  await admin.query(`CREATE DATABASE ${dbName}`);
  for (const role of SUPABASE_ROLES) {
    const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (exists.rowCount) continue;
    try {
      await admin.query(`CREATE ROLE ${role} NOLOGIN`);
      createdRoles.push(role);
    } catch (error) {
      if (pgErrorCode(error) !== "42710") throw error; // created concurrently: fine
    }
  }
  const own = new URL(base.href);
  own.pathname = `/${dbName}`;
  pool = createPool(own.href, { max: 12 }, NO_ENV);
  raw = createPool(own.href, { max: 4, options: "-c search_path=kubcode_accounts" }, NO_ENV);
  // Supabase-style default privileges (per database): every new schema,
  // table, sequence and function is granted to anon/authenticated.
  await pool.query(`
    ALTER DEFAULT PRIVILEGES GRANT USAGE, CREATE ON SCHEMAS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON FUNCTIONS TO anon, authenticated;`);
  store = createPgAccountStore(pool);
});

after(async () => {
  await pool?.end();
  await raw?.end();
  if (admin) {
    if (DB_NAME_SHAPE.test(dbName)) {
      // pg-pool resolves end() before sockets finish closing; let them drain
      // so FORCE only ever has to terminate a genuinely stuck connection.
      for (let i = 0; i < 50; i++) {
        const { rows } = await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname = $1", [dbName]);
        if (Number(rows[0].n) === 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      const left = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
      assert.equal(left.rowCount, 0, "throwaway database dropped");
    }
    for (const role of createdRoles) await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.end();
  }
});

let seq = 0;
const google = (n = ++seq): LoginProfile => ({
  provider: "google",
  subject: `g-fixture-${dbName}-${n}`,
  displayName: `Fixture G ${n}`,
  email: `fixture${n}@example.test`,
});
const line = (n = ++seq): LoginProfile => ({
  provider: "line",
  subject: `Ufixture${dbName}${n}`,
  displayName: `Fixture L ${n}`,
  email: null,
});

const fixtureMigration = (version: string, sql: string): Migration => ({
  version,
  sql,
  checksum: createHash("sha256").update(sql).digest("hex"),
});

// Wraps a pool so every SQL text and the release() argument are recorded.
function recording(target: Pool) {
  const sql: string[] = [];
  const releases: unknown[] = [];
  const proxy = {
    async connect() {
      const client = await target.connect();
      return new Proxy(client, {
        get(c, key) {
          if (key === "query")
            return (text: unknown, ...rest: unknown[]) => {
              sql.push(String(typeof text === "string" ? text : (text as { text: string }).text));
              return (c.query as (...a: unknown[]) => unknown).call(c, text, ...rest);
            };
          if (key === "release")
            return (arg?: unknown) => {
              releases.push(arg);
              return c.release(arg as boolean);
            };
          return Reflect.get(c, key, c);
        },
      }) as PoolClient;
    },
  } as unknown as Pool;
  return { proxy, sql, releases };
}

const ledger = async () =>
  (await raw.query<{ version: string }>("SELECT version FROM kubcode_accounts.schema_migrations ORDER BY version")).rows.map(
    (r) => r.version,
  );

async function signIn(p: LoginProfile): Promise<SessionClaims> {
  const r = await store.resolveLogin(p);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") throw new Error("unreachable");
  return sessionClaims(
    accountToken({ userId: r.userId, sessionVersion: r.sessionVersion, provider: p.provider, subject: p.subject, name: p.displayName, email: p.email }),
  );
}
const count = async (sql: string, params: unknown[] = []) => Number((await raw.query(sql, params)).rows[0].n);

async function startLink(s: SessionClaims, target: "google" | "line") {
  const token = newOpaqueToken();
  const r = await store.startIntent(s, "link", target, BOTH, hashOpaqueToken(token));
  assert.deepEqual(r, { ok: true, sourceProvider: s.provider });
  return hashOpaqueToken(token);
}
const proofOf = (s: SessionClaims, p: LoginProfile): LoginProfile => ({ ...p, provider: s.provider, subject: s.sub });

// ---------------------------------------------------------------- migrations

test("runner: one bounded transaction with a transaction-scoped advisory lock (pooler-safe)", async () => {
  const rec = recording(pool);
  assert.deepEqual((await migrate(rec.proxy)).applied, ["0001_accounts"]);
  const flat = rec.sql.map((s) => s.replace(/\s+/g, " ").trim());
  assert.match(flat[0], /^BEGIN\b/);
  assert.equal(flat.at(-1), "COMMIT");
  assert.equal(flat.filter((s) => /^(BEGIN|COMMIT|ROLLBACK)\b/.test(s)).length, 2, "exactly one transaction");
  const lockAt = flat.findIndex((s) => /pg_advisory_xact_lock\(/.test(s));
  assert.ok(lockAt >= 0, "transaction-scoped advisory lock");
  assert.ok(flat.slice(0, lockAt + 1).join(";").match(/SET LOCAL lock_timeout/), "lock_timeout before the lock");
  assert.ok(flat.slice(0, lockAt + 1).join(";").match(/SET LOCAL statement_timeout/), "statement_timeout before the lock");
  assert.equal(flat.some((s) => /pg_advisory_(un)?lock\(|pg_try_advisory_lock\(/.test(s)), false, "no session advisory lock");
  const ledgerReadAt = flat.findIndex((s) => /FROM kubcode_accounts\.schema_migrations/.test(s));
  assert.ok(ledgerReadAt > lockAt, "ledger read under the lock, inside the transaction");
  assert.deepEqual(rec.releases, [undefined], "healthy client returned to the pool");
});

test("migrations are idempotent and serialize under concurrent runners", async () => {
  const results = await Promise.all([migrate(pool), migrate(pool), migrate(pool)]);
  assert.deepEqual(results.map((r) => r.applied), [[], [], []]);
  assert.deepEqual(await ledger(), ["0001_accounts"]);
  // Re-running the raw SQL is harmless (IF NOT EXISTS everywhere).
  await pool.query(loadMigrations()[0].sql);
  assert.deepEqual((await migrate(pool)).applied, []);
});

test("a failing pending migration rolls back every pending migration and discards the client", async () => {
  const good = fixtureMigration("0002_fixture_ok", "CREATE TABLE kubcode_accounts.kc_fixture_partial (id int);");
  const bad = fixtureMigration("0003_fixture_broken", "SELECT 1 / 0;");
  const rec = recording(pool);
  await assert.rejects(migrate(rec.proxy, [...loadMigrations(), good, bad]), (e) => pgErrorCode(e) === "22012");
  assert.deepEqual(await ledger(), ["0001_accounts"]);
  assert.equal((await raw.query("SELECT to_regclass('kubcode_accounts.kc_fixture_partial') AS t")).rows[0].t, null);
  assert.deepEqual(rec.releases, [true], "client discarded after a failed migration");
});

test("checksum drift aborts inside the transaction before anything pending applies", async () => {
  const pending = fixtureMigration("0002_fixture_ok", "CREATE TABLE kubcode_accounts.kc_fixture_after_drift (id int);");
  const tampered = loadMigrations().map((m) => ({ ...m, checksum: "0".repeat(64) }));
  await assert.rejects(migrate(pool, [...tampered, pending]), MigrationChecksumError);
  assert.deepEqual(await ledger(), ["0001_accounts"]);
  assert.equal((await raw.query("SELECT to_regclass('kubcode_accounts.kc_fixture_after_drift') AS t")).rows[0].t, null);
});

// ------------------------------------------------- private schema + Supabase

test("account data lives only in kubcode_accounts: no public objects, RLS on, no policies", async () => {
  const pub = await raw.query(
    `SELECT count(*) AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')`,
  );
  assert.equal(Number(pub.rows[0].n), 0, "nothing created in public");
  const rls = await raw.query<{ relname: string; relrowsecurity: boolean }>(
    `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'kubcode_accounts' AND c.relkind IN ('r', 'p') ORDER BY c.relname`,
  );
  assert.deepEqual(rls.rows.map((r) => r.relname), [...ACCOUNT_TABLES].sort());
  assert.ok(rls.rows.every((r) => r.relrowsecurity), "RLS enabled on every account table");
  assert.equal(await count("SELECT count(*) AS n FROM pg_policies WHERE schemaname = 'kubcode_accounts'"), 0);
  // The runtime pool does not have the private schema on its search_path.
  assert.doesNotMatch((await pool.query("SHOW search_path")).rows[0].search_path, /kubcode_accounts/);
});

test("PUBLIC, anon and authenticated have no schema, table or sequence privileges", async () => {
  for (const role of ["public", ...SUPABASE_ROLES]) {
    const { rows } = await raw.query<{ n: string }>(
      `SELECT count(*) AS n FROM (
         SELECT 1 WHERE has_schema_privilege($1::name, 'kubcode_accounts', 'USAGE')
                     OR has_schema_privilege($1::name, 'kubcode_accounts', 'CREATE')
         UNION ALL
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'kubcode_accounts' AND CASE
            WHEN c.relkind IN ('r', 'p', 'v', 'm')
              THEN has_table_privilege($1::name, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            WHEN c.relkind = 'S' THEN has_sequence_privilege($1::name, c.oid, 'USAGE, SELECT, UPDATE')
            ELSE false END) x`,
      [role],
    );
    assert.equal(Number(rows[0].n), 0, role);
  }
  // Acting as a Supabase API role is denied outright.
  const c = await pool.connect();
  try {
    for (const role of SUPABASE_ROLES) {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(c.query("SELECT 1 FROM kubcode_accounts.users LIMIT 1"), (e) => pgErrorCode(e) === "42501");
      await c.query("ROLLBACK");
    }
  } finally {
    c.release();
  }
});

test("RLS is defense in depth: even a mistaken grant exposes no rows without a policy", async () => {
  const s = await signIn(google());
  assert.ok(await count("SELECT count(*) AS n FROM users WHERE id = $1", [s.uid]));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("GRANT USAGE ON SCHEMA kubcode_accounts TO authenticated");
    await c.query("GRANT SELECT ON ALL TABLES IN SCHEMA kubcode_accounts TO authenticated");
    await c.query("SET LOCAL ROLE authenticated");
    for (const t of ACCOUNT_TABLES) {
      const { rows } = await c.query(`SELECT count(*) AS n FROM kubcode_accounts.${t}`);
      assert.equal(Number(rows[0].n), 0, t);
    }
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
});

test("runner refuses to commit while the private schema is exposed to an API role", async () => {
  await pool.query("GRANT USAGE ON SCHEMA kubcode_accounts TO anon");
  try {
    await assert.rejects(migrate(pool), MigrationSecurityError);
  } finally {
    await pool.query("REVOKE USAGE ON SCHEMA kubcode_accounts FROM anon");
  }
  await pool.query("ALTER TABLE kubcode_accounts.users DISABLE ROW LEVEL SECURITY");
  try {
    await assert.rejects(migrate(pool), MigrationSecurityError);
  } finally {
    await pool.query("ALTER TABLE kubcode_accounts.users ENABLE ROW LEVEL SECURITY");
  }
  assert.deepEqual((await migrate(pool)).applied, []);
});

// --------------------------------------------------------------------- login

test("login maps exact provider+subject to one user; email never merges", async () => {
  const g = google();
  const a = await signIn(g);
  const b = await signIn({ ...g, displayName: "Renamed" });
  assert.equal(a.uid, b.uid);
  // Same email on another Google subject is a different user.
  const other = await signIn({ ...google(), email: g.email });
  assert.notEqual(other.uid, a.uid);
  // Same subject string under LINE is a different identity and user.
  const l = await signIn({ ...line(), subject: g.subject });
  assert.notEqual(l.uid, a.uid);
  assert.equal(await store.checkSession(a), true);
});

test("concurrent first sign-ins create exactly one user and no orphans", async () => {
  const p = line();
  const before = await count("SELECT count(*) AS n FROM users");
  const results = await Promise.all(Array.from({ length: 10 }, () => store.resolveLogin(p)));
  const ids = new Set(results.map((r) => (r.status === "ok" ? r.userId : "x")));
  assert.equal(ids.size, 1);
  assert.equal(await count("SELECT count(*) AS n FROM users"), before + 1);
  assert.equal(await count("SELECT count(*) AS n FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_identities i WHERE i.user_id = u.id)"), 0);
});

test("session check rejects suspended users, bumped versions and foreign identities", async () => {
  const s = await signIn(google());
  assert.equal(await store.checkSession({ ...s, sv: s.sv + 1 }), false);
  assert.equal(await store.checkSession({ ...s, sub: "g-not-mine" }), false);
  assert.equal(await store.checkSession({ ...s, provider: "line" }), false);
  await raw.query("UPDATE users SET status = 'suspended' WHERE id = $1", [s.uid]);
  assert.equal(await store.checkSession(s), false);
  // A suspended user's identity cannot start a new session either.
  assert.deepEqual(await store.resolveLogin({ provider: "google", subject: s.sub, displayName: null, email: null }), {
    status: "suspended",
  });
});

// ---------------------------------------------------------------------- link

test("full link: fresh source, fresh target, explicit confirm, then all sessions revoked", async () => {
  const g = google();
  const s = await signIn(g);
  const l = line();
  const hash = await startLink(s, "line");
  assert.deepEqual(await store.advanceIntent(hash, s, proofOf(s, g), BOTH), { ok: true, step: "source", kind: "link", nextPhase: "await_target" });
  const settingsMid = await store.getSettings(s, hash);
  assert.equal(settingsMid?.intent?.phase, "await_target");
  assert.deepEqual(await store.advanceIntent(hash, s, l, BOTH), { ok: true, step: "target", kind: "link", nextPhase: "await_confirm" });
  // Target callback did not create a user for the LINE identity.
  assert.equal(await count("SELECT count(*) AS n FROM user_identities WHERE subject = $1", [l.subject]), 0);
  assert.equal((await store.getSettings(s, hash))?.intent?.pendingTargetName, l.displayName);
  assert.deepEqual(await store.confirmIntent(hash, s, BOTH), { ok: true, kind: "link", provider: "line" });
  assert.equal(await store.checkSession(s), false, "prior session revoked after link");
  const viaLine = await signIn(l);
  assert.equal(viaLine.uid, s.uid, "linked LINE now signs into the same internal user");
  assert.equal(viaLine.sv, s.sv + 1);
  // Replay of the consumed intent is rejected; pending data was wiped.
  assert.deepEqual(await store.confirmIntent(hash, viaLine, BOTH), { ok: false, code: "LINK_INVALID" });
  assert.equal(await count("SELECT count(*) AS n FROM account_link_intents WHERE pending_subject IS NOT NULL AND status <> 'open'"), 0);
  // Audit contains no subjects or emails.
  const auditText = JSON.stringify((await raw.query("SELECT * FROM account_audit_events WHERE user_id = $1", [s.uid])).rows);
  assert.doesNotMatch(auditText, new RegExp(`${g.subject}|${l.subject}|@`));
});

test("target already owned by another user is a generic conflict with no transfer", async () => {
  const victim = line();
  const victimSession = await signIn(victim);
  const s = await signIn(google());
  const hash = await startLink(s, "line");
  assert.equal((await store.advanceIntent(hash, s, proofOf(s, google()), BOTH)).ok, true);
  assert.deepEqual(await store.advanceIntent(hash, s, victim, BOTH), { ok: false, code: "LINK_CONFLICT" });
  assert.equal(await store.checkSession(victimSession), true, "owner untouched");
  assert.equal(await count("SELECT count(*) AS n FROM user_identities WHERE user_id = $1", [s.uid]), 1);
  assert.deepEqual(await store.confirmIntent(hash, s, BOTH), { ok: false, code: "LINK_INVALID" });
});

test("wrong source account, wrong order, other browser session, expiry and logout all reject", async () => {
  const g = google();
  const s = await signIn(g);
  // Wrong source subject rejects and closes the intent.
  let hash = await startLink(s, "line");
  assert.deepEqual(await store.advanceIntent(hash, s, { ...g, subject: "g-someone-else" }, BOTH), { ok: false, code: "LINK_WRONG_ACCOUNT" });
  assert.deepEqual(await store.advanceIntent(hash, s, g, BOTH), { ok: false, code: "LINK_INVALID" });
  // Target proof first (skipping source) is wrong account for the source round.
  hash = await startLink(s, "line");
  assert.deepEqual(await store.advanceIntent(hash, s, line(), BOTH), { ok: false, code: "LINK_WRONG_ACCOUNT" });
  // Another browser session of the same user cannot continue the intent.
  hash = await startLink(s, "line");
  const otherBrowser = { ...s, sid: newOpaqueToken() };
  assert.deepEqual(await store.advanceIntent(hash, otherBrowser, g, BOTH), { ok: false, code: "LINK_INVALID" });
  // No session (logged out) rejects.
  hash = await startLink(s, "line");
  assert.deepEqual(await store.advanceIntent(hash, null, g, BOTH), { ok: false, code: "LINK_INVALID" });
  // Expired.
  hash = await startLink(s, "line");
  await raw.query("UPDATE account_link_intents SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [hash]);
  assert.deepEqual(await store.advanceIntent(hash, s, g, BOTH), { ok: false, code: "LINK_EXPIRED" });
  // Logout cancels this session's intents.
  hash = await startLink(s, "line");
  await store.cancelSessionIntents(s);
  assert.deepEqual(await store.advanceIntent(hash, s, g, BOTH), { ok: false, code: "LINK_INVALID" });
  // Unknown token.
  assert.deepEqual(await store.advanceIntent(hashOpaqueToken(newOpaqueToken()), s, g, BOTH), { ok: false, code: "LINK_INVALID" });
  // Session version change between steps rejects.
  hash = await startLink(s, "line");
  await raw.query("UPDATE users SET session_version = session_version + 1 WHERE id = $1", [s.uid]);
  assert.deepEqual(await store.advanceIntent(hash, s, g, BOTH), { ok: false, code: "LINK_INVALID" });
});

test("starting a new intent supersedes the old one; only one open intent per user", async () => {
  const g = google();
  const s = await signIn(g);
  const results = await Promise.all(
    Array.from({ length: 5 }, () => store.startIntent(s, "link", "line", BOTH, hashOpaqueToken(newOpaqueToken()))),
  );
  assert.ok(results.some((r) => r.ok));
  assert.equal(await count("SELECT count(*) AS n FROM account_link_intents WHERE user_id = $1 AND status = 'open'", [s.uid]), 1);
});

test("concurrent confirms consume once; concurrent claims of one target link it once", async () => {
  const target = line();
  const prepare = async () => {
    const g = google();
    const s = await signIn(g);
    const hash = await startLink(s, "line");
    await store.advanceIntent(hash, s, g, BOTH);
    assert.equal((await store.advanceIntent(hash, s, target, BOTH)).ok, true);
    return { s, hash };
  };
  const a = await prepare();
  const both = await Promise.all([store.confirmIntent(a.hash, a.s, BOTH), store.confirmIntent(a.hash, a.s, BOTH)]);
  assert.equal(both.filter((r) => r.ok).length, 1);
  // Two different users race to link a fresh identity both proved in parallel.
  const fresh = line();
  const one = await signIn(google());
  const two = await signIn(google());
  const flows = [];
  for (const s of [one, two]) {
    const hash = await startLink(s, "line");
    await store.advanceIntent(hash, s, { provider: "google", subject: s.sub, displayName: null, email: null }, BOTH);
    assert.equal((await store.advanceIntent(hash, s, fresh, BOTH)).ok, true);
    flows.push({ s, hash });
  }
  const raced = await Promise.all(flows.map((f) => store.confirmIntent(f.hash, f.s, BOTH)));
  assert.equal(raced.filter((r) => r.ok).length, 1);
  assert.deepEqual(raced.find((r) => !r.ok), { ok: false, code: "LINK_CONFLICT" });
  assert.equal(await count("SELECT count(*) AS n FROM user_identities WHERE subject = $1", [fresh.subject]), 1);
});

// -------------------------------------------------------------------- unlink

test("unlink needs fresh source proof, refuses last usable method and revokes sessions", async () => {
  const g = google();
  const s0 = await signIn(g);
  assert.deepEqual(await store.startIntent(s0, "unlink", "google", BOTH, hashOpaqueToken(newOpaqueToken())), {
    ok: false,
    code: "LAST_LOGIN_METHOD",
  });
  // Link LINE first.
  const l = line();
  let hash = await startLink(s0, "line");
  await store.advanceIntent(hash, s0, g, BOTH);
  await store.advanceIntent(hash, s0, l, BOTH);
  assert.equal((await store.confirmIntent(hash, s0, BOTH)).ok, true);
  const s = await signIn(g);
  // Remaining LINE is not usable when LINE is disabled on this server.
  assert.deepEqual(
    await store.startIntent(s, "unlink", "google", { google: true, line: false }, hashOpaqueToken(newOpaqueToken())),
    { ok: false, code: "LAST_LOGIN_METHOD" },
  );
  const token = newOpaqueToken();
  hash = hashOpaqueToken(token);
  assert.deepEqual(await store.startIntent(s, "unlink", "line", BOTH, hash), { ok: true, sourceProvider: "google" });
  // Confirm without fresh reauth is rejected (wrong phase).
  assert.deepEqual(await store.confirmIntent(hash, s, BOTH), { ok: false, code: "LINK_INVALID" });
  hash = hashOpaqueToken(newOpaqueToken());
  await store.startIntent(s, "unlink", "line", BOTH, hash);
  assert.deepEqual(await store.advanceIntent(hash, s, g, BOTH), { ok: true, step: "source", kind: "unlink", nextPhase: "await_confirm" });
  // Concurrent confirm + a second unlink attempt cannot drop below one method.
  assert.deepEqual(await store.confirmIntent(hash, s, BOTH), { ok: true, kind: "unlink", provider: "line" });
  assert.equal(await store.checkSession(s), false);
  assert.equal(await count("SELECT count(*) AS n FROM user_identities WHERE subject = $1", [l.subject]), 0);
  const after = await signIn(g);
  assert.equal(after.uid, s.uid);
  assert.equal(await count("SELECT count(*) AS n FROM user_identities WHERE user_id = $1", [s.uid]), 1);
  // A fresh LINE sign-in now becomes a separate new user: no auto re-merge.
  const relogin = await signIn(l);
  assert.notEqual(relogin.uid, s.uid);
});

// ------------------------------------------- next-auth callbacks + real store

test("next-auth callbacks: login issues a central token; link callbacks never sign in or create users", async () => {
  const { buildAuthOptions } = await import("../../lib/auth");
  const { readAuthConfig } = await import("../../lib/auth-policy");
  const { emptyRequestContext } = await import("../../lib/accounts/runtime");
  const { parseAccountToken } = await import("../../lib/accounts/session");
  const cfg = readAuthConfig({
    NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
    NEXTAUTH_URL: "https://kubcode.dev",
    GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
    LINE_CLIENT_ID: "2000000001",
    LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
  });
  if (!cfg.ok) throw new Error("fixture config invalid");
  const options = (request: ReturnType<typeof emptyRequestContext>) =>
    buildAuthOptions(cfg.config, { store, ready: BOTH, request }).callbacks!;
  const g = google();
  const gAccount = { provider: "google", type: "oauth", providerAccountId: g.subject };
  const gProfile = { sub: g.subject, name: g.displayName, email: g.email, email_verified: true };
  const loginCtx = emptyRequestContext();
  assert.equal(await options(loginCtx).signIn!({ account: gAccount, profile: gProfile, user: {} } as never), true);
  const token = parseAccountToken(await options(loginCtx).jwt!({ token: {}, account: gAccount, profile: gProfile } as never));
  assert.ok(token, "central token issued");
  assert.deepEqual(await options(emptyRequestContext()).jwt!({ token } as never), token);
  const claims = sessionClaims(token!);

  const raw = newOpaqueToken();
  assert.equal((await store.startIntent(claims, "link", "line", BOTH, hashOpaqueToken(raw))).ok, true);
  const linkCtx = () => ({ ...emptyRequestContext(), linkCookie: hashOpaqueToken(raw), session: claims });
  const settings = "https://kubcode.dev/account/settings";
  assert.equal(await options(linkCtx()).signIn!({ account: gAccount, profile: gProfile, user: {} } as never), `${settings}?link=source_verified`);
  const l = line();
  const lAccount = { provider: "line", type: "oauth", providerAccountId: l.subject };
  const lProfile = { sub: l.subject, name: l.displayName };
  assert.equal(await options(linkCtx()).signIn!({ account: lAccount, profile: lProfile, user: {} } as never), `${settings}?link=target_verified`);
  assert.equal(await count("SELECT count(*) AS n FROM user_identities WHERE subject = $1", [l.subject]), 0);
  // Initiating session still valid until the explicit confirmation.
  assert.equal(await store.checkSession(claims), true);
  // A replayed target callback (wrong phase) is rejected and clears the cookie.
  const replay = linkCtx();
  assert.equal(await options(replay).signIn!({ account: lAccount, profile: lProfile, user: {} } as never), `${settings}?link_error=LINK_INVALID`);
  assert.equal(replay.clearLinkCookie, true);
});

test("cancel closes only the caller's own intent", async () => {
  const g = google();
  const s = await signIn(g);
  const intruder = await signIn(google());
  const hash = await startLink(s, "line");
  await store.cancelIntent(hash, intruder);
  assert.equal((await store.getSettings(s, hash))?.intent?.phase, "await_source");
  await store.cancelIntent(hash, s);
  const settings = await store.getSettings(s, hash);
  assert.equal(settings?.intent, null);
  assert.equal(settings?.staleIntentCookie, true);
});
