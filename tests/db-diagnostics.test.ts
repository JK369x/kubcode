// Unit tests for safe DB failure diagnostics used by the migration CLI in CI:
// errors become a fixed phase + code, and the migration URL shape check
// reports problems without ever echoing the URL or any part of it.
import test from "node:test";
import assert from "node:assert/strict";
import { checkMigrationUrlShape, classifyDbError } from "../lib/accounts/db-diagnostics";
import { AccountsDbConfigError } from "../lib/accounts/db";

const withCode = (code: string, message = "secret host db.example.internal user=postgres") =>
  Object.assign(new Error(message), { code });

test("network errors map to dns/connect phases with the node error code", () => {
  assert.deepEqual(classifyDbError(withCode("ENOTFOUND")), { phase: "dns", code: "ENOTFOUND" });
  assert.deepEqual(classifyDbError(withCode("EAI_AGAIN")), { phase: "dns", code: "EAI_AGAIN" });
  for (const code of ["ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"])
    assert.deepEqual(classifyDbError(withCode(code)), { phase: "connect", code });
});

test("an AggregateError from dual-stack connect uses its first coded cause", () => {
  const agg = new AggregateError([withCode("ENETUNREACH"), withCode("ETIMEDOUT")], "connect failed to 2001:db8::1");
  assert.deepEqual(classifyDbError(agg), { phase: "connect", code: "ENETUNREACH" });
});

test("TLS verification failures map to the tls phase", () => {
  for (const code of [
    "SELF_SIGNED_CERT_IN_CHAIN",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "CERT_HAS_EXPIRED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ])
    assert.deepEqual(classifyDbError(withCode(code)), { phase: "tls", code });
  assert.deepEqual(classifyDbError(new Error("The server does not support SSL connections")), {
    phase: "tls",
    code: "SERVER_NO_SSL",
  });
});

test("SQLSTATE classes map to auth/connect/query phases", () => {
  assert.deepEqual(classifyDbError(withCode("28P01")), { phase: "auth", code: "SQLSTATE_28P01" });
  assert.deepEqual(classifyDbError(withCode("28000")), { phase: "auth", code: "SQLSTATE_28000" });
  assert.deepEqual(classifyDbError(withCode("3D000")), { phase: "auth", code: "SQLSTATE_3D000" });
  assert.deepEqual(classifyDbError(withCode("08006")), { phase: "connect", code: "SQLSTATE_08006" });
  assert.deepEqual(classifyDbError(withCode("42P01")), { phase: "query", code: "SQLSTATE_42P01" });
  assert.deepEqual(classifyDbError(withCode("XX000", "Tenant or user not found")), {
    phase: "auth",
    code: "POOLER_TENANT_OR_USER_NOT_FOUND",
  });
});

test("pg client connection messages map to fixed codes", () => {
  assert.deepEqual(classifyDbError(new Error("timeout exceeded when trying to connect")), {
    phase: "connect",
    code: "CONNECT_TIMEOUT",
  });
  assert.deepEqual(classifyDbError(new Error("Connection terminated unexpectedly")), {
    phase: "connect",
    code: "CONNECTION_TERMINATED",
  });
});

test("config errors keep their fixed code", () => {
  assert.deepEqual(classifyDbError(new AccountsDbConfigError("ACCOUNTS_DB_INSECURE_TLS")), {
    phase: "config",
    code: "ACCOUNTS_DB_INSECURE_TLS",
  });
});

test("unknown errors never leak message text or odd codes", () => {
  const leak = "postgres://postgres.ref:hunter2@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
  for (const e of [new Error(leak), withCode(`weird ${leak}`, leak), "plain string " + leak, null, undefined]) {
    const out = classifyDbError(e);
    assert.deepEqual(out, { phase: "unknown", code: "UNKNOWN" });
    assert.ok(!JSON.stringify(out).includes("hunter2"));
  }
});

// ------------------------------------------------------------ URL shape

const POOLER = "postgresql://postgres.sgtyrndczwxijrubyyjw:p%40ss@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

test("a Session pooler URL for the expected project passes", () => {
  assert.deepEqual(checkMigrationUrlShape(POOLER, "sgtyrndczwxijrubyyjw"), { ok: true, problems: [] });
  assert.deepEqual(checkMigrationUrlShape(POOLER.replace("postgresql:", "postgres:")), { ok: true, problems: [] });
  assert.equal(checkMigrationUrlShape(POOLER.replace("aws-0-", "aws-1-")).ok, true);
});

test("the direct connection host is called out specifically", () => {
  const direct = "postgresql://postgres:pw@db.sgtyrndczwxijrubyyjw.supabase.co:5432/postgres";
  const r = checkMigrationUrlShape(direct, "sgtyrndczwxijrubyyjw");
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems, ["HOST_IS_DIRECT_CONNECTION", "USER_NOT_POOLER_FORMAT"]);
});

test("each shape problem has its own code", () => {
  const cases: Array<[string, string[]]> = [
    ["mysql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres", ["SCHEME_NOT_POSTGRES"]],
    ["postgresql://postgres.ref:pw@example.com:5432/postgres", ["HOST_NOT_SESSION_POOLER"]],
    ["postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres", ["PORT_NOT_5432"]],
    ["postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com/postgres", ["PORT_NOT_5432"]],
    ["postgresql://postgres.ref@aws-0-us-east-1.pooler.supabase.com:5432/postgres", ["PASSWORD_MISSING"]],
    ["not a url at all", ["URL_UNPARSEABLE"]],
    ["postgresql://postgres.%E0%A4%A:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres", ["URL_UNPARSEABLE"]],
  ];
  for (const [url, problems] of cases) assert.deepEqual(checkMigrationUrlShape(url).problems, problems, url);
});

test("a pooler user for a different project is a ref mismatch", () => {
  const other = POOLER.replace("postgres.sgtyrndczwxijrubyyjw", "postgres.someotherproject");
  assert.deepEqual(checkMigrationUrlShape(other, "sgtyrndczwxijrubyyjw").problems, ["PROJECT_REF_MISMATCH"]);
});

test("shape results never contain any part of the URL", () => {
  const url = "postgresql://postgres.leakyref:hunter2@db.leakyref.supabase.co:6543/leakydb";
  const out = JSON.stringify(checkMigrationUrlShape(url, "sgtyrndczwxijrubyyjw"));
  for (const part of ["leakyref", "hunter2", "leakydb", "6543"]) assert.ok(!out.includes(part), part);
});
