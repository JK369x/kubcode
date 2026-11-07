// Per-user API keys for the settings page (docs/design/settings-keys.md §4).
// The web app only ever seals: secrets are written as envelope v1 ciphertext
// bound to their row, owner, kind and version, and are never read back
// (kubcode_app has no SELECT on envelope columns). Every transaction checks
// the session against the database, locks the member row, then sets
// kubcode.user_id so per-user RLS applies to every following query.
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { SessionClaims } from "../accounts/session";
import { getPool, withTransaction } from "../accounts/db";
import { lockMember } from "../accounts/member";
import { canUseKeys } from "./access";
import { sealSecret, type WrapKey } from "./envelope";
import { CURRENT_WRAP_KEY } from "./wrap-key";

type KindSpec = {
  /** Shape of the non-secret half (client id / app id); null = none allowed. */
  publicValue: RegExp | null;
  /** JSON field the secret is sealed under, read by the Rust Lambdas. */
  field: string;
  /** OAuth provider whose connections depend on these app credentials. */
  provider: "youtube" | "instagram" | null;
};

const KINDS = {
  youtube_oauth_client: {
    publicValue: /^[0-9]{6,30}-[a-z0-9]{8,64}\.apps\.googleusercontent\.com$/,
    field: "client_secret",
    provider: "youtube",
  },
  instagram_app: { publicValue: /^[0-9]{6,25}$/, field: "app_secret", provider: "instagram" },
  elevenlabs_api_key: { publicValue: null, field: "api_key", provider: null },
} satisfies Record<string, KindSpec>;

export type SecretKind = keyof typeof KINDS;
export const SECRET_KINDS = Object.keys(KINDS) as SecretKind[];

// Printable ASCII without spaces; 16+ characters so the last-4 hint never
// gives away a large share of the secret.
const SECRET_SHAPE = /^[\x21-\x7e]{16,512}$/;

export type KeyStoreErrorCode =
  | "NOT_SIGNED_IN"
  | "FORBIDDEN"
  | "INVALID_KIND"
  | "INVALID_PUBLIC_VALUE"
  | "INVALID_SECRET"
  | "NOT_FOUND"
  | "IN_USE"
  /** No wrap key configured yet, so nothing can be sealed. */
  | "NOT_READY";
export type Failure = { ok: false; code: KeyStoreErrorCode };

export type SecretMeta = {
  kind: SecretKind;
  publicValue: string | null;
  /** Last 4 characters of the secret. */
  hint: string | null;
  version: number;
  updatedAt: string;
};

export type ConnectionMeta = {
  id: string;
  provider: "youtube" | "instagram";
  /** kubcode's shared app or the member's own app (design §2a). */
  appSource: "kubcode" | "member";
  accountLabel: string | null;
  status: "active" | "needs_reconnect" | "revoking";
  tokenExpiresAt: string | null;
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
};

export type AuditEntry = { event: string; subject: string | null; actor: string; createdAt: string };

export type Overview = { ok: true; secrets: SecretMeta[]; connections: ConnectionMeta[]; audit: AuditEntry[] };

export type SaveSecretInput = { kind: string; publicValue?: string | null; secret: string };

export interface KeyStore {
  /** False until a wrap key exists; saves then return NOT_READY. */
  readonly sealing: boolean;
  overview(viewer: SessionClaims): Promise<Overview | Failure>;
  /** Saves a new key or replaces the existing one of the same kind. */
  saveSecret(viewer: SessionClaims, input: SaveSecretInput): Promise<{ ok: true; replaced: boolean; secret: SecretMeta } | Failure>;
  /**
   * Deletes a key. App credentials that connections depend on need
   * confirmDisconnect, which also removes those connections (and with them
   * the stored tokens). Revoking at the provider is the Lambda's job (slice 5).
   */
  deleteSecret(
    viewer: SessionClaims,
    kind: string,
    options?: { confirmDisconnect?: boolean },
  ): Promise<{ ok: true; disconnected: number } | Failure>;
}

/** Number of audit events the settings page shows. */
export const AUDIT_PAGE_SIZE = 20;

const fail = (code: KeyStoreErrorCode): Failure => ({ ok: false, code });
const isKind = (kind: string): kind is SecretKind => Object.hasOwn(KINDS, kind);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

