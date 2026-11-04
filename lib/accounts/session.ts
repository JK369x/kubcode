// Session JWT model when central accounts are ON. The JWT is encrypted by
// next-auth, so provider + subject stay private; only provider, name and the
// Google email ever reach the browser. Tokens without this exact shape (for
// example pre-accounts stateless tokens) are treated as signed out.
import type { AuthProviderId, PublicSession } from "../auth-policy";
import { safeAvatarUrl } from "../avatar";
import { isOpaqueToken, newOpaqueToken } from "./crypto";

export const ACCOUNT_TOKEN_KIND = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_SUBJECT_LENGTH = 255;

export type AccountToken = {
  kc: typeof ACCOUNT_TOKEN_KIND;
  uid: string;
  sid: string;
  sv: number;
  provider: AuthProviderId;
  sub: string;
  name: string | null;
  email?: string;
  /** Allowlisted provider picture for this sign-in; never stored in the DB. */
  picture?: string;
};

// The private session claims the database checks on every read.
export type SessionClaims = Pick<AccountToken, "uid" | "sid" | "sv" | "provider" | "sub">;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const isSubject = (v: unknown): v is string => nonEmpty(v) && v.length <= MAX_SUBJECT_LENGTH;

export function accountToken(input: {
  userId: string;
  sessionVersion: number;
  provider: AuthProviderId;
  subject: string;
  name: string | null;
  email: string | null;
  picture?: string | null;
}): AccountToken {
  const token: AccountToken = {
    kc: ACCOUNT_TOKEN_KIND,
    uid: input.userId,
    sid: newOpaqueToken(),
    sv: input.sessionVersion,
    provider: input.provider,
    sub: input.subject,
    name: input.name,
  };
  if (input.provider === "google" && input.email) token.email = input.email;
  const picture = safeAvatarUrl(input.picture);
  if (picture) token.picture = picture;
  return token;
}

export function parseAccountToken(value: unknown): AccountToken | null {
  if (!isObj(value) || value.kc !== ACCOUNT_TOKEN_KIND) return null;
  const { uid, sid, sv, provider, sub, name, email, picture } = value;
  if (!isUuid(uid) || !isOpaqueToken(sid)) return null;
  if (typeof sv !== "number" || !Number.isSafeInteger(sv) || sv < 1) return null;
  if (provider !== "google" && provider !== "line") return null;
  if (!isSubject(sub)) return null;
  if (!(name === null || typeof name === "string")) return null;
  const out: AccountToken = { kc: ACCOUNT_TOKEN_KIND, uid, sid, sv, provider, sub, name };
  if (provider === "google") {
    if (!nonEmpty(email)) return null;
    out.email = email;
  } else if (email !== undefined) return null;
  // A picture that fails the allowlist is dropped; the session stays valid.
  const safePicture = safeAvatarUrl(picture);
  if (safePicture) out.picture = safePicture;
  return out;
}

export function sessionClaims(token: AccountToken): SessionClaims {
  return { uid: token.uid, sid: token.sid, sv: token.sv, provider: token.provider, sub: token.sub };
}

export function publicSessionFromAccountToken(value: unknown, expires: string): PublicSession {
  const t = parseAccountToken(value);
  if (!t) return { expires };
  return {
    user: {
      provider: t.provider,
      name: t.name,
      email: t.provider === "google" ? t.email! : null,
      image: t.picture ?? null,
    },
    expires,
  };
}
