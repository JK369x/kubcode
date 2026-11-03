// Offline transport-policy tests for the accounts Postgres pool. No database
// is contacted: pools are created lazily and ended immediately. Every host,
// user and password below is fictional TEST DATA.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import {
  DB_CA_CERT_VAR,
  PLAINTEXT_LOOPBACK_FLAG,
  readAccountsConfig,
  resolvePgTransport,
} from "../lib/accounts/config";
import { createPool } from "../lib/accounts/db";

const SECRET = "FIXTURE-SECRET-pw";
const REMOTE_HOST = "db.fixture.example.test";
const REMOTE = `postgresql://fixture.user:${SECRET}%40x@${REMOTE_HOST}:6543/postgres`;
const LOCAL = `postgres://fixture:${SECRET}@127.0.0.1:5432/kubcode_fixture_test`;
const PROD = { NODE_ENV: "production" };
const FIXTURE_PEM = "-----BEGIN CERTIFICATE-----\nRklYVFVSRS1PTkxZ\n-----END CERTIFICATE-----\n";

const ok = (url: string, env: Record<string, string | undefined> = {}) => {
  const r = resolvePgTransport(url, env);
  if (!r.ok) assert.fail(`expected ok, got ${r.reason}`);
  return r.config;
};
const reason = (url: string, env: Record<string, string | undefined> = {}) => {
  const r = resolvePgTransport(url, env);
  assert.equal(r.ok, false, "expected rejection");
  assert.doesNotMatch(JSON.stringify(r), new RegExp(`${SECRET}|${REMOTE_HOST}`));
  return r.ok ? null : r.reason;
};

test("remote database: verified TLS by default, discrete fields, never a connectionString", () => {
  const cfg = ok(REMOTE);
  assert.deepEqual(cfg, {
    host: REMOTE_HOST,
    port: 6543,
    user: "fixture.user",
    password: `${SECRET}@x`,
    database: "postgres",
    ssl: { rejectUnauthorized: true },
  });
  assert.equal("connectionString" in cfg, false);
});

test("remote database stays verified under every accepted sslmode, env and flag", () => {
  for (const q of ["", "?sslmode=require", "?sslmode=verify-ca", "?sslmode=verify-full"])
    for (const env of [{}, PROD, { [PLAINTEXT_LOOPBACK_FLAG]: "true" }, { ...PROD, [PLAINTEXT_LOOPBACK_FLAG]: "true" }])
      assert.deepEqual(ok(`${REMOTE}${q}`, env).ssl, { rejectUnauthorized: true }, `${q} ${JSON.stringify(env)}`);
});

test("explicit insecure or file-reading TLS settings are refused, remote or loopback", () => {
  const bad = [
    "sslmode=disable",
    "sslmode=allow",
    "sslmode=prefer",
    "sslmode=no-verify",
    "sslmode=bogus",
    "SSLMODE=disable",
    "sslmode=require&sslmode=disable",
    "ssl=false",
    "ssl=0",
    "ssl=true",
    "sslrejectunauthorized=false",
    "sslrootcert=/tmp/fixture.crt",
    "sslcert=/tmp/fixture.crt",
    "sslkey=/tmp/fixture.key",
    "sslmode=require&uselibpqcompat=true",
  ];
  for (const base of [REMOTE, LOCAL])
    for (const q of bad) assert.equal(reason(`${base}?${q}`), "database_url_insecure_tls", q);
});

test("plaintext only for loopback outside production or with the explicit local flag", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    const url = `postgres://fixture:${SECRET}@${host}:5432/kubcode_fixture_test`;
    const cfg = ok(url);
    assert.equal(cfg.ssl, false, host);
    assert.equal(cfg.host, host === "[::1]" ? "::1" : host);
    assert.deepEqual(ok(url, PROD).ssl, { rejectUnauthorized: true }, `${host} production defaults to TLS`);
    assert.equal(ok(url, { ...PROD, [PLAINTEXT_LOOPBACK_FLAG]: "true" }).ssl, false, `${host} explicit flag`);
    for (const v of ["1", "TRUE", "yes", ""])
      assert.deepEqual(ok(url, { ...PROD, [PLAINTEXT_LOOPBACK_FLAG]: v }).ssl, { rejectUnauthorized: true }, v);
  }
  // Loopback look-alikes are remote.
  for (const host of ["127.0.0.1.fixture.example.test", "localhost.fixture.example.test", "10.0.0.5"])
    assert.deepEqual(ok(`postgres://u:p@${host}/db_test`).ssl, { rejectUnauthorized: true }, host);
});

