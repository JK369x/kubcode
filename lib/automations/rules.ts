// What the owner may send for an automation rule (docs/design/ig-comment-dm.md
// §4.1), checked and normalised to what kubcode_accounts.automation_rules
// accepts (migration 0010). Pure: no I/O, safe to import from the client.

export type MatchMode = "contains" | "exact";
export type ReplyPolicy = "after_dm" | "always";

export type RuleInput = {
  keywords: string[];
  matchMode: MatchMode;
  /** null: every post of the channel. */
  platformPostId: string | null;
  publicReply: string | null;
  /** null on TikTok, which has no private reply to a comment. */
  dmText: string | null;
  replyPolicy: ReplyPolicy;
  active: boolean;
};
export type RulePatch = Partial<RuleInput>;

export type RuleField = "body" | "keywords" | "matchMode" | "scope" | "publicReply" | "dmText" | "replyPolicy" | "active";
export type RuleErrorCode = "REQUIRED" | "INVALID" | "TOO_MANY" | "TOO_LONG";
export type RuleFailure = { ok: false; field: RuleField; code: RuleErrorCode };
export type Parsed<T> = { ok: true; value: T } | RuleFailure;

export const MAX_KEYWORDS = 20;
export const MAX_KEYWORD_CHARS = 100;
export const MAX_PUBLIC_REPLY_CHARS = 2200;
export const MAX_DM_CHARS = 1000;
/** Platforms whose comments the engine answers (docs/design/tiktok-channel.md). */
export type AutomationPlatform = "instagram" | "tiktok";
export const AUTOMATION_PLATFORMS: readonly AutomationPlatform[] = ["instagram", "tiktok"];
/**
 * What a TikTok rule keeps in the NOT NULL dm_text column (migration 0010):
 * the engine never sends it, TikTok has no private reply to a comment.
 */
export const TIKTOK_NO_DM = "(TikTok: no DM)";

/** Instagram media and TikTok video ids are digits; the column allows up to 128 characters. */
const POST_ID = /^[0-9]{1,64}$/;
const LINK = /https:\/\/\S+/;

export const RULE_ERROR_MESSAGES: Record<RuleField, Partial<Record<RuleErrorCode, string>>> = {
  body: { INVALID: "ข้อมูลคำขอไม่ถูกต้อง" },
  keywords: {
    REQUIRED: "ใส่คีย์เวิร์ดอย่างน้อย 1 คำ",
    INVALID: "คีย์เวิร์ดไม่ถูกต้อง",
    TOO_MANY: `ใส่คีย์เวิร์ดได้ไม่เกิน ${MAX_KEYWORDS} คำ`,
    TOO_LONG: `คีย์เวิร์ดแต่ละคำยาวได้ไม่เกิน ${MAX_KEYWORD_CHARS} ตัวอักษร`,
  },
  matchMode: { INVALID: "เลือกวิธีจับคีย์เวิร์ดไม่ถูกต้อง" },
  scope: { INVALID: "ใส่ ID โพสต์เป็นตัวเลขเท่านั้น หรือเลือกทุกโพสต์" },
  publicReply: {
    REQUIRED: "TikTok ตอบได้แค่ในคอมเมนต์ ส่ง DM ไม่ได้ ใส่ข้อความตอบใต้คอมเมนต์ด้วย",
    INVALID: "ข้อความตอบใต้คอมเมนต์ไม่ถูกต้อง",
    TOO_LONG: "ข้อความตอบใต้คอมเมนต์ยาวได้ไม่เกิน 2,200 ตัวอักษร" },
  dmText: {
    REQUIRED: "ใส่ข้อความ DM",
    INVALID: "ข้อความ DM ไม่ถูกต้อง",
    TOO_LONG: "ข้อความ DM ยาวได้ไม่เกิน 1,000 ตัวอักษร",
  },
  replyPolicy: { INVALID: "ตัวเลือกการตอบใต้คอมเมนต์ไม่ถูกต้อง" },
  active: { INVALID: "สถานะกฎไม่ถูกต้อง" },
};

export const ruleErrorMessage = (f: RuleFailure) => RULE_ERROR_MESSAGES[f.field][f.code] ?? RULE_ERROR_MESSAGES.body.INVALID!;

/** The page hints when the DM has no https link; the rule is still saved. */
export const dmHasLink = (text: string) => LINK.test(text);

/** Characters as PostgreSQL's char_length counts them (code points). */
const chars = (s: string) => [...s].length;
const fail = (field: RuleField, code: RuleErrorCode): RuleFailure => ({ ok: false, field, code });

