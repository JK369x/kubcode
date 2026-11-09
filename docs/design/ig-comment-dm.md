# Instagram comment → DM (slice 3) — verification and design

Status: **verification done (2026-11-10); one owner decision open (§3)**. Extends
`docs/design/publishing-core.md` (Automation rule, Inbox item; the Automations port of ADR 0004).

## 1. Goal

Per connected Instagram **Channel**, the owner keeps a list of **Automation rules**: keyword(s),
one post or all posts, a public reply text (e.g. "ส่งให้ใน DM แล้วนะ") and a DM text with a link
(default `https://kubcode.dev/go/<slug>`). A matching comment gets the public reply and a private
reply DM. One DM per person per post. DMs are counted per channel per month against the fair-use
cap (~5,000). Owner-only behind a flag first, page in the style of `/account/channels`.

## 2. What Zernio offers (verified against the OpenAPI spec v1.529.3 and docs.zernio.com)

Line numbers are `https://zernio.com/openapi.yaml` lines (2026-11-09 copy).

### 2.1 Comment Automations do both legs

`/v1/comment-automations` (L70390; `/{id}` L70672; `/{id}/logs` L70873):

- Instagram: "the full DM automation (private reply, buttons, product card, audience rules, follow
  gate) plus the optional public reply" (L70467). `dmMessage` required (~1000 chars, 640 with
  buttons), `commentReply` optional, both with up to 5 variations; `buttons` 1–3.
- `publicReplyPolicy`: `after_dm` (default, reply only after a successful DM) or `always`. "The
  reply never goes out before the DM." (L70604)
- Matching: `keywords[]` (empty = every comment), `matchMode` `contains` (default; fires inside
  words: "app" matches "happy"), `word`, `exact`; `excludeKeywords`. Thai word segmentation for
  `word` mode is not documented.
- Scope: `platformPostId` for one post (only **one active automation per post**, a second is 409)
  or omitted for the whole account (stackable; per-post wins on its post) (L70512–70515).
- Pickup: webhook plus a 10-minute poll of recent comments; "A comment is answered at most once"
  (L70506–70508).
- Dedupe: `repeatPolicy` `once` (default: one DM per person **per automation**, ever) or
  `every_comment` (+ `cooldownHours`); `dedupeSameTextHours` across automations (L4244, L70603).
- Per-comment logs (`CommentAutomationLog`, L4295): `commentReplyStatus`, `privateReplyConsumed`,
  `publicReplyPostedAt`.

Workflows (`/v1/workflows`) have a `comment` trigger whose first `send_message` is the private
reply, but **no public-reply node** (L3505–3522); an active comment automation that matches
pre-empts the workflow (L3550). Workflows are only useful for follow-ups after a button tap.

### 2.2 The pieces to drive it ourselves

- `comment.received` webhook (`WebhookPayloadComment`, L6894): event `id`, `comment{id,
  platformPostId, text, author{id, username, isOwnAccount}, isReply, …}`, `post{…}`,
  `account{accountId, …}`. Our own replies come back as comments (`isOwnAccount`, L6946).
- Public reply: `POST /v1/inbox/comments/{postId}` `{accountId, message, commentId}` (L56115),
  `Idempotency-Key` supported (24 h, L56130).
- Private reply: `POST /v1/inbox/comments/{postId}/{commentId}/private-reply` `{accountId, message,
  buttons|quickReplies}` (L56819). **No `Idempotency-Key`.** A failure can still spend the single
  reply (`400 details.privateReplyConsumed: true`; a `502` "is usually delivered").
- Missed webhooks are ours to catch up (`GET /v1/inbox/comments*`, 1,800/h per team, L152).

### 2.3 Instagram limits (as Zernio documents them)

- **One private reply per comment, within 7 days** (L56827).
- **Non-followers:** buttons, cards and attachments may be refused (Meta code 2 / 1545133) and the
  refused call still spends the reply. The spec says it is uneven ("most accounts do not get it",
  L56838); two docs pages say plain text only. Plain text with the link written in it is the safe
  first DM. Whether a URL in plain text is ever blocked: not documented.
- First DMs to cold commenters land in **Message Requests**; quick-reply chips do not render there
  (L70606). Follower status of commenters is mostly unknown (L70521).
- **24-hour window:** automated messages only inside it; `HUMAN_AGENT` (7 days) is for replies typed
  by a person (L53971).
