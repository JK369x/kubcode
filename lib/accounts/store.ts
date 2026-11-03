// SQL store for central accounts. Every multi-step operation runs in one
// transaction on one checked-out client, locks the user row before the intent
// row (fixed order, no deadlock cycles) and relies on UNIQUE constraints for
// races. Decisions come from ./rules; this file only loads, locks and writes.
// Every table is schema-qualified (kubcode_accounts.*): transaction poolers
// do not preserve session search_path, so nothing may depend on it.
import type { Pool, PoolClient } from "pg";
import type { AuthProviderId, AuthReadiness } from "../auth-policy";
import { getPool, isUniqueViolation, withTransaction } from "./db";
import {
  INTENT_TTL_SECONDS,
  canStartLink,
  canStartUnlink,
  checkIntentBinding,
  evaluateCallbackProof,
  evaluateConfirm,
  type Failure,
  type IdentityRef,
  type IntentKind,
  type IntentPhase,
  type IntentSnapshot,
  type UserSnapshot,
} from "./rules";
import { hashOpaqueToken } from "./crypto";
import type { SessionClaims } from "./session";

export type LoginProfile = {
  provider: AuthProviderId;
  subject: string;
  displayName: string | null;
  // Verified Google email only; always null for LINE.
  email: string | null;
};

export type LoginResult = { status: "ok"; userId: string; sessionVersion: number } | { status: "suspended" };

export type SettingsIdentity = {
  provider: AuthProviderId;
  displayName: string | null;
  email: string | null;
  linkedAt: string;
  current: boolean;
};

export type SettingsIntent = {
  kind: IntentKind;
  phase: Exclude<IntentPhase, "closed">;
  sourceProvider: AuthProviderId;
  targetProvider: AuthProviderId;
  pendingTargetName: string | null;
  expiresAt: string;
};

export type SettingsData = {
  identities: SettingsIdentity[];
  intent: SettingsIntent | null;
  // True when a link cookie was sent but does not match a usable intent.
  staleIntentCookie: boolean;
};

export type AdvanceResult =
  | { ok: true; step: "source" | "target"; kind: IntentKind; nextPhase: Exclude<IntentPhase, "closed"> }
  | Failure;

export interface AccountStore {
  resolveLogin(profile: LoginProfile): Promise<LoginResult>;
  checkSession(session: SessionClaims): Promise<boolean>;
  getSettings(session: SessionClaims, linkTokenHash: Buffer | null): Promise<SettingsData | null>;
  startIntent(
    session: SessionClaims,
    kind: IntentKind,
    provider: AuthProviderId,
    ready: AuthReadiness,
    tokenHash: Buffer,
  ): Promise<{ ok: true; sourceProvider: AuthProviderId } | Failure>;
  advanceIntent(
    tokenHash: Buffer,
    session: SessionClaims | null,
    proof: LoginProfile,
    ready: AuthReadiness,
  ): Promise<AdvanceResult>;
  confirmIntent(
    tokenHash: Buffer,
    session: SessionClaims,
    ready: AuthReadiness,
  ): Promise<{ ok: true; kind: IntentKind; provider: AuthProviderId } | Failure>;
  cancelIntent(tokenHash: Buffer, session: SessionClaims | null): Promise<void>;
  cancelSessionIntents(session: SessionClaims): Promise<void>;
}

type IntentRow = {
  id: string;
  kind: IntentKind;
  phase: IntentPhase;
  status: IntentSnapshot["status"];
  expired: boolean;
  user_id: string;
  session_binding_hash: Buffer;
  session_version: number;
  source_provider: AuthProviderId | null;
  source_subject: string | null;
  target_provider: AuthProviderId;
  target_identity_id: string | null;
  pending_subject: string | null;
  pending_display_name: string | null;
  pending_email: string | null;
  expires_at: Date;
};

const snapshot = (r: IntentRow): IntentSnapshot => ({
  kind: r.kind,
  phase: r.phase,
  status: r.status,
  expired: r.expired,
  userId: r.user_id,
  sessionBindingHash: r.session_binding_hash,
  sessionVersion: r.session_version,
  sourceProvider: r.source_provider,
  sourceSubject: r.source_subject,
  targetProvider: r.target_provider,
});

const INTENT_SELECT = `
  SELECT li.id, li.kind, li.phase, li.status, (li.expires_at <= now()) AS expired, li.user_id,
         li.session_binding_hash, li.session_version, src.provider AS source_provider,
         src.subject AS source_subject, li.target_provider, li.target_identity_id,
         li.pending_subject, li.pending_display_name, li.pending_email, li.expires_at
    FROM kubcode_accounts.account_link_intents li
    LEFT JOIN kubcode_accounts.user_identities src ON src.id = li.source_identity_id
   WHERE li.token_hash = $1`;