test("optional non-secret CA bundle is used for verification; malformed CA fails closed", () => {
  assert.deepEqual(ok(REMOTE, { [DB_CA_CERT_VAR]: FIXTURE_PEM }).ssl, { rejectUnauthorized: true, ca: FIXTURE_PEM });
  assert.equal(reason(REMOTE, { [DB_CA_CERT_VAR]: "not a pem" }), "database_ca_malformed");
});

test("malformed URLs are rejected without echoing them", () => {
  for (const url of ["postgres://", `postgres://${REMOTE_HOST}/db`, `postgres://u:%E0%A4%A@${REMOTE_HOST}/db`, "mysql://u:p@h/db"])
    assert.equal(reason(url), "database_url_malformed", url);
});

test("accounts config: enabled with insecure TLS or bad CA is broken; off stays off", () => {
  const on = { KUBCODE_ACCOUNTS_ENABLED: "true" };
  const insecure = readAccountsConfig({ ...on, DATABASE_URL: `${REMOTE}?sslmode=disable` });
  assert.deepEqual(insecure, { mode: "broken", reason: "database_url_insecure_tls" });
  assert.deepEqual(readAccountsConfig({ ...on, DATABASE_URL: REMOTE, [DB_CA_CERT_VAR]: "x" }), {
    mode: "broken",
    reason: "database_ca_malformed",
  });
  assert.deepEqual(readAccountsConfig({ DATABASE_URL: `${REMOTE}?sslmode=disable` }), { mode: "off" });
  assert.deepEqual(readAccountsConfig({ ...on, DATABASE_URL: REMOTE }), { mode: "on", databaseUrl: REMOTE });
});

const opts = (p: { options: unknown }) => p.options as Record<string, unknown>;

test("createPool: small serverless pool, verified TLS that pg cannot override, no startup timeouts", async () => {
  const pool = createPool(`${REMOTE}?sslmode=require`, {}, {});
  try {
    const o = opts(pool);
    assert.equal(o.max, 2);
    assert.equal(o.min, 0);
    assert.ok(typeof o.idleTimeoutMillis === "number" && o.idleTimeoutMillis > 0 && o.idleTimeoutMillis <= 10_000);
    assert.ok(typeof o.connectionTimeoutMillis === "number" && o.connectionTimeoutMillis > 0);
    assert.equal(o.connectionString, undefined);
    // Startup-packet parameters such as statement_timeout break transaction poolers.
    assert.equal(o.statement_timeout, undefined);
    assert.deepEqual(o.ssl, { rejectUnauthorized: true });
    // What pg itself would use for a new connection from these options.
    const params = (new Client(o) as unknown as { connectionParameters: { ssl: unknown; host: string } })
      .connectionParameters;
    assert.deepEqual(params.ssl, { rejectUnauthorized: true });
    assert.equal(params.host, REMOTE_HOST);
  } finally {
    await pool.end();
  }
  const sized = createPool(LOCAL, { max: 12 }, {});
  assert.equal(sized.options.max, 12);
  assert.equal(opts(sized).ssl, false);
  await sized.end();
  // Caller overrides cannot downgrade TLS or smuggle in a connectionString.
  const sneaky = createPool(REMOTE, { ssl: false, connectionString: `${REMOTE}?sslmode=no-verify` }, {});
  assert.deepEqual(opts(sneaky).ssl, { rejectUnauthorized: true });
  assert.equal(opts(sneaky).connectionString, undefined);
  await sneaky.end();
});

test("createPool refuses insecure transport with a secret-free error", () => {
  for (const url of [`${REMOTE}?sslmode=no-verify`, "postgres://"]) {
    assert.throws(
      () => createPool(url, {}, {}),
      (error: Error) => {
        assert.match(error.message, /^ACCOUNTS_DB_(INSECURE_TLS|URL_MALFORMED)$/);
        assert.doesNotMatch(`${error.message}\n${error.stack}`, new RegExp(`${SECRET}|${REMOTE_HOST}`));
        return true;
      },
    );
  }
});

test("store SQL is explicitly schema-qualified (no reliance on search_path)", () => {
  const src = readFileSync(join(__dirname, "..", "lib", "accounts", "store.ts"), "utf8");
  const refs = [...src.matchAll(/(?<!FOR )\b(?:FROM|JOIN|INTO|UPDATE)\s+([A-Za-z_][\w.]*)/g)].map((m) => m[1]);
  assert.ok(refs.length >= 15, `expected many table references, saw ${refs.length}`);
  const unqualified = refs.filter((r) => !r.startsWith("kubcode_accounts."));
  assert.deepEqual(unqualified, []);
});
