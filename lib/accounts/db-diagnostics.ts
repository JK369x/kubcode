// Safe diagnostics for database failures in operator/CI output. Everything
// returned here is a fixed phase plus a fixed or allow-listed code: never an
// error message, host, port, user, database name or any part of a URL.
import { AccountsDbConfigError } from "./db";

export type DbFailurePhase = "config" | "dns" | "connect" | "tls" | "auth" | "query" | "unknown";
export type DbFailure = { phase: DbFailurePhase; code: string };

const DNS = new Set(["ENOTFOUND", "EAI_AGAIN"]);
const CONNECT = new Set(["ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE"]);
const TLS = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_UNTRUSTED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);
const SQLSTATE = /^(?:[0-9][0-9A-Z]{4}|(?:XX|HV|P0|F0)[0-9A-Z]{3})$/;

// pg / pooler messages without a usable code. Matched internally only.
const MESSAGES: Array<[RegExp, DbFailure]> = [
  [/does not support SSL/i, { phase: "tls", code: "SERVER_NO_SSL" }],
  [/timeout exceeded when trying to connect/i, { phase: "connect", code: "CONNECT_TIMEOUT" }],
  [/Connection terminated/i, { phase: "connect", code: "CONNECTION_TERMINATED" }],
  [/tenant or user not found/i, { phase: "auth", code: "POOLER_TENANT_OR_USER_NOT_FOUND" }],
];

const UNKNOWN: DbFailure = { phase: "unknown", code: "UNKNOWN" };

function fromCode(code: string): DbFailure | null {
  if (DNS.has(code)) return { phase: "dns", code };
  if (CONNECT.has(code)) return { phase: "connect", code };
  if (TLS.has(code) || /^ERR_SSL_[A-Z0-9_]{1,60}$/.test(code)) return { phase: "tls", code };
  if (SQLSTATE.test(code)) {
    const cls = code.slice(0, 2);
    const phase: DbFailurePhase = cls === "28" || code === "3D000" ? "auth" : cls === "08" ? "connect" : "query";
    return { phase, code: `SQLSTATE_${code}` };
  }
  return null;
}

export function classifyDbError(error: unknown): DbFailure {
  if (error instanceof AccountsDbConfigError) return { phase: "config", code: error.message };
  if (typeof error !== "object" || error === null) return UNKNOWN;
  const message = error instanceof Error ? error.message : "";
  // Supavisor reports some auth failures as XX000; the message is more precise.
  for (const [pattern, failure] of MESSAGES) if (pattern.test(message)) return failure;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") {
    const known = fromCode(code);
    if (known) return known;
  }
  // Dual-stack connect (autoSelectFamily) wraps per-address failures.
  const causes = (error as { errors?: unknown }).errors;
  if (Array.isArray(causes))
    for (const cause of causes) {
      const inner = classifyDbError(cause);
      if (inner.phase !== "unknown") return inner;
    }
  return UNKNOWN;
}

// --------------------------------------------------------- URL shape check

export type UrlShapeProblem =
  | "URL_UNPARSEABLE"
  | "SCHEME_NOT_POSTGRES"
  | "HOST_IS_DIRECT_CONNECTION"
  | "HOST_NOT_SESSION_POOLER"
  | "PORT_NOT_5432"
  | "USER_NOT_POOLER_FORMAT"
  | "PROJECT_REF_MISMATCH"
  | "PASSWORD_MISSING";

export const URL_SHAPE_HINTS: Record<UrlShapeProblem, string> = {
  URL_UNPARSEABLE: "not a valid URL; percent-encode special characters in the password",
  SCHEME_NOT_POSTGRES: "scheme must be postgres:// or postgresql://",
  HOST_IS_DIRECT_CONNECTION:
    "this is the Direct connection host (IPv6-only on the Free plan, unreachable from GitHub runners); use the Session pooler URI",
  HOST_NOT_SESSION_POOLER: "host must be the Supabase Session pooler (*.pooler.supabase.com)",
  PORT_NOT_5432: "port must be 5432 (Session pooler); 6543 is the Transaction pooler",
  USER_NOT_POOLER_FORMAT: 'pooler user must be "postgres.<project-ref>"',
  PROJECT_REF_MISMATCH: "the user's project ref is not the kubcode project",
  PASSWORD_MISSING: "password is missing",
};

// Expected shape of MIGRATION_DATABASE_URL: Supabase Session pooler for the
// kubcode project. Returns problem codes only; never any part of the URL.
export function checkMigrationUrlShape(raw: string, expectedRef?: string): { ok: boolean; problems: UrlShapeProblem[] } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, problems: ["URL_UNPARSEABLE"] };
  }
  const problems: UrlShapeProblem[] = [];
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") problems.push("SCHEME_NOT_POSTGRES");
  const host = url.hostname.toLowerCase();
  if (/^db\.[a-z0-9]+\.supabase\.co$/.test(host)) problems.push("HOST_IS_DIRECT_CONNECTION");
  else if (!host.endsWith(".pooler.supabase.com")) problems.push("HOST_NOT_SESSION_POOLER");
  if (url.port !== "5432") problems.push("PORT_NOT_5432");
  let user: string;
  try {
    user = decodeURIComponent(url.username);
  } catch {
    return { ok: false, problems: ["URL_UNPARSEABLE"] };
  }
  if (!user.startsWith("postgres.") || user.length <= "postgres.".length) problems.push("USER_NOT_POOLER_FORMAT");
  else if (expectedRef && user !== `postgres.${expectedRef}`) problems.push("PROJECT_REF_MISMATCH");
  if (!url.password) problems.push("PASSWORD_MISSING");
  return { ok: problems.length === 0, problems };
}
