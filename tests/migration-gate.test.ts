// Unit tests for the CI migration gate: the destructive-statement scanner and
// the ledger-based plan. No database access; fixtures are inline SQL.
import test from "node:test";
import assert from "node:assert/strict";
import { decideMigration, findDestructiveStatements } from "../lib/accounts/migration-gate";
import { loadMigrations, planMigrations, type Migration } from "../lib/accounts/migrate";

const keywords = (sql: string) => findDestructiveStatements(sql).map((f) => f.keyword);

// Data migrations the owner approves through the gate, with what the gate must flag.
const APPROVED_DATA_MIGRATIONS: Record<string, string[]> = {
  "0005_owner_flag": ["UPDATE"],
  // Widens two page_kind CHECKs to allow 'article': PostgreSQL can only drop
  // and re-add a CHECK, so the old constraints are dropped (no data touched).
  "0011_article_interactions": ["DROP", "DROP"],
};

test("every migration is additive except the listed data migrations", () => {
  for (const m of loadMigrations()) {
    if (m.version in APPROVED_DATA_MIGRATIONS) continue;
    assert.deepEqual(findDestructiveStatements(m.sql), [], m.version);
  }
});

test("each data migration is stopped by the gate for exactly its expected statements", () => {
  const byVersion = new Map(loadMigrations().map((m) => [m.version, m.sql]));
  for (const [version, expected] of Object.entries(APPROVED_DATA_MIGRATIONS)) {
    const sql = byVersion.get(version);
    assert.ok(sql, `${version} exists`);
    assert.deepEqual(keywords(sql), expected, version);
  }
});

test("additive patterns are not flagged: FK actions, comments, literals, privileges, policies, triggers", () => {
  const sql = `
    -- delete old rows? no: this comment mentions DROP and TRUNCATE only
    /* nested /* DROP TABLE x; */ still a comment */
    CREATE TABLE IF NOT EXISTS kubcode_accounts.page_comments (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE ON UPDATE NO ACTION,
      status text CHECK (status IN ('drop', 'delete', 'it''s updated')),
      deleted_at timestamptz,
      updated_at timestamptz,
      "drop" text
    );
    REVOKE ALL ON ALL TABLES IN SCHEMA kubcode_accounts FROM PUBLIC;
    GRANT SELECT, INSERT, UPDATE, DELETE ON kubcode_accounts.page_comments TO kubcode_app;
    CREATE POLICY p ON kubcode_accounts.page_comments FOR DELETE TO kubcode_app USING (true);
    CREATE TRIGGER t BEFORE INSERT OR UPDATE ON kubcode_accounts.page_comments FOR EACH ROW EXECUTE FUNCTION f();
    DO $$
    BEGIN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA kubcode_accounts FROM %I', 'anon');
      PERFORM 1 FROM kubcode_accounts.users FOR UPDATE;
    END
    $$;
    ALTER TYPE kubcode_accounts.kind ADD VALUE IF NOT EXISTS 'x';
    ALTER TABLE kubcode_accounts.page_comments ADD COLUMN IF NOT EXISTS body text;`;
  assert.deepEqual(findDestructiveStatements(sql), []);
});

test("destructive statements are flagged with their keyword", () => {
  const cases: Array<[string, string]> = [
    ["DROP TABLE kubcode_accounts.users;", "DROP"],
    ["ALTER TABLE kubcode_accounts.users DROP COLUMN status;", "DROP"],
    ["delete from kubcode_accounts.users where true;", "DELETE"],
    ["TRUNCATE kubcode_accounts.account_audit_events;", "TRUNCATE"],
    ["ALTER TABLE kubcode_accounts.users RENAME COLUMN status TO state;", "RENAME"],
    ["UPDATE kubcode_accounts.users SET status = 'suspended';", "UPDATE"],
    ["INSERT INTO t VALUES (1) ON CONFLICT (id) DO UPDATE SET v = 2;", "UPDATE"],
    ["ALTER TABLE kubcode_accounts.users ALTER COLUMN status TYPE varchar(8);", "ALTER COLUMN TYPE"],
    ["ALTER TABLE kubcode_accounts.users ALTER status SET DATA TYPE text;", "ALTER COLUMN TYPE"],
    ["ALTER TABLE kubcode_accounts.users DISABLE ROW LEVEL SECURITY;", "DISABLE ROW LEVEL SECURITY"],
    ["ALTER TABLE kubcode_accounts.users NO FORCE ROW LEVEL SECURITY;", "NO FORCE ROW LEVEL SECURITY"],
    ["CREATE OR REPLACE FUNCTION kubcode_accounts.f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;", "OR REPLACE"],
    ["ALTER TABLE kubcode_accounts.users SET SCHEMA public;", "SET SCHEMA"],
  ];
  for (const [sql, keyword] of cases) assert.deepEqual(keywords(sql), [keyword], sql);
});