const WIPE = `phase = 'closed', closed_at = now(), pending_subject = NULL,
              pending_display_name = NULL, pending_email = NULL`;

async function audit(c: PoolClient, userId: string | null, event: string, provider: AuthProviderId | null) {
  await c.query("INSERT INTO kubcode_accounts.account_audit_events (user_id, event, provider) VALUES ($1, $2, $3)", [
    userId,
    event,
    provider,
  ]);
}

async function lockUser(c: PoolClient, userId: string): Promise<UserSnapshot | null> {
  const { rows } = await c.query<{ id: string; status: UserSnapshot["status"]; session_version: number }>(
    "SELECT id, status, session_version FROM kubcode_accounts.users WHERE id = $1 FOR UPDATE",
    [userId],
  );
  return rows[0] ? { id: rows[0].id, status: rows[0].status, sessionVersion: rows[0].session_version } : null;
}

async function sessionIdentityOwned(c: PoolClient, s: SessionClaims): Promise<string | null> {
  const { rows } = await c.query<{ id: string }>(
    "SELECT id FROM kubcode_accounts.user_identities WHERE user_id = $1 AND provider = $2 AND subject = $3",
    [s.uid, s.provider, s.sub],
  );
  return rows[0]?.id ?? null;
}

// Locks user then intent. Returns null when no intent has this hash.
async function lockIntent(c: PoolClient, tokenHash: Buffer) {
  const head = await c.query<{ user_id: string }>(
    "SELECT user_id FROM kubcode_accounts.account_link_intents WHERE token_hash = $1",
    [tokenHash],
  );
  if (!head.rows[0]) return null;
  const user = await lockUser(c, head.rows[0].user_id);
  const { rows } = await c.query<IntentRow>(`${INTENT_SELECT} FOR UPDATE OF li`, [tokenHash]);
  const row = rows[0];
  if (!row || !user || row.user_id !== user.id) return null;
  return { row, user };
}

async function closeIntent(c: PoolClient, row: IntentRow, status: "rejected" | "cancelled", event: string) {
  if (row.status !== "open") return;
  await c.query(`UPDATE kubcode_accounts.account_link_intents SET status = $2, ${WIPE} WHERE id = $1 AND status = 'open'`, [
    row.id,
    status,
  ]);
  await audit(c, row.user_id, event, row.target_provider);
}

async function identitiesOf(c: PoolClient, userId: string, lock: boolean): Promise<IdentityRef[]> {
  const { rows } = await c.query<IdentityRef>(
    `SELECT id, provider FROM kubcode_accounts.user_identities WHERE user_id = $1 ORDER BY provider${lock ? " FOR UPDATE" : ""}`,
    [userId],
  );
  return rows;
}

class RetryLogin extends Error {}