function keywords(v: unknown): Parsed<string[]> {
  let raw: string[];
  if (typeof v === "string") raw = v.split(/[,\n]/);
  else if (Array.isArray(v) && v.every((k) => typeof k === "string")) raw = v;
  else if (v === undefined || (Array.isArray(v) && v.length === 0)) return fail("keywords", "REQUIRED");
  else return fail("keywords", "INVALID");
  const out = [...new Set(raw.map((k) => k.trim()).filter(Boolean))];
  if (out.length === 0) return fail("keywords", "REQUIRED");
  if (out.length > MAX_KEYWORDS) return fail("keywords", "TOO_MANY");
  if (out.some((k) => k.includes("\u0000"))) return fail("keywords", "INVALID");
  if (out.some((k) => chars(k) > MAX_KEYWORD_CHARS)) return fail("keywords", "TOO_LONG");
  return { ok: true, value: out };
}

function text(field: "dmText" | "publicReply", v: unknown, max: number, required: boolean): Parsed<string | null> {
  if (v === undefined || v === null) return required ? fail(field, "REQUIRED") : { ok: true, value: null };
  if (typeof v !== "string" || v.includes("\u0000")) return fail(field, "INVALID");
  const t = v.trim();
  if (!t) return required ? fail(field, "REQUIRED") : { ok: true, value: null };
  if (chars(t) > max) return fail(field, "TOO_LONG");
  return { ok: true, value: t };
}

function scope(v: unknown): Parsed<string | null> {
  if (typeof v !== "string") return fail("scope", "INVALID");
  const t = v.trim();
  if (t === "all") return { ok: true, value: null };
  return POST_ID.test(t) ? { ok: true, value: t } : fail("scope", "INVALID");
}

const oneOf =
  <T extends string>(field: RuleField, allowed: readonly T[]) =>
  (v: unknown): Parsed<T> =>
    allowed.includes(v as T) ? { ok: true, value: v as T } : fail(field, "INVALID");

const boolean = (v: unknown): Parsed<boolean> => (typeof v === "boolean" ? { ok: true, value: v } : fail("active", "INVALID"));

/** Body key -> how it is read and which RuleInput field it fills. */
const FIELDS = {
  keywords: { to: "keywords", read: keywords },
  mode: { to: "matchMode", read: oneOf<MatchMode>("matchMode", ["contains", "exact"]) },
  scope: { to: "platformPostId", read: scope },
  publicReply: { to: "publicReply", read: (v: unknown) => text("publicReply", v, MAX_PUBLIC_REPLY_CHARS, false) },
  dmText: { to: "dmText", read: (v: unknown) => text("dmText", v, MAX_DM_CHARS, true) },
  replyPolicy: { to: "replyPolicy", read: oneOf<ReplyPolicy>("replyPolicy", ["after_dm", "always"]) },
  active: { to: "active", read: boolean },
} as const satisfies Record<string, { to: keyof RuleInput; read: (v: unknown) => Parsed<unknown> }>;
type BodyKey = keyof typeof FIELDS;
const isBodyKey = (k: string): k is BodyKey => Object.hasOwn(FIELDS, k);

/** Reads the keys present in `body`; unknown keys are refused. */
function readPresent(body: Record<string, unknown>): Parsed<RulePatch> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (!isBodyKey(key)) return fail("body", "INVALID");
    const r = FIELDS[key].read(body[key]);
    if (!r.ok) return r;
    out[FIELDS[key].to] = r.value;
  }
  return { ok: true, value: out as RulePatch };
}

/** A new rule: keywords required, the rest defaulted; the platform's own needs are `checkFor`. */
export function parseRuleInput(body: Record<string, unknown>): Parsed<RuleInput> {
  const r = readPresent(body);
  if (!r.ok) return r;
  if (r.value.keywords === undefined) return fail("keywords", "REQUIRED");
  return {
    ok: true,
    value: {
      keywords: r.value.keywords,
      matchMode: r.value.matchMode ?? "contains",
      platformPostId: r.value.platformPostId ?? null,
      publicReply: r.value.publicReply ?? null,
      dmText: r.value.dmText ?? null,
      replyPolicy: r.value.replyPolicy ?? "after_dm",
      active: r.value.active ?? true,
    },
  };
}

/** A change to an existing rule: any non-empty subset, e.g. {active} to pause. */
export function parseRulePatch(body: Record<string, unknown>): Parsed<RulePatch> {
  if (Object.keys(body).length === 0) return fail("body", "INVALID");
  return readPresent(body);
}

/**
 * The platform's own needs on the whole rule (after a patch is applied):
 * Instagram sends a DM, so its text is required; TikTok can only answer in
 * public, so the public reply is required and any DM text is dropped.
 */
export function checkFor(platform: AutomationPlatform, rule: RuleInput): Parsed<RuleInput> {
  if (platform === "tiktok") {
    if (!rule.publicReply) return fail("publicReply", "REQUIRED");
    return { ok: true, value: { ...rule, dmText: null, replyPolicy: "always" } };
  }
  if (!rule.dmText) return fail("dmText", "REQUIRED");
  return { ok: true, value: rule };
}
