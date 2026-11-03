// Star and comment limits (PRD, decided with the owner). This is the only
// place the numbers live; the store counts from the database and asks these
// pure functions for a decision.

export const INTERACTION_LIMITS = {
  commentMinIntervalSeconds: 20,
  newAccountHours: 24,
  newAccount: { perHour: 5, perDay: 100, maxLinks: 0 },
  regular: { perHour: 30, perDay: 100, maxLinks: 2 },
  maxCommentChars: 2000,
  duplicateWindowHours: 24,
  starTogglesPerHour: 60,
  maxPublicNameChars: 40,
} as const;

export type InteractionErrorCode =
  | "COMMENT_EMPTY"
  | "COMMENT_TOO_LONG"
  | "COMMENT_TOO_SOON"
  | "COMMENT_LINKS"
  | "COMMENT_DUPLICATE"
  | "RATE_LIMITED"
  | "NAME_INVALID";

export type Decision = { ok: true } | { ok: false; code: InteractionErrorCode };

const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

export function countLinks(text: string): number {
  return text.match(LINK)?.length ?? 0;
}

/** Trimmed text with runs of whitespace collapsed: the stored form. */
export function normalizeComment(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Checks that apply to both new comments and edits. */
export function bodyDecision(body: string, accountAgeHours: number): Decision {
  const text = normalizeComment(body);
  if (text === "") return { ok: false, code: "COMMENT_EMPTY" };
  if ([...text].length > INTERACTION_LIMITS.maxCommentChars) return { ok: false, code: "COMMENT_TOO_LONG" };
  if (countLinks(text) > tierOf(accountAgeHours).maxLinks) return { ok: false, code: "COMMENT_LINKS" };
  return { ok: true };
}

function tierOf(accountAgeHours: number) {
  return accountAgeHours < INTERACTION_LIMITS.newAccountHours
    ? INTERACTION_LIMITS.newAccount
    : INTERACTION_LIMITS.regular;
}

export type CommentContext = {
  accountAgeHours: number;
  secondsSinceLastComment: number | null;
  commentsLastHour: number;
  commentsLastDay: number;
  duplicateRecent: boolean;
  body: string;
};

export function commentDecision(c: CommentContext): Decision {
  const body = bodyDecision(c.body, c.accountAgeHours);
  if (!body.ok) return body;
  if (c.duplicateRecent) return { ok: false, code: "COMMENT_DUPLICATE" };
  if (c.secondsSinceLastComment !== null && c.secondsSinceLastComment < INTERACTION_LIMITS.commentMinIntervalSeconds)
    return { ok: false, code: "COMMENT_TOO_SOON" };
  const tier = tierOf(c.accountAgeHours);
  if (c.commentsLastHour >= tier.perHour || c.commentsLastDay >= tier.perDay)
    return { ok: false, code: "RATE_LIMITED" };
  return { ok: true };
}

export function starDecision(c: { togglesLastHour: number }): Decision {
  return c.togglesLastHour >= INTERACTION_LIMITS.starTogglesPerHour ? { ok: false, code: "RATE_LIMITED" } : { ok: true };
}

// Bare domains like "spam.com" also count as links in a name.
const DOMAIN = /\b[a-z0-9-]+\.(?:com|net|org|dev|io|ai|co|th|me|app|xyz|link|site|shop)\b/i;

/**
 * The member-chosen name shown with comments. "" is allowed and shows the
 * generic fallback; names never carry links or control characters.
 */
export function publicNameDecision(raw: string): { ok: true; name: string } | { ok: false; code: "NAME_INVALID" } {
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, code: "NAME_INVALID" };
  const name = raw.replace(/\s+/g, " ").trim();
  if ([...name].length > INTERACTION_LIMITS.maxPublicNameChars) return { ok: false, code: "NAME_INVALID" };
  if (countLinks(name) > 0 || DOMAIN.test(name)) return { ok: false, code: "NAME_INVALID" };
  return { ok: true, name };
}
