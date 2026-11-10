// Handlers for the owner's automation rules (docs/design/ig-comment-dm.md §4.6):
//   POST   /api/channels/{id}/automations            {rule}    -> {ok, rule}
//   PATCH  /api/channels/{id}/automations/{ruleId}   {fields}  -> {ok, rule}   ({active} pauses/resumes)
//   DELETE /api/channels/{id}/automations/{ruleId}             -> {ok}
// Writes go to our database only (no provider call); the worker reads them.
import type { AuthEnv } from "../auth-policy";
import { readAccountsConfig } from "../accounts/config";
import { logDbFailure } from "../accounts/db";
import { ACCOUNT_ERRORS, accountErrorResponse, type AccountErrorCode } from "../accounts/errors";
import { jsonNoStore } from "../accounts/http";
import type { SessionClaims } from "../accounts/session";
import { guardWrite } from "../interactions/http";
import { sessionOf } from "../keys/connect-routes";
import { readAutomationsConfig } from "./config";
import { parseRuleInput, parseRulePatch, ruleErrorMessage, type Parsed, type RuleFailure } from "./rules";
import { getAutomationStore, MAX_RULES_PER_CHANNEL, type AutomationFailure, type AutomationStore } from "./store";

export type AutomationRouteDeps = {
  env?: AuthEnv;
  storeFor?: (databaseUrl: string) => AutomationStore;
};

/** Keywords and texts fit well inside this; the DM alone is at most ~4 KB of UTF-8. */
export const MAX_RULE_BODY_BYTES = 8 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type RouteError = "NOT_FOUND_FEATURE" | "UNAVAILABLE" | AutomationFailure["code"];
const ERRORS: Record<RouteError, { status: number; message: string }> = {
  NOT_FOUND_FEATURE: { status: 404, message: "ไม่พบหน้านี้" },
  UNAVAILABLE: { status: 503, message: "ระบบตอบคอมเมนต์อัตโนมัติใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง" },
  FORBIDDEN: { status: 403, message: "คุณไม่มีสิทธิ์ใช้ระบบโพสต์" },
  NOT_SIGNED_IN: ACCOUNT_ERRORS.NOT_SIGNED_IN,
  CHANNEL_NOT_FOUND: { status: 404, message: "ไม่พบช่อง Instagram หรือ TikTok นี้" },
  RULE_NOT_FOUND: { status: 404, message: "ไม่พบกฎนี้ อาจถูกลบไปแล้ว โหลดหน้าใหม่อีกครั้ง" },
  RULE_LIMIT: { status: 409, message: `ช่องนี้มีกฎครบ ${MAX_RULES_PER_CHANNEL} ข้อแล้ว ลบกฎที่ไม่ใช้ก่อน` },
};

const errorResponse = (code: RouteError) =>
  Response.json({ code, message: ERRORS[code].message }, { status: ERRORS[code].status, headers: { "Cache-Control": "no-store" } });

const invalidRule = (f: RuleFailure) =>
  Response.json(
    { code: "INVALID_RULE", field: f.field, message: ruleErrorMessage(f) },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );

/** Ids, flag, accounts, Origin/CSRF/body, rule shape, session; then one store call. */
async function handle<T>(
  request: Request,
  ids: string[],
  deps: AutomationRouteDeps,
  read: { body: false } | { body: true; parse: (b: Record<string, unknown>) => Parsed<T> },
  run: (store: AutomationStore, session: SessionClaims, value: T) => Promise<({ ok: true } & Record<string, unknown>) | AutomationFailure | RuleFailure>,
): Promise<Response> {
  if (!ids.every((id) => UUID.test(id))) return accountErrorResponse("BAD_REQUEST");
  const env = deps.env ?? process.env;
  const config = readAutomationsConfig(env);
  if (config.mode === "off") return errorResponse("NOT_FOUND_FEATURE");
  const accounts = readAccountsConfig(env);
  if (config.mode !== "on" || accounts.mode !== "on") return errorResponse("UNAVAILABLE");
  const guarded = await guardWrite(request, MAX_RULE_BODY_BYTES, { body: read.body });
  if (!guarded.ok) return accountErrorResponse(guarded.code as AccountErrorCode);
  let value = undefined as T;
  if (read.body) {
    const parsed = read.parse(guarded.body);
    if (!parsed.ok) return invalidRule(parsed);
    value = parsed.value;
  }
  const session = await sessionOf(request, env);
  if (!session) return errorResponse("NOT_SIGNED_IN");
  const store = deps.storeFor?.(accounts.databaseUrl) ?? getAutomationStore(accounts.databaseUrl);
  try {
    const r = await run(store, session, value);
    if (r.ok) return jsonNoStore(r);
    // The rule does not fit the channel's platform (TikTok: public reply required).
    if ("field" in r) return invalidRule(r);
    return errorResponse(r.code);
  } catch (error) {
    logDbFailure("AUTOMATION_RULES", error);
    return errorResponse("UNAVAILABLE");
  }
}

export function handleRuleCreate(request: Request, channelId: string, deps: AutomationRouteDeps = {}): Promise<Response> {
  return handle(request, [channelId], deps, { body: true, parse: parseRuleInput }, (store, s, input) => store.create(s, channelId, input));
}

export function handleRuleUpdate(request: Request, channelId: string, ruleId: string, deps: AutomationRouteDeps = {}): Promise<Response> {
  return handle(request, [channelId, ruleId], deps, { body: true, parse: parseRulePatch }, (store, s, patch) =>
    store.update(s, channelId, ruleId, patch),
  );
}

export function handleRuleDelete(request: Request, channelId: string, ruleId: string, deps: AutomationRouteDeps = {}): Promise<Response> {
  return handle(request, [channelId, ruleId], deps, { body: false }, (store, s) => store.remove(s, channelId, ruleId));
}
