// Web-host billing routes (ADR 0008):
//   POST /api/billing/checkout {kind: "new"|"add", slots} -> {ok, url}  (Stripe Checkout)
//   POST /api/billing/fulfil   {session_id}              -> {ok, result, entitlement}
// The web host only signs requests to the billing Lambda; Stripe ids and the
// Stripe key stay there. Every write passes Origin/CSRF/body guards first.
import { randomBytes } from "node:crypto";
import type { AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { ACCOUNT_ERRORS, accountErrorResponse, type AccountErrorCode } from "../accounts/errors";
import { jsonNoStore } from "../accounts/http";
import { guardWrite } from "../interactions/http";
import { connectHeaders } from "../keys/connect-config";
import { sessionOf } from "../keys/connect-routes";
import { MAX_SLOTS, readBillingConfig, type BillingConfig } from "./config";
import { getBillingStore, type BillingStore } from "./store";

export type BillingRouteDeps = {
  env?: AuthEnv;
  storeFor?: (databaseUrl: string) => BillingStore;
  fetch?: typeof fetch;
  now?: () => number;
};

type Code =
  | "NOT_FOUND_FEATURE"
  | "UNAVAILABLE"
  | "NOT_SIGNED_IN"
  | "EXEMPT"
  | "NO_ACTIVE_PASS"
  | "TOO_LATE_TO_ADD"
  | "BAD_SLOTS"
  | "NOT_FOUND";
const ERRORS: Record<Code, { status: number; message: string }> = {
  NOT_FOUND_FEATURE: { status: 404, message: "ไม่พบหน้านี้" },
  UNAVAILABLE: { status: 503, message: "ระบบชำระเงินใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง" },
  NOT_SIGNED_IN: ACCOUNT_ERRORS.NOT_SIGNED_IN,
  EXEMPT: { status: 409, message: "บัญชีเจ้าของเว็บไม่ต้องชำระเงิน" },
  NO_ACTIVE_PASS: { status: 409, message: "ยังไม่มีแพ็กเกจที่ใช้งานอยู่ ซื้อแพ็กเกจรายเดือนก่อน" },
  TOO_LATE_TO_ADD: { status: 409, message: "แพ็กเกจใกล้หมดอายุแล้ว ต่ออายุพร้อมจำนวนช่องที่ต้องการแทน" },
  BAD_SLOTS: { status: 422, message: `เลือกได้ 1 ถึง ${MAX_SLOTS} ช่อง` },
  NOT_FOUND: { status: 404, message: "ไม่พบรายการชำระเงินนี้" },
};
const LAMBDA_CODES: Record<string, Code> = {
  exempt: "EXEMPT",
  no_active_pass: "NO_ACTIVE_PASS",
  too_late_to_add: "TOO_LATE_TO_ADD",
  bad_slots: "BAD_SLOTS",
  not_found: "NOT_FOUND",
  no_workspace: "NOT_FOUND",
};

const fail = (code: Code) =>
  Response.json({ code, message: ERRORS[code].message }, { status: ERRORS[code].status, headers: { "Cache-Control": "no-store" } });

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{1,200}$/;
const CHECKOUT_HOST = "checkout.stripe.com";

export async function callBilling(
  config: Extract<BillingConfig, { mode: "on" }>,
  path: "/api/status" | "/api/checkout" | "/api/fulfil",
  payload: unknown,
  deps: BillingRouteDeps,
): Promise<Record<string, unknown> | null> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor((deps.now ?? Date.now)() / 1000);
  const nonce = randomBytes(16).toString("hex");
  try {
    const res = await (deps.fetch ?? fetch)(new URL(path.slice(1), config.url).href, {
      method: "POST",
      headers: connectHeaders(config.key, path, body, timestamp, nonce),
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (res.status !== 200) return null;
    const json = (await res.json()) as unknown;
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function context(request: Request, deps: BillingRouteDeps, maxBytes: number, bodyOk: (b: Record<string, unknown>) => boolean) {
  const env = deps.env ?? process.env;
  const config = readBillingConfig(env);
  if (config.mode === "off") return fail("NOT_FOUND_FEATURE");
  const accounts = readAccountsConfig(env);
  if (config.mode !== "on" || accounts.mode !== "on") return fail("UNAVAILABLE");
  const guarded = await guardWrite(request, maxBytes);
  if (!guarded.ok) return accountErrorResponse(guarded.code as AccountErrorCode);
  if (!bodyOk(guarded.body)) return accountErrorResponse("BAD_REQUEST");
  const session = await sessionOf(request, env);
  if (!session) return fail("NOT_SIGNED_IN");
  const store = deps.storeFor?.(accounts.databaseUrl) ?? getBillingStore(accounts.databaseUrl);
  try {
    const view = await store.view(session, new Date((deps.now ?? Date.now)()));
    if (!view) return fail("NOT_SIGNED_IN");
    return { config, view, body: guarded.body };
  } catch (error) {
    logDbFailure("BILLING_VIEW", error);
    return fail("UNAVAILABLE");
  }
}

const isSlots = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_SLOTS;

export async function handleBillingCheckout(request: Request, deps: BillingRouteDeps = {}): Promise<Response> {
  const ctx = await context(request, deps, 128, (b) =>
    Object.keys(b).length === 2 && (b.kind === "new" || b.kind === "add") && isSlots(b.slots),
  );
  if (ctx instanceof Response) return ctx;
  if (ctx.view.exempt) return fail("EXEMPT");
  const answer = await callBilling(
    ctx.config,
    "/api/checkout",
    // Stripe Checkout asks for the email itself (sessions carry none).
    { user_id: ctx.view.userId, kind: ctx.body.kind, slots: ctx.body.slots },
    deps,
  );
  if (!answer) return fail("UNAVAILABLE");
  if (answer.ok !== true) return fail(LAMBDA_CODES[String(answer.code)] ?? "UNAVAILABLE");
  const url = typeof answer.url === "string" ? answer.url : "";
  // Only ever send the browser to Stripe's own Checkout host.
  let host = "";
  try {
    const u = new URL(url);
    host = u.protocol === "https:" ? u.host : "";
  } catch {}
  if (host !== CHECKOUT_HOST) return fail("UNAVAILABLE");
  return jsonNoStore({ ok: true, url });
}

export async function handleBillingFulfil(request: Request, deps: BillingRouteDeps = {}): Promise<Response> {
  const ctx = await context(request, deps, 512, (b) => Object.keys(b).length === 1 && typeof b.session_id === "string" && SESSION_ID.test(b.session_id));
  if (ctx instanceof Response) return ctx;
  const answer = await callBilling(ctx.config, "/api/fulfil", { user_id: ctx.view.userId, session_id: ctx.body.session_id }, deps);
  if (!answer) return fail("UNAVAILABLE");
  if (answer.ok !== true) return fail(LAMBDA_CODES[String(answer.code)] ?? "UNAVAILABLE");
  const result = ["granted", "already_paid", "waiting", "closed", "refused", "stale"].includes(String(answer.result)) ? String(answer.result) : "unknown";
  return jsonNoStore({ ok: true, result });
}
