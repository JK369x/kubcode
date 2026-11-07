// Connect-flow state on the web host (docs/design/settings-keys.md §2, §2a):
// start (choose the app, create the intent), the callback check, failure,
// and disconnect. Only hashes of the state, cookie and session binding are
// stored; the PKCE verifier is sealed to its intent row. The code exchange
// itself happens in the Lambda, which is the only reader of envelopes.
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { SessionClaims } from "../accounts/session";
import { getPool, withTransaction } from "../accounts/db";
import { sealSecret, type WrapKey } from "./envelope";
import { enter } from "./store";
import { CURRENT_WRAP_KEY } from "./wrap-key";

export type Provider = "youtube" | "instagram";
export type AppSource = "kubcode" | "member";
export const PROVIDERS: readonly Provider[] = ["youtube", "instagram"];
export const isProvider = (v: unknown): v is Provider => v === "youtube" || v === "instagram";

/** The member's own app credentials for each provider (user_secrets.kind). */
export const MEMBER_APP_KIND: Record<Provider, string> = {
  youtube: "youtube_oauth_client",
  instagram: "instagram_app",
};

/** Intents live 10 minutes (design §2). */
export const INTENT_TTL_SECONDS = 600;

export type ConnectErrorCode =
  | "NOT_SIGNED_IN"
  | "FORBIDDEN"
  | "APP_NOT_CONFIGURED"
  | "NOT_READY"
  | "INTENT_INVALID"
  | "INTENT_EXPIRED"
  | "NOT_FOUND";
export type Failure = { ok: false; code: ConnectErrorCode };

export type StartInput = {
  provider: Provider;
  /** kubcode's shared YouTube client id (KUBCODE_YOUTUBE_CLIENT_ID), if configured. */
  kubcodeClientId: string | null;
  /** Random, single-use; only its SHA-256 is stored. */
  state: string;
  /** Value of the __Host-kubcode-oauth cookie; only its SHA-256 is stored. */
  cookieToken: string;
  /** PKCE verifier (YouTube); Business Login for Instagram has no PKCE. */
  verifier: string | null;
};

export interface ConnectStore {
  startConnect(
    session: SessionClaims,
    input: StartInput,
  ): Promise<{ ok: true; intentId: string; appSource: AppSource; clientId: string } | Failure>;
  beginExchange(
    session: SessionClaims,
    input: { provider: Provider; state: string; cookieToken: string },
  ): Promise<{ ok: true; intentId: string } | Failure>;
  failIntent(session: SessionClaims, intentId: string): Promise<{ ok: true } | Failure>;
  markRevoking(session: SessionClaims, connectionId: string): Promise<{ ok: true; provider: Provider } | Failure>;
  removeConnection(
    session: SessionClaims,
    connectionId: string,
    result: { revokeFailed: boolean },
  ): Promise<{ ok: true } | Failure>;
}

const fail = (code: ConnectErrorCode): Failure => ({ ok: false, code });
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();
// Binds an intent to this sign-in: another browser session of the same member
// (a different sid) cannot finish it.
const sessionBinding = (s: SessionClaims) => sha256(`kubcode-oauth-binding|${s.uid}|${s.sid}`);
const sameHash = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

const audit = (c: PoolClient, userId: string, event: string, subject: string) =>
  c.query(
    "INSERT INTO kubcode_accounts.secret_audit_events (user_id, event, subject, actor) VALUES ($1, $2, $3, 'user')",
    [userId, event, subject],
  );

const CLOSE = `phase = 'closed', closed_at = now(), verifier_envelope = NULL, key_slot = NULL`;

