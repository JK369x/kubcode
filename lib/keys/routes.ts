// Handlers for /api/keys/* (docs/design/settings-keys.md §8). Route files are
// thin wrappers; deps are injectable so every guard is testable without a
// database. Responses carry metadata only: a secret never comes back.
//
// Write order: accounts on → keys flag → guardWrite (Origin, CSRF, media
// type, size, streamed body) → body shape → signed session → store (owner
// rule, validation, sealing).
import type { AuthEnv } from "../auth-policy";
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { ACCOUNT_ERRORS, accountErrorResponse, type AccountErrorCode } from "../accounts/errors";
import { jsonNoStore, readCookie } from "../accounts/http";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims, type SessionClaims } from "../accounts/session";
import { guardWrite } from "../interactions/http";
import { keysEnabled } from "./access";
import { getKeyStore, type KeyStore, type KeyStoreErrorCode } from "./store";

export type KeyRouteDeps = {
  env?: AuthEnv;
  storeFor?: (databaseUrl: string) => KeyStore;
};

/** Secret ≤512 + public value ≤255 bytes of ASCII, plus JSON framing. */
export const MAX_KEYS_WRITE_BYTES = 2048;

type KeysErrorCode = KeyStoreErrorCode | "KEYS_DISABLED";

const KEYS_ERRORS: Record<KeysErrorCode, { status: number; message: string }> = {
  KEYS_DISABLED: { status: 503, message: "หน้าตั้งค่าคีย์ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้" },
  NOT_SIGNED_IN: ACCOUNT_ERRORS.NOT_SIGNED_IN,
  FORBIDDEN: { status: 403, message: "คุณไม่มีสิทธิ์ใช้หน้าตั้งค่าคีย์" },
  INVALID_KIND: { status: 422, message: "ไม่รู้จักคีย์ประเภทนี้" },
  INVALID_PUBLIC_VALUE: { status: 422, message: "Client ID หรือ App ID ไม่ถูกรูปแบบ" },
  INVALID_SECRET: { status: 422, message: "คีย์ต้องยาว 16–512 ตัวอักษร ภาษาอังกฤษ ตัวเลข หรือสัญลักษณ์ ไม่มีช่องว่าง" },
  NOT_FOUND: { status: 404, message: "ยังไม่ได้ตั้งค่าคีย์นี้" },
  IN_USE: { status: 409, message: "คีย์นี้มีบัญชีที่เชื่อมอยู่ ยืนยันอีกครั้งเพื่อลบและยกเลิกการเชื่อมทั้งหมด" },
  NOT_READY: { status: 503, message: "ยังบันทึกคีย์ไม่ได้ ระบบเข้ารหัสยังไม่พร้อม" },
};

function errorResponse(code: KeysErrorCode): Response {
  const e = KEYS_ERRORS[code] ?? ACCOUNT_ERRORS.ACCOUNTS_UNAVAILABLE;
  return Response.json({ code, message: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
}

const badRequest = () => accountErrorResponse("BAD_REQUEST");
const KIND_SHAPE = /^[a-z][a-z0-9_]{1,39}$/;
const onlyKeys = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((k) => keys.includes(k)) && keys.every((k) => Object.hasOwn(body, k));

type Result = { ok: true } | { ok: false; code: KeysErrorCode };
type Act = (store: KeyStore, session: SessionClaims, body: Record<string, unknown>) => Promise<Response | Result>;

async function write(request: Request, deps: KeyRouteDeps, op: string, act: Act): Promise<Response> {
  const env = deps.env ?? process.env;
  const accounts = readAccountsConfig(env);
  if (accounts.mode !== "on") return accountErrorResponse(accounts.mode === "off" ? "ACCOUNTS_DISABLED" : "ACCOUNTS_UNAVAILABLE");
  if (!keysEnabled(env)) return errorResponse("KEYS_DISABLED");
  const guarded = await guardWrite(request, MAX_KEYS_WRITE_BYTES);
  if (!guarded.ok) return accountErrorResponse(guarded.code as AccountErrorCode);
  const auth = readAuthConfig(env);
  if (!auth.ok) return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  const token = await decodeAccountSession(readCookie(request, SESSION_COOKIE_NAME), auth.config.secret);
  const session = token && providerReadiness(auth)[token.provider] ? sessionClaims(token) : null;
  try {
    // Body shape is checked before the session so a malformed request never
    // reveals whether the caller is signed in; the store is reached last.
    const store = (deps.storeFor ?? getKeyStore)(accounts.databaseUrl);
    const result = await act(store, session as SessionClaims, guarded.body);
    if (result instanceof Response) return result;
    if (!result.ok) return errorResponse(result.code);
    return jsonNoStore(result);
  } catch (error) {
    logDbFailure(op, error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
}

/** POST /api/keys/secrets {kind, publicValue: string|null, secret} — save or replace. */
export const handleSaveSecret = (request: Request, deps: KeyRouteDeps = {}) =>
  write(request, deps, "KEY_SAVE", async (store, session, body) => {
    if (!onlyKeys(body, ["kind", "publicValue", "secret"])) return badRequest();
    const { kind, publicValue, secret } = body;
    if (typeof kind !== "string" || typeof secret !== "string") return badRequest();
    if (publicValue !== null && typeof publicValue !== "string") return badRequest();
    if (!session) return errorResponse("NOT_SIGNED_IN");
    return store.saveSecret(session, { kind, publicValue, secret });
  });

/** DELETE /api/keys/secrets/{kind} {confirmDisconnect?: boolean}. */
export const handleDeleteSecret = (request: Request, kind: string, deps: KeyRouteDeps = {}) =>
  write(request, deps, "KEY_DELETE", async (store, session, body) => {
    if (!KIND_SHAPE.test(kind)) return badRequest();
    if (!Object.keys(body).every((k) => k === "confirmDisconnect")) return badRequest();
    if (body.confirmDisconnect !== undefined && typeof body.confirmDisconnect !== "boolean") return badRequest();
    if (!session) return errorResponse("NOT_SIGNED_IN");
    return store.deleteSecret(session, kind, { confirmDisconnect: body.confirmDisconnect === true });
  });
