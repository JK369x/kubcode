// Handlers for /api/download/[slug] (ADR 0002). Route files are thin
// wrappers; deps are injectable so every guard is testable offline.
//
// POST order: accounts on → downloads on → guardWrite (Origin, CSRF) →
// approved package → signed session → limit (DB-checked session) →
// presigned URL from the signer Lambda → (private packages) object exists →
// log. A link that could not be issued is not counted.
// Nothing past a failed step runs.
import type { AuthEnv } from "../auth-policy";
import { readAuthConfig } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { accountErrorResponse, ACCOUNT_ERRORS, type AccountErrorCode } from "../accounts/errors";
import { jsonNoStore } from "../accounts/http";
import { sessionOf } from "../accounts/runtime";
import { guardWrite } from "../interactions/http";
import { approvedPackageFor } from "../packages";
import { readDownloadsConfig } from "./config";
import { DOWNLOAD_LIMIT, DOWNLOAD_WINDOW_HOURS } from "./limits";
import { requestSignedUrl } from "./signer";
import { getDownloadStore, type DownloadRefusal, type DownloadStore } from "./store";

type Issued = { ok: true; url: string } | { ok: false; code: "DOWNLOAD_UNAVAILABLE" | "PACKAGE_NOT_FOUND" };

export type DownloadDeps = {
  env?: AuthEnv;
  storeFor?: (databaseUrl: string) => DownloadStore;
  sign?: typeof requestSignedUrl;
  /** Does the presigned object exist? Only asked for owner-uploaded private packages. */
  probe?: (url: string) => Promise<"present" | "missing" | "error">;
};

/**
 * Private packages are uploaded by hand (scripts/upload-private-package.ts), so
 * the object can be missing even when lib/packages.ts pins it. One ranged GET
 * of a single byte on the presigned URL tells; S3 answers 403/404 for a missing
 * key. The URL is never logged.
 */
export async function probeObject(url: string, fetchImpl: typeof fetch = fetch): Promise<"present" | "missing" | "error"> {
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    await res.body?.cancel();
    if (res.status === 206 || res.status === 200) return "present";
    if (res.status === 403 || res.status === 404) return "missing";
    return "error";
  } catch {
    return "error";
  }
}

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

  if (!readAuthConfig(env).ok) return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  const session = await sessionOf(request, env);
  if (!session) return errorResponse("NOT_SIGNED_IN");

  // Signed and probed inside the store's transaction: only an issued link is counted.
  const issue = async (): Promise<Issued> => {
    const signed = await (deps.sign ?? requestSignedUrl)(downloads.signer, {
      key: pkg.key,
      filename: pkg.filename,
      user: session.uid,
    });
    if (!signed.ok) {
      console.error("[kubcode-downloads] SIGNER_FAILED");
      return { ok: false, code: "DOWNLOAD_UNAVAILABLE" };
    }
    if (pkg.kind === "private") {
      const state = await (deps.probe ?? probeObject)(signed.url);
      if (state === "missing") {
        console.error(`[kubcode-downloads] PRIVATE_OBJECT_MISSING ${pkg.key}`);
        return { ok: false, code: "PACKAGE_NOT_FOUND" };
      }
      if (state === "error") return { ok: false, code: "DOWNLOAD_UNAVAILABLE" };
    }
    return { ok: true, url: signed.url };
  };

  let result: Issued | DownloadRefusal;
  try {
    result = await (deps.storeFor ?? getDownloadStore)(accounts.databaseUrl).recordDownload(session, { slug: pkg.slug, version: pkg.version }, issue);
  } catch (error) {
    logDbFailure("DOWNLOAD_RECORD", error);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
  if (!result.ok) return errorResponse(result.code, result.code === "DOWNLOAD_LIMIT" ? { retryAt: result.retryAt } : {});
  return jsonNoStore({ ok: true, url: result.url, filename: pkg.filename });
}