type Validated = { kind: SecretKind; publicValue: string | null; secret: string };

function validate(input: SaveSecretInput): Validated | Failure {
  if (typeof input.kind !== "string" || !isKind(input.kind)) return fail("INVALID_KIND");
  const spec: KindSpec = KINDS[input.kind];
  const pub = typeof input.publicValue === "string" ? input.publicValue.trim() : "";
  if (spec.publicValue ? !spec.publicValue.test(pub) : pub !== "") return fail("INVALID_PUBLIC_VALUE");
  const secret = typeof input.secret === "string" ? input.secret.trim() : "";
  if (!SECRET_SHAPE.test(secret)) return fail("INVALID_SECRET");
  return { kind: input.kind, publicValue: spec.publicValue ? pub : null, secret };
}

// Session check + row lock on the member, then the per-user RLS scope.
// Who may use keys is decided by canUseKeys alone (owner-only in phase 1).
export type EnterFailure = { ok: false; code: "NOT_SIGNED_IN" | "FORBIDDEN" };

export async function enter(c: PoolClient, s: SessionClaims, youtubeReviewer = false): Promise<string | EnterFailure> {
  const member = await lockMember(c, s);
  if (!member) return { ok: false, code: "NOT_SIGNED_IN" };
  if (!youtubeReviewer && !canUseKeys(member)) return { ok: false, code: "FORBIDDEN" };
  await c.query("SELECT set_config('kubcode.user_id', $1, true)", [member.id]);
  return member.id;
}

const audit = (c: PoolClient, userId: string, event: string, subject: string) =>
  c.query(
    "INSERT INTO kubcode_accounts.secret_audit_events (user_id, event, subject, actor) VALUES ($1, $2, $3, 'user')",
    [userId, event, subject],
  );

type SecretRow = { kind: SecretKind; public_value: string | null; hint: string | null; version: number; updated_at: Date };
const secretMeta = (r: SecretRow): SecretMeta => ({
  kind: r.kind,
  publicValue: r.public_value,
  hint: r.hint,
  version: r.version,
  updatedAt: r.updated_at.toISOString(),
});
const SECRET_COLUMNS = "kind, public_value, hint, version, updated_at";

