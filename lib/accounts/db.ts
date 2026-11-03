// Postgres plumbing: one lazily created pool per database URL, transactions
// on a single checked-out client, and fixed generic log codes. Never logs SQL
// text, parameters, connection strings or driver error messages.
//
// The URL is parsed by ./config (resolvePgTransport) and handed to pg as
// discrete fields only: pg would otherwise let parameters inside a
// connectionString override the verified TLS options. No startup-packet
// settings (statement_timeout etc.) are sent because transaction poolers such
// as Supabase Supavisor/PgBouncer reject or drop them; timeouts are applied
// with SET LOCAL inside each transaction instead.
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { resolvePgTransport, type AccountsEnv } from "./config";

export type Queryable = Pick<PoolClient, "query">;

// Server-side bound for every store transaction (transaction-scoped).
export const TRANSACTION_STATEMENT_TIMEOUT = "10s";

export class AccountsDbConfigError extends Error {
  constructor(code: "ACCOUNTS_DB_INSECURE_TLS" | "ACCOUNTS_DB_URL_MALFORMED") {
    super(code);
    this.name = "AccountsDbConfigError";
  }
}

const pools = new Map<string, Pool>();

export function createPool(
  connectionString: string,
  extra: Partial<PoolConfig> = {},
  env: AccountsEnv = process.env,
): Pool {
  const transport = resolvePgTransport(connectionString, env);
  if (!transport.ok)
    throw new AccountsDbConfigError(
      transport.reason === "database_url_malformed" ? "ACCOUNTS_DB_URL_MALFORMED" : "ACCOUNTS_DB_INSECURE_TLS",
    );
  const pool = new Pool({
    // Small serverless instances: few connections, none kept when idle.
    max: 2,
    min: 0,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
    // Client-side backstop if the server never answers.
    query_timeout: 15_000,
    application_name: "kubcode-accounts",
    ...extra,
    // Verified transport always wins; a connectionString would let pg
    // re-parse URL parameters over it, so it is never passed through.
    ...transport.config,
    connectionString: undefined,
  });
  // An idle client error must not crash the process or leak details.
  pool.on("error", () => console.error("[accounts] DB_POOL_ERROR"));
  return pool;
}

// The pool is shared infrastructure, not user state: it holds no identity.
export function getPool(connectionString: string): Pool {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = createPool(connectionString);
    pools.set(connectionString, pool);
  }
  return pool;
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query(`BEGIN; SET LOCAL statement_timeout = '${TRANSACTION_STATEMENT_TIMEOUT}'`);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

export function pgErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

export const isUniqueViolation = (error: unknown) => pgErrorCode(error) === "23505";

// Fixed operation code plus the SQLSTATE class only; nothing user-derived.
export function logDbFailure(operation: string, error: unknown): void {
  const op = /^[A-Z][A-Z0-9_]{0,40}$/.test(operation) ? operation : "UNKNOWN";
  const state = pgErrorCode(error);
  console.error(`[accounts] DB_${op}_FAILED${state ? ` SQLSTATE_${state.slice(0, 2)}` : ""}`);
}
