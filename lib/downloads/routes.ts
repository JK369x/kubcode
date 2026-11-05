// Handlers for /api/download/[slug] (ADR 0002). Route files are thin
// wrappers; deps are injectable so every guard is testable offline.
//
// POST order: accounts on → downloads on → guardWrite (Origin, CSRF) →
// approved package → signed session → limit + log (DB-checked session) →
// presigned URL from the signer Lambda. Nothing past a failed step runs.
import type { AuthEnv } from "../auth-policy";
import { SESSION_COOKIE_NAME, providerReadiness, readAuthConfig } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { accountErrorResponse, ACCOUNT_ERRORS, type AccountErrorCode } from "../accounts/errors";
import { jsonNoStore, readCookie } from "../accounts/http";
import { decodeAccountSession } from "../accounts/runtime";
import { sessionClaims } from "../accounts/session";
import { guardWrite } from "../interactions/http";
import { approvedPackageFor } from "../packages";
import { readDownloadsConfig } from "./config";
import { DOWNLOAD_LIMIT, DOWNLOAD_WINDOW_HOURS } from "./limits";
import { requestSignedUrl } from "./signer";
import { getDownloadStore, type DownloadStore } from "./store";

export type DownloadDeps = {
  env?: AuthEnv;
  storeFor?: (databaseUrl: string) => DownloadStore;
  sign?: typeof requestSignedUrl;
};

type DownloadErrorCode =
  | "DOWNLOADS_DISABLED"
  | "DOWNLOADS_UNAVAILABLE"
  | "PACKAGE_NOT_FOUND"
  | "DOWNLOAD_LIMIT"
  | "DOWNLOAD_UNAVAILABLE"
  | "NOT_SIGNED_IN";

const DOWNLOAD_ERRORS: Record<DownloadErrorCode, { status: number; message: string }> = {
  DOWNLOADS_DISABLED: { status: 503, message: "ยังไม่เปิดดาวน์โหลดบนเซิร์ฟเวอร์นี้" },
  DOWNLOADS_UNAVAILABLE: { status: 503, message: "ระบบดาวน์โหลดใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง" },
  PACKAGE_NOT_FOUND: { status: 404, message: "skill นี้ยังไม่มีชุดให้ดาวน์โหลด" },
  DOWNLOAD_LIMIT: { status: 429, message: `ดาวน์โหลดครบ ${DOWNLOAD_LIMIT} ครั้งใน ${DOWNLOAD_WINDOW_HOURS} ชั่วโมงแล้ว ลองใหม่ภายหลัง` },
  DOWNLOAD_UNAVAILABLE: { status: 502, message: "สร้างลิงก์ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง" },
  NOT_SIGNED_IN: ACCOUNT_ERRORS.NOT_SIGNED_IN,
};

function errorResponse(code: DownloadErrorCode, extra: { retryAt?: string } = {}): Response {
  const e = DOWNLOAD_ERRORS[code];
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (extra.retryAt) headers["Retry-After"] = String(Math.max(1, Math.ceil((Date.parse(extra.retryAt) - Date.now()) / 1000)));
  return Response.json({ code, message: e.message, ...extra }, { status: e.status, headers });
}

/** GET: whether this skill can be downloaded on this server. Public, reads no session. */
export async function handleDownloadStatus(_request: Request, slug: string, deps: DownloadDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const available =
    readAccountsConfig(env).mode === "on" && readDownloadsConfig(env).mode === "on" && approvedPackageFor(slug) !== null;
  return jsonNoStore({ available });
}

export async function handleDownload(request: Request, slug: string, deps: DownloadDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const accounts = readAccountsConfig(env);
  if (accounts.mode !== "on") return accountErrorResponse(accounts.mode === "off" ? "ACCOUNTS_DISABLED" : "ACCOUNTS_UNAVAILABLE");
  const downloads = readDownloadsConfig(env);
  if (downloads.mode === "off") return errorResponse("DOWNLOADS_DISABLED");
  if (downloads.mode === "broken") return errorResponse("DOWNLOADS_UNAVAILABLE");

  const guarded = await guardWrite(request, 0, { body: false });
  if (!guarded.ok) return accountErrorResponse(guarded.code as AccountErrorCode);

  const pkg = approvedPackageFor(slug);
  if (!pkg) return errorResponse("PACKAGE_NOT_FOUND");

  const auth = readAuthConfig(env);
  if (!auth.ok) return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  const token = await decodeAccountSession(readCookie(request, SESSION_COOKIE_NAME), auth.config.secret);
  if (!token || !providerReadiness(auth)[token.provider]) return errorResponse("NOT_SIGNED_IN");
  const session = sessionClaims(token);

  try {
    const recorded = await (deps.storeFor ?? getDownloadStore)(accounts.databaseUrl).recordDownload(session, {
      slug: pkg.slug,
      version: pkg.version,
    });
    if (!recorded.ok) return errorResponse(recorded.code, recorded.code === "DOWNLOAD_LIMIT" ? { retryAt: recorded.retryAt } : {});
  } catch (error) {
    logDbFailure("DOWNLOAD_RECORD", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }

  const signed = await (deps.sign ?? requestSignedUrl)(downloads.signer, {
    key: pkg.key,
    filename: pkg.filename,
    user: session.uid,
  });
  if (!signed.ok) {
    console.error("[kubcode-downloads] SIGNER_FAILED");
    return errorResponse("DOWNLOAD_UNAVAILABLE");
  }
  return jsonNoStore({ ok: true, url: signed.url, filename: pkg.filename });
}
