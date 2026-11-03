// Browser helpers for interaction writes: fetch the double-submit CSRF token
// once, then send same-origin JSON. Errors come back as { code, message }.
export type ApiResult<T> = ({ ok: true } & T) | { ok: false; code: string; message: string };

const FALLBACK = "ทำรายการไม่สำเร็จ ลองใหม่ภายหลัง";
let csrfToken: string | null = null;

async function csrf(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  const res = await fetch("/api/account/csrf", { credentials: "same-origin", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { csrfToken?: unknown };
  csrfToken = res.ok && typeof body.csrfToken === "string" ? body.csrfToken : null;
  return csrfToken;
}

export async function send<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<ApiResult<T>> {
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
    if (res.status === 403 && json.code === "CSRF_INVALID") csrfToken = null;
    if (!res.ok) {
      return {
        ok: false,
        code: typeof json.code === "string" ? json.code : "UNKNOWN",
        message: typeof json.message === "string" ? json.message : FALLBACK,
      };
    }
    return { ok: true, ...(json as T) };
  } catch {
    return { ok: false, code: "NETWORK", message: FALLBACK };
  }
}