- Needs an Instagram Business/Creator account. Instagram Login scopes
  `instagram_business_manage_comments` and `instagram_business_manage_messages` (L39288). Zernio asks
  for every scope unless `scopes` is passed; our connect does not pass it, so both should be
  granted — **to confirm on the real account (account health/permissions) before building**.

### 2.4 Cost (pricing docs, 2026-11-10)

| Item | Included per month (team-wide) | Beyond |
|---|---|---|
| Automation runs ("Comment to DM: a DM sent to one commenter"; no-match/skip/fail free) | 2,000 | **$2 per 1,000** |
| Inbox outbound messages (automation DMs count here too) | 10,000 | $1 per 10,000 |
| Public comment replies, reading | not metered | — |

"Accounts created before the balance keep running automations at no charge for now." The spec
still mentions a legacy `INBOX_REQUIRED` addon (L519); the docs call it legacy.

### 2.5 Rate limits

Team-wide API 60/min (0–2 accounts), 600/min (3–2,000), sliding (L146). Comment reads 1,800/h per
team. Per-account caps for replies/DMs and Meta's own messaging caps are not documented.

### 2.6 Webhooks

`comment.received`, `message.received` (outbound automation sends carry `automationId`), explicit
subscription per event, same `X-Zernio-Signature` scheme, dedupe on the event id; 7 attempts over
~51 h; answer 2xx within 5 s; any other 4xx stops delivery.

## 3. Open decision: Zernio automations or our own engine

| | A. Zernio Comment Automations | B. Our engine on Zernio primitives |
|---|---|---|
| What we build | rule CRUD in our DB, sync to `/v1/comment-automations`, pause at the cap, read logs for counts | webhook `comment.received` → match → dedupe table → public reply → private reply; our catch-up poll; logs |
| Correctness risk | low: once-per-comment, 7-day limit, dedupe, catch-up are Zernio's | higher: private reply has no idempotency key, ambiguous 502, `isOwnAccount` filtering, missed webhooks |
| Cost per DM after free tiers | ~$0.0021 ($2/1k runs + $0.1/1k messages) | ~$0.0001 |
| At the 5k DMs/channel/month cap | **~$10.5/channel** (vs $6/channel price) | ~$0.50/channel |
| Dedupe "one DM per person per post" | per-post automation + `once`; an all-posts rule with `once` is one DM per person **ever** (stricter) | exactly as specified |
| Leaving Zernio later (phase 2) | rules are Zernio objects; re-create natively | engine is ours; only the two send calls change |

Recommendation (to confirm with the owner): **B**, because the per-channel price cannot carry
A's cost at the cap and the engine is the part we would keep in phase 2; the risks of B are
bounded by design (§4). If the owner prefers speed now (owner-only, likely inside the free 2,000
runs, possibly no charge for pre-balance accounts), A is acceptable for the owner's own channel and
B before creators pay.

## 4. Design sketch (B; adjusted if A is chosen)

- **Domain** (CONTEXT.md terms): Automation rule `{channel, keywords[], match: contains|word|exact,
  post: one|all, public_reply, dm_text, dm_link_slug, active}`; Inbox item for each received
  comment; a **DM ledger** row per (channel, post, author) — the dedupe key — with outcome code.
- **Flow:** `comment.received` (signed, deduped by event id) → ignore `isOwnAccount` and replies →
  match rules (post-scoped first) → ledger insert (unique; a conflict means already handled) →
  public reply (with `Idempotency-Key`) → private reply, plain text with the link (never retried
  after a 400 with `privateReplyConsumed` or a 502; recorded as `unknown`). Policy for the public
  reply when the DM fails: owner decision (Zernio's default is reply only after a DM).
- **Cap:** monthly count per channel from the ledger; at the cap new matches are recorded as
  `cap_reached` and nothing is sent.
- **Catch-up:** a scheduled read of recent comments for channels with active rules, through the same
  path (ledger makes it idempotent).
- **Logs:** one line per comment outcome (`[automations] channel=… outcome=<code>`), no text, ids or
  usernames.
- **Safety in tests:** localhost-first; the protected local runner on @lokeekbaebkub; **no real reply
  or DM without the owner's approval in the session**, and the owner makes the test comment.

## 5. Next steps

1. Owner decision on §3 (A or B) and on the public-reply policy when the DM fails.
2. Read-only check of the real IG account: granted scopes / account health.
3. Then: grill the remaining product details, TDD the engine with OpenAPI-sourced fixtures, local
   E2E, PR, deploy behind the flag.