export function createPgAccountStore(pool: Pool): AccountStore {
  const tx = <T>(work: (c: PoolClient) => Promise<T>) => withTransaction(pool, work);

  async function resolveOnce(p: LoginProfile): Promise<LoginResult> {
    return tx(async (c) => {
      const email = p.provider === "google" ? p.email : null;
      const found = await c.query<{ identity_id: string; id: string; status: string; session_version: number }>(
        `SELECT i.id AS identity_id, u.id, u.status, u.session_version
           FROM kubcode_accounts.user_identities i JOIN kubcode_accounts.users u ON u.id = i.user_id
          WHERE i.provider = $1 AND i.subject = $2
          FOR UPDATE OF i`,
        [p.provider, p.subject],
      );
      const row = found.rows[0];
      if (row) {
        await c.query(
          "UPDATE kubcode_accounts.user_identities SET display_name = $2, email = $3, last_login_at = now() WHERE id = $1",
          [row.identity_id, p.displayName, email],
        );
        if (row.status !== "active") return { status: "suspended" as const };
        return { status: "ok" as const, userId: row.id, sessionVersion: row.session_version };
      }
      const user = await c.query<{ id: string; session_version: number }>(
        "INSERT INTO kubcode_accounts.users DEFAULT VALUES RETURNING id, session_version",
      );
      const inserted = await c.query(
        `INSERT INTO kubcode_accounts.user_identities (user_id, provider, subject, display_name, email, last_login_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (provider, subject) DO NOTHING RETURNING id`,
        [user.rows[0].id, p.provider, p.subject, p.displayName, email],
      );
      // A concurrent first sign-in won: roll back so the new user row is not
      // left behind as an orphan, then retry and map to the winner's user.
      if (inserted.rowCount !== 1) throw new RetryLogin();
      await audit(c, user.rows[0].id, "user_created", p.provider);
      return { status: "ok" as const, userId: user.rows[0].id, sessionVersion: user.rows[0].session_version };
    });
  }

  return {
    async resolveLogin(p) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await resolveOnce(p);
        } catch (error) {
          if (attempt < 2 && (error instanceof RetryLogin || isUniqueViolation(error))) continue;
          throw error;
        }
      }
    },

    async checkSession(s) {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM kubcode_accounts.users u JOIN kubcode_accounts.user_identities i ON i.user_id = u.id
          WHERE u.id = $1 AND u.status = 'active' AND u.session_version = $2
            AND i.provider = $3 AND i.subject = $4`,
        [s.uid, s.sv, s.provider, s.sub],
      );
      return rowCount === 1;
    },

    async getSettings(s, linkTokenHash) {
      return tx(async (c) => {
        const user = await c.query<{ id: string; status: UserSnapshot["status"]; session_version: number }>(
          "SELECT id, status, session_version FROM kubcode_accounts.users WHERE id = $1",
          [s.uid],
        );
        const u = user.rows[0];
        if (!u || u.status !== "active" || u.session_version !== s.sv) return null;
        if (!(await sessionIdentityOwned(c, s))) return null;
        const ids = await c.query<{
          provider: AuthProviderId;
          display_name: string | null;
          email: string | null;
          created_at: Date;
          subject: string;
        }>(
          "SELECT provider, display_name, email, created_at, subject FROM kubcode_accounts.user_identities WHERE user_id = $1 ORDER BY provider",
          [s.uid],
        );
        const identities: SettingsIdentity[] = ids.rows.map((r) => ({
          provider: r.provider,
          displayName: r.display_name,
          email: r.provider === "google" ? r.email : null,
          linkedAt: r.created_at.toISOString(),
          current: r.provider === s.provider && r.subject === s.sub,
        }));
        let intent: SettingsIntent | null = null;
        let staleIntentCookie = false;
        if (linkTokenHash) {
          const { rows } = await c.query<IntentRow>(INTENT_SELECT, [linkTokenHash]);
          const row = rows[0] ?? null;
          const userSnap = { id: u.id, status: u.status, sessionVersion: u.session_version };
          const bad = checkIntentBinding(row ? snapshot(row) : null, userSnap, s, true);
          if (bad || !row || row.phase === "closed") staleIntentCookie = true;
          else
            intent = {
              kind: row.kind,
              phase: row.phase,
              sourceProvider: row.source_provider!,
              targetProvider: row.target_provider,
              pendingTargetName: row.phase === "await_confirm" && row.kind === "link" ? row.pending_display_name : null,
              expiresAt: row.expires_at.toISOString(),
            };
        }
        return { identities, intent, staleIntentCookie };
      });
    },

    async startIntent(s, kind, provider, ready, tokenHash) {
      return tx(async (c) => {
        const user = await lockUser(c, s.uid);
        if (!user || user.status !== "active" || user.sessionVersion !== s.sv)
          return { ok: false, code: "NOT_SIGNED_IN" } as const;
        const sourceId = await sessionIdentityOwned(c, s);
        if (!sourceId) return { ok: false, code: "NOT_SIGNED_IN" } as const;
        const identities = await identitiesOf(c, s.uid, false);
        const code = kind === "link" ? canStartLink(identities, provider, ready) : canStartUnlink(identities, provider, ready);
        if (code) return { ok: false, code } as const;
        const targetIdentityId = kind === "unlink" ? identities.find((i) => i.provider === provider)!.id : null;
        await c.query(
          `UPDATE kubcode_accounts.account_link_intents SET status = 'superseded', ${WIPE} WHERE user_id = $1 AND status = 'open'`,
          [s.uid],
        );
        await c.query(
          "DELETE FROM kubcode_accounts.account_link_intents WHERE user_id = $1 AND status <> 'open' AND closed_at < now() - interval '1 day'",
          [s.uid],
        );
        await c.query(
          `INSERT INTO kubcode_accounts.account_link_intents
             (token_hash, kind, user_id, session_binding_hash, session_version, source_identity_id,
              target_provider, target_identity_id, phase, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'await_source', 'open',
                   now() + make_interval(secs => $9))`,
          [tokenHash, kind, s.uid, hashOpaqueToken(s.sid), s.sv, sourceId, provider, targetIdentityId, INTENT_TTL_SECONDS],
        );
        await audit(c, s.uid, kind === "link" ? "link_started" : "unlink_started", provider);
        return { ok: true, sourceProvider: s.provider } as const;
      });
    },

    async advanceIntent(tokenHash, s, proof, ready) {
      return tx(async (c): Promise<AdvanceResult> => {
        const locked = await lockIntent(c, tokenHash);
        if (!locked) return { ok: false, code: "LINK_INVALID" };
        const { row, user } = locked;
        const owned = s ? (await sessionIdentityOwned(c, s)) !== null : false;
        const bad = checkIntentBinding(snapshot(row), user, s, owned);
        if (bad) {
          await closeIntent(c, row, "rejected", "link_rejected");
          return { ok: false, code: bad };
        }
        let targetOwner: "none" | "self" | "other" = "none";
        if (row.phase === "await_target") {
          const owner = await c.query<{ user_id: string }>(
            "SELECT user_id FROM kubcode_accounts.user_identities WHERE provider = $1 AND subject = $2",
            [proof.provider, proof.subject],
          );
          if (owner.rows[0]) targetOwner = owner.rows[0].user_id === row.user_id ? "self" : "other";
        }
        const r = evaluateCallbackProof({ intent: snapshot(row), proof, ready, targetOwner });
        if (!r.ok) {
          await closeIntent(c, row, "rejected", "link_rejected");
          return r;
        }
        if (r.step === "source") {
          await c.query(
            "UPDATE kubcode_accounts.account_link_intents SET phase = $2, source_verified_at = now() WHERE id = $1",
            [row.id, r.nextPhase],
          );
        } else {
          await c.query(
            `UPDATE kubcode_accounts.account_link_intents
                SET phase = 'await_confirm', target_verified_at = now(),
                    pending_subject = $2, pending_display_name = $3, pending_email = $4
              WHERE id = $1`,
            [row.id, proof.subject, proof.displayName, proof.provider === "google" ? proof.email : null],
          );
        }
        await audit(c, row.user_id, `${row.kind}_${r.step}_verified`, r.step === "source" ? proof.provider : row.target_provider);
        return { ok: true, step: r.step, kind: row.kind, nextPhase: r.nextPhase };
      });
    },

    async confirmIntent(tokenHash, s, ready) {
      return tx(async (c) => {
        const locked = await lockIntent(c, tokenHash);
        if (!locked) return { ok: false, code: "LINK_INVALID" } as const;
        const { row, user } = locked;
        const owned = (await sessionIdentityOwned(c, s)) !== null;
        const bad = checkIntentBinding(snapshot(row), user, s, owned);
        if (bad) {
          await closeIntent(c, row, "rejected", "link_rejected");
          return { ok: false, code: bad } as const;
        }
        const identities = await identitiesOf(c, row.user_id, true);
        const r = evaluateConfirm({
          intent: snapshot(row),
          ready,
          identities,
          hasPendingTarget: row.pending_subject !== null,
        });
        if (!r.ok) {
          await closeIntent(c, row, "rejected", "link_rejected");
          return r;
        }
        if (row.kind === "link") {
          await c.query("SAVEPOINT link_insert");
          try {
            await c.query(
              `INSERT INTO kubcode_accounts.user_identities (user_id, provider, subject, display_name, email)
               VALUES ($1, $2, $3, $4, $5)`,
              [row.user_id, row.target_provider, row.pending_subject, row.pending_display_name, row.pending_email],
            );
            await c.query("RELEASE SAVEPOINT link_insert");
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            // Someone else claimed this identity meanwhile: generic conflict.
            await c.query("ROLLBACK TO SAVEPOINT link_insert");
            await closeIntent(c, row, "rejected", "link_rejected");
            return { ok: false, code: "LINK_CONFLICT" } as const;
          }
        } else {
          const removed = await c.query(
            "DELETE FROM kubcode_accounts.user_identities WHERE id = $1 AND user_id = $2 AND provider = $3",
            [row.target_identity_id, row.user_id, row.target_provider],
          );
          if (removed.rowCount !== 1) {
            await closeIntent(c, row, "rejected", "link_rejected");
            return { ok: false, code: "NOT_LINKED" } as const;
          }
        }
        // Revoke every existing session (including this one) for the user.
        await c.query(
          "UPDATE kubcode_accounts.users SET session_version = session_version + 1, updated_at = now() WHERE id = $1",
          [row.user_id],
        );
        await c.query(`UPDATE kubcode_accounts.account_link_intents SET status = 'consumed', ${WIPE} WHERE id = $1`, [row.id]);
        await audit(c, row.user_id, row.kind === "link" ? "identity_linked" : "identity_unlinked", row.target_provider);
        return { ok: true, kind: row.kind, provider: row.target_provider } as const;
      });
    },

    async cancelIntent(tokenHash, s) {
      await tx(async (c) => {
        const locked = await lockIntent(c, tokenHash);
        if (!locked || !s || s.uid !== locked.row.user_id) return;
        await closeIntent(c, locked.row, "cancelled", "link_cancelled");
      });
    },

    async cancelSessionIntents(s) {
      await pool.query(
        `UPDATE kubcode_accounts.account_link_intents SET status = 'cancelled', ${WIPE}
          WHERE user_id = $1 AND session_binding_hash = $2 AND status = 'open'`,
        [s.uid, hashOpaqueToken(s.sid)],
      );
    },
  };
}

export function getAccountStore(databaseUrl: string): AccountStore {
  return createPgAccountStore(getPool(databaseUrl));
}
