// Feature flag for central accounts. OFF unless KUBCODE_ACCOUNTS_ENABLED is
// exactly "true" and DATABASE_URL is a usable Postgres URL. An explicit enable
// with anything broken is reported as "broken" so callers fail closed instead
// of silently falling back to stateless login.
//
// Transport policy (resolvePgTransport): remote databases always use TLS with
// certificate + hostname verification. Plaintext is allowed only for a
// loopback host outside production, or in production with the explicit local
// fixture flag KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK=true (default false; never
// applies to a non-loopback host). URL parameters that could weaken TLS are
// refused. Results never echo the URL.

export type AccountsEnv = Record<string, string | undefined>;

export const PLAINTEXT_LOOPBACK_FLAG = "KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK";
// Optional, non-secret PEM CA bundle for providers whose server certificate is
// not signed by a public root (for example the Supabase root CA).
export const DB_CA_CERT_VAR = "KUBCODE_DB_CA_CERT";

export type TransportProblem = "database_url_malformed" | "database_url_insecure_tls" | "database_ca_malformed";

export type PgTransportConfig = {
  host: string;
  port: number;
  user: string;
  password: string | undefined;
  database: string;
  ssl: false | { rejectUnauthorized: true; ca?: string };
};

export type AccountsConfig =
  | { mode: "off" }
  | { mode: "broken"; reason: "flag_value" | "database_url_missing" | TransportProblem }
  | { mode: "on"; databaseUrl: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);
const VERIFYING_SSLMODES = new Set(["require", "verify-ca", "verify-full"]);
const PEM = /^\s*(-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----\s*)+$/;

export function resolvePgTransport(
  url: string,
  env: AccountsEnv,
): { ok: true; config: PgTransportConfig } | { ok: false; reason: TransportProblem } {
  const malformed = { ok: false, reason: "database_url_malformed" } as const;
  if (!/^[\x21-\x7e]+$/.test(url)) return malformed;
  let parsed: URL;
  let user: string;
  let password: string | undefined;
  let database: string;
  try {
    parsed = new URL(url);
    user = decodeURIComponent(parsed.username);
    password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    return malformed;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return malformed;
  const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1");
  if (!host || !user) return malformed;
  const port = parsed.port ? Number(parsed.port) : 5432;

  // Every TLS-related parameter must be a single verifying sslmode. Other
  // parameters are ignored: pg never sees the URL, only the fields below.
  const sslKeys = [...parsed.searchParams.keys()].filter((k) => /^ssl|^uselibpqcompat$/i.test(k));
  for (const key of sslKeys) {
    const values = parsed.searchParams.getAll(key);
    if (key !== "sslmode" || values.length !== 1 || !VERIFYING_SSLMODES.has(values[0]))
      return { ok: false, reason: "database_url_insecure_tls" };
  }

  const ca = env[DB_CA_CERT_VAR];
  if (ca !== undefined && ca !== "" && !PEM.test(ca)) return { ok: false, reason: "database_ca_malformed" };

  const plaintext =
    LOOPBACK.has(host) && (env.NODE_ENV !== "production" || env[PLAINTEXT_LOOPBACK_FLAG] === "true");
  const ssl = plaintext ? false : ca ? { rejectUnauthorized: true as const, ca } : { rejectUnauthorized: true as const };
  return { ok: true, config: { host, port, user, password, database: database || user, ssl } };
}

export function readAccountsConfig(env: AccountsEnv): AccountsConfig {
  const flag = env.KUBCODE_ACCOUNTS_ENABLED;
  if (flag === undefined || flag === "" || flag === "false") return { mode: "off" };
  if (flag !== "true") return { mode: "broken", reason: "flag_value" };
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") return { mode: "broken", reason: "database_url_missing" };
  const transport = resolvePgTransport(url, env);
  if (!transport.ok) return { mode: "broken", reason: transport.reason };
  return { mode: "on", databaseUrl: url };
}
