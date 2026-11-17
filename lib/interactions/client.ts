// Browser helpers for interaction writes: fetch the double-submit CSRF token
// once, then send same-origin JSON. Errors come back as { code, message }.
export type ApiResult<T> = ({ ok: true } & T) | { ok: false; code: string; message: string; /** The input the error is about, when the server names one. */ field?: string };

const FALLBACK = "ทำรายการไม่สำเร็จ ลองใหม่ภายหลัง";
let csrfToken: string | null = null;

async function csrf(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  const res = await fetch("/api/account/csrf", { credentials: "same-origin", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { csrfToken?: unknown };
  csrfToken = res.ok && typeof body.csrfToken === "string" ? body.csrfToken : null;
  return csrfToken;
}

export async function send<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, retried = false): Promise<ApiResult<T>> {
  try {
    const token = await csrf();
    if (!token) return { ok: false, code: "CSRF_INVALID", message: FALLBACK };
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "x-kubcode-csrf": token,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 403 && json.code === "CSRF_INVALID") {
      // The cookie expired (2 h) while the page kept its token. The guard
      // refused before doing anything, so one retry with a fresh token is safe.
      csrfToken = null;
      if (!retried) return send<T>(path, method, body, true);
    }
    if (!res.ok) {
      return {
        ok: false,
        code: typeof json.code === "string" ? json.code : "UNKNOWN",
        message: typeof json.message === "string" ? json.message : FALLBACK,
        ...(typeof json.field === "string" ? { field: json.field } : {}),
      };
    }
    return { ok: true, ...(json as T) };
  } catch {
    return { ok: false, code: "NETWORK", message: FALLBACK };
  }
}