export function createPgKeyStore(pool: Pool, wrapKey: WrapKey | null): KeyStore {
  const tx = <T>(work: (c: PoolClient) => Promise<T>) => withTransaction(pool, work);

  return {
    sealing: wrapKey !== null,

    async overview(session) {
      return tx(async (c) => {
        const uid = await enter(c, session);
        if (typeof uid !== "string") return uid;
        const secrets = await c.query<SecretRow>(
          `SELECT ${SECRET_COLUMNS} FROM kubcode_accounts.user_secrets WHERE user_id = $1 ORDER BY kind`,
          [uid],
        );
        const connections = await c.query<{
          id: string;
          provider: ConnectionMeta["provider"];
          app_source: ConnectionMeta["appSource"];
          account_label: string | null;
          status: ConnectionMeta["status"];
          token_expires_at: Date | null;
          last_checked_at: Date | null;
          last_error_code: string | null;
        }>(
          `SELECT id, provider, app_source, account_label, status, token_expires_at, last_checked_at, last_error_code
             FROM kubcode_accounts.oauth_connections WHERE user_id = $1 ORDER BY provider, created_at`,
          [uid],
        );
        const events = await c.query<{ event: string; subject: string | null; actor: string; created_at: Date }>(
          `SELECT event, subject, actor, created_at FROM kubcode_accounts.secret_audit_events
            WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${AUDIT_PAGE_SIZE}`,
          [uid],
        );
        return {
          ok: true as const,
          secrets: secrets.rows.map(secretMeta),
          connections: connections.rows.map((r) => ({
            id: r.id,
            provider: r.provider,
            appSource: r.app_source,
            accountLabel: r.account_label,
            status: r.status,
            tokenExpiresAt: iso(r.token_expires_at),
            lastCheckedAt: iso(r.last_checked_at),
            lastErrorCode: r.last_error_code,
          })),
          audit: events.rows.map((r) => ({ event: r.event, subject: r.subject, actor: r.actor, createdAt: r.created_at.toISOString() })),
        };
      });
    },

    async saveSecret(session, input) {
      const v = validate(input);
      if ("ok" in v) return v;
      return tx(async (c) => {
        const uid = await enter(c, session);
        if (typeof uid !== "string") return uid;
        // Only an allowed member learns that saving is not open yet.
        if (!wrapKey) return fail("NOT_READY");
        const key = wrapKey;
        const existing = (
          await c.query<{ id: string; version: number }>(
            "SELECT id, version FROM kubcode_accounts.user_secrets WHERE user_id = $1 AND kind = $2 FOR UPDATE",
            [uid, v.kind],
          )
        ).rows[0];
        const id = existing?.id ?? randomUUID();
        const version = existing ? existing.version + 1 : 1;
        const plaintext = JSON.stringify({ [KINDS[v.kind].field]: v.secret });
        const envelope = sealSecret({ table: "user_secrets", rowId: id, userId: uid, kind: v.kind, version }, plaintext, key);
        const hint = v.secret.slice(-4);
        const saved = existing
          ? await c.query<SecretRow>(
              `UPDATE kubcode_accounts.user_secrets
                  SET public_value = $3, envelope = $4, key_slot = $5, hint = $6, version = $7, updated_at = now()
                WHERE id = $1 AND user_id = $2
            RETURNING ${SECRET_COLUMNS}`,
              [id, uid, v.publicValue, envelope, key.slot, hint, version],
            )
          : await c.query<SecretRow>(
              `INSERT INTO kubcode_accounts.user_secrets (id, user_id, kind, public_value, envelope, key_slot, hint, version)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING ${SECRET_COLUMNS}`,
              [id, uid, v.kind, v.publicValue, envelope, key.slot, hint, version],
            );
        await audit(c, uid, existing ? "secret_replaced" : "secret_saved", v.kind);
        return { ok: true as const, replaced: Boolean(existing), secret: secretMeta(saved.rows[0]) };
      });
    },

    async deleteSecret(session, kind, options = {}) {
      if (typeof kind !== "string" || !isKind(kind)) return fail("INVALID_KIND");
      return tx(async (c) => {
        const uid = await enter(c, session);
        if (typeof uid !== "string") return uid;
        const found = await c.query(
          "SELECT id FROM kubcode_accounts.user_secrets WHERE user_id = $1 AND kind = $2 FOR UPDATE",
          [uid, kind],
        );
        if (!found.rowCount) return fail("NOT_FOUND");
        const provider: KindSpec["provider"] = KINDS[kind].provider;
        let disconnected = 0;
        if (provider) {
          const using = await c.query<{ id: string }>(
            // Only connections made through the member's own app depend on these credentials.
            "SELECT id FROM kubcode_accounts.oauth_connections WHERE user_id = $1 AND provider = $2 AND app_source = 'member' FOR UPDATE",
            [uid, provider],
          );
          if (using.rowCount && !options.confirmDisconnect) return fail("IN_USE");
          for (const conn of using.rows) {
            await c.query("DELETE FROM kubcode_accounts.oauth_connections WHERE id = $1 AND user_id = $2", [conn.id, uid]);
            await audit(c, uid, "oauth_disconnected", provider);
            disconnected++;
          }
        }
        await c.query("DELETE FROM kubcode_accounts.user_secrets WHERE user_id = $1 AND kind = $2", [uid, kind]);
        await audit(c, uid, "secret_deleted", kind);
        return { ok: true as const, disconnected };
      });
    },
  };
}

export function getKeyStore(databaseUrl: string): KeyStore {
  return createPgKeyStore(getPool(databaseUrl), CURRENT_WRAP_KEY);
}

/** Only the signed-in member's shared-client YouTube connections are visible here. */
export async function reviewerChannels(url: string, session: SessionClaims) {
  return withTransaction(getPool(url), async c => {
    const uid = await enter(c, session, true);
    if (typeof uid !== "string") return null;
    const result = await c.query<{ id: string; label: string; status: ConnectionMeta["status"] }>(
      "SELECT id, account_label AS label, status FROM kubcode_accounts.oauth_connections WHERE user_id=$1 AND provider='youtube' AND app_source='kubcode' ORDER BY created_at", [uid]);
    return result.rows;
  });
}