export function createPgConnectStore(pool: Pool, wrapKey: WrapKey | null, review = false): ConnectStore {
  const tx = <T>(work: (c: PoolClient) => Promise<T>) => withTransaction(pool, work);

  return {
    async startConnect(session, input) {
      return tx(async (c) => {
        const uid = await enter(c, session, review);
        if (typeof uid !== "string") return uid;
        if (review && input.provider !== "youtube") return fail("FORBIDDEN");
        const own = review ? undefined : (
          await c.query<{ public_value: string | null }>(
            "SELECT public_value FROM kubcode_accounts.user_secrets WHERE user_id = $1 AND kind = $2",
            [uid, MEMBER_APP_KIND[input.provider]],
          )
        ).rows[0];
        // The member's own app wins; kubcode's shared app is YouTube-only for now.
        let appSource: AppSource;
        let clientId: string;
        if (own?.public_value) [appSource, clientId] = ["member", own.public_value];
        else if (input.provider === "youtube" && input.kubcodeClientId) [appSource, clientId] = ["kubcode", input.kubcodeClientId];
        else return fail("APP_NOT_CONFIGURED");
        if (input.verifier !== null && !wrapKey) return fail("NOT_READY");

        // One open intent per member: starting again retires the previous one.
        await c.query(
          `UPDATE kubcode_accounts.oauth_connect_intents SET ${CLOSE}, status = 'expired'
            WHERE user_id = $1 AND status = 'open'`,
          [uid],
        );
        const id = randomUUID();
        const verifierEnvelope =
          input.verifier === null
            ? null
            : sealSecret({ table: "oauth_connect_intents", rowId: id, userId: uid, kind: input.provider, version: 1 }, input.verifier, wrapKey!);
        await c.query(
          `INSERT INTO kubcode_accounts.oauth_connect_intents
             (id, user_id, provider, state_hash, cookie_hash, session_binding_hash, verifier_envelope, key_slot, app_source, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(secs => $10))`,
          [
            id,
            uid,
            input.provider,
            sha256(input.state),
            sha256(input.cookieToken),
            sessionBinding(session),
            verifierEnvelope,
            verifierEnvelope ? wrapKey!.slot : null,
            appSource,
            INTENT_TTL_SECONDS,
          ],
        );
        await audit(c, uid, "oauth_connect_started", input.provider);
        return { ok: true as const, intentId: id, appSource, clientId };
      });
    },

    async beginExchange(session, input) {
      return tx(async (c) => {
        const uid = await enter(c, session, review);
        if (typeof uid !== "string") return uid;
        // RLS limits this to the session's own intents.
        const row = (
          await c.query<{ id: string; provider: string; cookie_hash: Buffer; session_binding_hash: Buffer; phase: string; status: string; live: boolean }>(
            `SELECT id, provider, cookie_hash, session_binding_hash, phase, status, expires_at > now() AS live
               FROM kubcode_accounts.oauth_connect_intents WHERE state_hash = $1 FOR UPDATE`,
            [sha256(input.state)],
          )
        ).rows[0];
        if (
          !row ||
          row.status !== "open" ||
          row.phase !== "await_callback" ||
          row.provider !== input.provider ||
          !sameHash(row.cookie_hash, sha256(input.cookieToken)) ||
          !sameHash(row.session_binding_hash, sessionBinding(session))
        )
          return fail("INTENT_INVALID");
        if (!row.live) {
          await c.query(`UPDATE kubcode_accounts.oauth_connect_intents SET ${CLOSE}, status = 'expired' WHERE id = $1`, [row.id]);
          return fail("INTENT_EXPIRED");
        }
        await c.query("UPDATE kubcode_accounts.oauth_connect_intents SET phase = 'exchanging' WHERE id = $1", [row.id]);
        return { ok: true as const, intentId: row.id };
      });
    },

    async failIntent(session, intentId) {
      return tx(async (c) => {
        const uid = await enter(c, session, review);
        if (typeof uid !== "string") return uid;
        const closed = await c.query<{ provider: string }>(
          `UPDATE kubcode_accounts.oauth_connect_intents SET ${CLOSE}, status = 'failed'
            WHERE id = $1 AND user_id = $2 AND phase <> 'closed' RETURNING provider`,
          [intentId, uid],
        );
        if (closed.rows[0]) await audit(c, uid, "oauth_connect_failed", closed.rows[0].provider);
        return { ok: true as const };
      });
    },

    async markRevoking(session, connectionId) {
      return tx(async (c) => {
        const uid = await enter(c, session, review);
        if (typeof uid !== "string") return uid;
        const r = await c.query<{ provider: Provider }>(
          `UPDATE kubcode_accounts.oauth_connections SET status = 'revoking', updated_at = now()
            WHERE id = $1 AND user_id = $2 AND (NOT $3::boolean OR (provider = 'youtube' AND app_source = 'kubcode')) RETURNING provider`,
          [connectionId, uid, review],
        );
        return r.rows[0] ? { ok: true as const, provider: r.rows[0].provider } : fail("NOT_FOUND");
      });
    },

    async removeConnection(session, connectionId, result) {
      return tx(async (c) => {
        const uid = await enter(c, session, review);
        if (typeof uid !== "string") return uid;
        const r = await c.query<{ provider: string }>(
          "DELETE FROM kubcode_accounts.oauth_connections WHERE id = $1 AND user_id = $2 AND (NOT $3::boolean OR (provider = 'youtube' AND app_source = 'kubcode')) RETURNING provider",
          [connectionId, uid, review],
        );
        if (!r.rows[0]) return fail("NOT_FOUND");
        await audit(c, uid, "oauth_disconnected", r.rows[0].provider);
        if (result.revokeFailed) await audit(c, uid, "oauth_revoke_failed", r.rows[0].provider);
        return { ok: true as const };
      });
    },
  };
}

export function getConnectStore(databaseUrl: string, review = false): ConnectStore {
  return createPgConnectStore(getPool(databaseUrl), CURRENT_WRAP_KEY, review);
}
