// Pure link/unlink decision rules. The SQL store loads and locks rows, calls
// these, then writes; keeping decisions here makes every invariant testable
// offline without faking database success.
import { timingSafeEqual } from "node:crypto";
import type { AuthProviderId, AuthReadiness } from "../auth-policy";
import { hashOpaqueToken } from "./crypto";
import type { AccountErrorCode } from "./errors";
import type { SessionClaims } from "./session";

export const INTENT_TTL_SECONDS = 10 * 60;

export type IntentKind = "link" | "unlink";
export type IntentPhase = "await_source" | "await_target" | "await_confirm" | "closed";
export type IntentStatus = "open" | "consumed" | "cancelled" | "rejected" | "superseded";

export type IntentSnapshot = {
  kind: IntentKind;
  phase: IntentPhase;
  status: IntentStatus;
  expired: boolean;
  userId: string;
  sessionBindingHash: Buffer;
  sessionVersion: number;
  // Joined from the source identity row; null if that identity was removed.
  sourceProvider: AuthProviderId | null;
  sourceSubject: string | null;
  targetProvider: AuthProviderId;
};

export type UserSnapshot = { id: string; status: "active" | "suspended"; sessionVersion: number };
export type IdentityRef = { id: string; provider: AuthProviderId };
export type Proof = { provider: AuthProviderId; subject: string };
export type Failure = { ok: false; code: AccountErrorCode };

function sameBinding(sid: string, expected: Buffer): boolean {
  const actual = hashOpaqueToken(sid);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

// The intent must be open, fresh and bound to this exact user, browser
// session, session version and source identity. Returns null when valid.
export function checkIntentBinding(
  intent: IntentSnapshot | null,
  user: UserSnapshot | null,
  session: SessionClaims | null,
  sessionIdentityOwned: boolean,
): AccountErrorCode | null {
  if (!intent || intent.status !== "open") return "LINK_INVALID";
  if (intent.expired) return "LINK_EXPIRED";
  if (!session || !user) return "LINK_INVALID";
  if (user.id !== intent.userId || session.uid !== intent.userId) return "LINK_INVALID";
  if (user.status !== "active") return "LINK_INVALID";
  if (session.sv !== user.sessionVersion || intent.sessionVersion !== user.sessionVersion) return "LINK_INVALID";
  if (!sameBinding(session.sid, intent.sessionBindingHash)) return "LINK_INVALID";
  if (!sessionIdentityOwned) return "LINK_INVALID";
  if (intent.sourceProvider === null || intent.sourceSubject === null) return "LINK_INVALID";
  if (session.provider !== intent.sourceProvider || session.sub !== intent.sourceSubject) return "LINK_INVALID";
  return null;
}

// Decides what a fresh, verified OAuth callback proves for a bound intent.
// `targetOwner` says whether the proven identity already belongs to anyone.
export function evaluateCallbackProof(input: {
  intent: IntentSnapshot;
  proof: Proof;
  ready: AuthReadiness;
  targetOwner: "none" | "self" | "other";
}):
  | { ok: true; step: "source"; nextPhase: "await_target" | "await_confirm" }
  | { ok: true; step: "target"; nextPhase: "await_confirm" }
  | Failure {
  const { intent, proof, ready, targetOwner } = input;
  if (intent.phase === "await_source") {
    if (proof.provider !== intent.sourceProvider || proof.subject !== intent.sourceSubject)
      return { ok: false, code: "LINK_WRONG_ACCOUNT" };
    return { ok: true, step: "source", nextPhase: intent.kind === "link" ? "await_target" : "await_confirm" };
  }
  if (intent.phase === "await_target" && intent.kind === "link") {
    if (proof.provider !== intent.targetProvider) return { ok: false, code: "LINK_WRONG_ACCOUNT" };
    if (!ready[intent.targetProvider]) return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    if (targetOwner !== "none") return { ok: false, code: "LINK_CONFLICT" };
    return { ok: true, step: "target", nextPhase: "await_confirm" };
  }
  return { ok: false, code: "LINK_INVALID" };
}

const remainingUsable = (identities: IdentityRef[], removedProvider: AuthProviderId, ready: AuthReadiness) =>
  identities.filter((i) => i.provider !== removedProvider && ready[i.provider]).length;

export function canStartLink(
  identities: IdentityRef[],
  provider: AuthProviderId,
  ready: AuthReadiness,
): AccountErrorCode | null {
  if (!ready[provider]) return "PROVIDER_UNAVAILABLE";
  if (identities.some((i) => i.provider === provider)) return "ALREADY_LINKED";
  return null;
}

export function canStartUnlink(
  identities: IdentityRef[],
  provider: AuthProviderId,
  ready: AuthReadiness,
): AccountErrorCode | null {
  if (!identities.some((i) => i.provider === provider)) return "NOT_LINKED";
  if (remainingUsable(identities, provider, ready) === 0) return "LAST_LOGIN_METHOD";
  return null;
}

export function evaluateConfirm(input: {
  intent: IntentSnapshot;
  ready: AuthReadiness;
  identities: IdentityRef[];
  hasPendingTarget: boolean;
}): { ok: true } | Failure {
  const { intent, ready, identities } = input;
  if (intent.phase !== "await_confirm") return { ok: false, code: "LINK_INVALID" };
  if (intent.kind === "link") {
    if (!input.hasPendingTarget) return { ok: false, code: "LINK_INVALID" };
    if (!ready[intent.targetProvider]) return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    if (identities.some((i) => i.provider === intent.targetProvider)) return { ok: false, code: "LINK_CONFLICT" };
    return { ok: true };
  }
  const code = canStartUnlink(identities, intent.targetProvider, ready);
  return code ? { ok: false, code } : { ok: true };
}
