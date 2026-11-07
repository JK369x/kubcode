import { cookies } from "next/headers";
import { getSettingsView } from "./accounts/view";
import { SESSION_COOKIE_NAME, readAuthConfig } from "./auth-policy";
import { decodeAccountSession } from "./accounts/runtime";
import { sessionClaims } from "./accounts/session";

export async function sandboxRequest(request: Request, action: string) {
  const origin = process.env.TIKTOK_SANDBOX_ORIGIN;
  const key = process.env.TIKTOK_SANDBOX_BRIDGE;
  const fail = (status: number, error: string) =>
    Response.json(
      { error },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (!origin || !key || key.length < 32) return fail(503, "sandbox_disabled");
  if (request.method === "POST" && request.headers.get("origin") !== origin)
    return fail(403, "forbidden");
  if (
    !["start", "display-connect", "display", "creator", "init", "upload", "status", "connect"].includes(
      action,
    )
  )
    return fail(404, "unknown_action");
  const jar = await cookies();
  const auth = readAuthConfig(process.env);
  if (
    !auth.ok ||
    (await getSettingsView(process.env, async () => jar)).state !== "ready"
  )
    return fail(401, "sign_in_required");
  const token = await decodeAccountSession(
    jar.get(SESSION_COOKIE_NAME)?.value,
    auth.config.secret,
  );
  if (!token) return fail(401, "sign_in_required");
  const headers: Record<string, string> = {
    authorization: "Bearer " + key,
    "x-member": sessionClaims(token).uid,
  };
  let body: BodyInit | null;
  if (action === "connect") {
    if (request.method !== "GET") return fail(405, "invalid_method");
    const params = new URL(request.url).searchParams;
    body = JSON.stringify({
      code: params.get("code"),
      state: params.get("state"),
    });
  } else if (action === "upload") {
    const size = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(size) || size <= 0 || size > 64 * 1024 * 1024)
      return fail(413, "invalid_upload");
    headers["content-length"] = String(size);
    headers["x-job"] = request.headers.get("x-job") ?? "";
    body = request.body;
  } else {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return fail(415, "invalid_content");
    body = request.body;
  }
  try {
    const response = await fetch("http://127.0.0.1:3051/" + action, {
      method: "POST",
      headers,
      body,
      duplex: "half",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(action === "upload" ? 185000 : 30000),
    } as RequestInit);
    if (action === "connect")
      return Response.redirect(
        origin + "/account/tiktok" + (response.ok ? "" : "?error=connect"),
        303,
      );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return fail(503, "sandbox_unavailable");
  }
}