test("destructive SQL inside a DO block body is still flagged", () => {
  const sql = "DO $body$\nBEGIN\n  DELETE FROM kubcode_accounts.account_link_intents;\nEND\n$body$;";
  assert.deepEqual(findDestructiveStatements(sql), [{ keyword: "DELETE", line: 3 }]);
});

test("findings carry 1-based line numbers and never SQL text", () => {
  const sql = "CREATE TABLE a (id int);\n\nDROP TABLE b;\nTRUNCATE c;";
  assert.deepEqual(findDestructiveStatements(sql), [
    { keyword: "DROP", line: 3 },
    { keyword: "TRUNCATE", line: 4 },
  ]);
});

const mig = (version: string, checksum: string): Migration => ({ version, sql: "SELECT 1;", checksum });

test("plan: unapplied versions are pending in order; applied ones are not", () => {
  const plan = planMigrations([mig("0001_a", "c1"), mig("0002_b", "c2"), mig("0003_c", "c3")], new Map([["0001_a", "c1"]]));
  assert.deepEqual(plan.pending.map((m) => m.version), ["0002_b", "0003_c"]);
  assert.deepEqual(plan.checksumMismatch, []);
  assert.deepEqual(plan.unknownApplied, []);
});

test("plan: an edited applied migration is a checksum mismatch", () => {
  const plan = planMigrations([mig("0001_a", "edited"), mig("0002_b", "c2")], new Map([["0001_a", "c1"]]));
  assert.deepEqual(plan.checksumMismatch, ["0001_a"]);
  assert.deepEqual(plan.pending.map((m) => m.version), ["0002_b"]);
});

test("plan: ledger versions missing from the repo are reported, not pending", () => {
  const plan = planMigrations([mig("0001_a", "c1")], new Map([["0001_a", "c1"], ["0002_other_branch", "x"]]));
  assert.deepEqual(plan.pending, []);
  assert.deepEqual(plan.unknownApplied, ["0002_other_branch"]);
});

test("plan: an empty ledger means every migration is pending", () => {
  const plan = planMigrations([mig("0001_a", "c1")], new Map());
  assert.deepEqual(plan.pending.map((m) => m.version), ["0001_a"]);
});

// ------------------------------------------------------- pipeline decision

const report = (pending: string[], destructive: string[] = [], extra: Partial<{ checksumMismatch: string[]; unknownApplied: string[] }> = {}) => ({
  pending,
  destructive: destructive.map((version) => ({ version, findings: [{ keyword: "DROP", line: 1 }] })),
  checksumMismatch: extra.checksumMismatch ?? [],
  unknownApplied: extra.unknownApplied ?? [],
});
const push = { event: "push", actor: "JK369x", owner: "JK369x", approval: "" };

test("decision: nothing pending deploys without migrating", () => {
  assert.deepEqual(decideMigration(report([]), push), { migrate: false, deploy: true, reason: "no pending migrations", warnings: [] });
});

test("decision: additive pending migrations migrate then deploy automatically", () => {
  const d = decideMigration(report(["0002_interactions"]), push);
  assert.equal(d.migrate, true);
  assert.equal(d.deploy, true);
});

test("decision: a destructive pending migration stops a push run", () => {
  const d = decideMigration(report(["0002_a", "0003_b"], ["0003_b"]), push);
  assert.equal(d.migrate, false);
  assert.equal(d.deploy, false);
  assert.match(d.reason, /approve 0003_b/);
});

test("decision: only the owner's manual run with the exact approval phrase unblocks it", () => {
  const plan = report(["0003_b", "0004_c"], ["0003_b", "0004_c"]);
  const ok = { event: "workflow_dispatch", actor: "JK369x", owner: "JK369x", approval: "approve 0003_b,0004_c" };
  assert.equal(decideMigration(plan, ok).migrate, true);
  for (const bad of [
    { ...ok, approval: "approve 0003_b" },
    { ...ok, approval: "approve 0004_c,0003_b " },
    { ...ok, approval: "yes" },
    { ...ok, actor: "someone-else" },
    { ...ok, event: "push" },
  ])
    assert.equal(decideMigration(plan, bad).deploy, false, JSON.stringify(bad));
});

test("decision: checksum drift never migrates or deploys, even when approved", () => {
  const d = decideMigration(report(["0002_a"], [], { checksumMismatch: ["0001_accounts"] }), {
    ...push,
    event: "workflow_dispatch",
    approval: "approve ",
  });
  assert.deepEqual([d.migrate, d.deploy], [false, false]);
  assert.match(d.reason, /0001_accounts/);
});

test("decision: ledger versions unknown to this checkout are a warning, not a block", () => {
  const d = decideMigration(report([], [], { unknownApplied: ["0002_other"] }), push);
  assert.equal(d.deploy, true);
  assert.deepEqual(d.warnings, ["ledger has versions not in this checkout: 0002_other"]);
});
