# Instagram comment → DM (slice 3) — verification and design

Status: **B chosen by the owner (2026-11-10)**; design approved (§4.8 decided the same day). Extends
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

## 3. Decision: our own engine (B) — owner, 2026-11-10

| | A. Zernio Comment Automations | B. Our engine on Zernio primitives |
|---|---|---|
| What we build | rule CRUD in our DB, sync to `/v1/comment-automations`, pause at the cap, read logs for counts | webhook `comment.received` → match → dedupe table → public reply → private reply; our catch-up poll; logs |
| Correctness risk | low: once-per-comment, 7-day limit, dedupe, catch-up are Zernio's | higher: private reply has no idempotency key, ambiguous 502, `isOwnAccount` filtering, missed webhooks |
| Cost per DM after free tiers | ~$0.0021 ($2/1k runs + $0.1/1k messages) | ~$0.0001 |
| At the 5k DMs/channel/month cap | **~$10.5/channel** (vs $6/channel price) | ~$0.50/channel |
| Dedupe "one DM per person per post" | per-post automation + `once`; an all-posts rule with `once` is one DM per person **ever** (stricter) | exactly as specified |
| Leaving Zernio later (phase 2) | rules are Zernio objects; re-create natively | engine is ours; only the two send calls change |

Chosen: **B**, because the per-channel price cannot carry
A's cost at the cap and the engine is the part we would keep in phase 2; the risks of B are
bounded by design (§4). If the owner prefers speed now (owner-only, likely inside the free 2,000
runs, possibly no charge for pre-balance accounts), A is acceptable for the owner's own channel and
B before creators pay.

## 4. Design (B)

### 4.1 Domain (CONTEXT.md terms)

- **Automation rule** (per Instagram Channel): `keywords[]` (matched case-insensitively, `contains`
  by default, `exact` optional), scope `all posts` or one post (`platform_post_id`), `public_reply`
  text, `dm_text` (plain text; the link is written into it, default `https://kubcode.dev/go/<slug>`),
  `reply_policy` = `after_dm` (default, owner 2026-11-10) | `always`, `active`.
- **Inbox item**: one received comment (Zernio comment id, platform post id, author id, received at).
  The text is used for matching and not stored beyond it.
- **DM ledger**: one row per `(channel, platform_post_id, author_id)` — the "one DM per person per
  post" key — with the comment it answered, the rule, and the outcome per leg.

### 4.2 Flow

1. `POST /webhooks/zernio` (existing route, existing signature check and event dedupe) translates
   `comment.received` into `CommentReceived`. It only **records** the Inbox item and answers 2xx
   (Zernio wants 2xx within 5 s; the sends happen in step 3).
2. Ignored at record time: `author.isOwnAccount` (our own replies come back), replies to replies
   (`isReply`), comments older than 7 days (a private reply is no longer possible), channels
   without an active rule.
3. A **worker** takes recorded items in order:
   - match rules (post-scoped first, then all-posts; first match wins);
   - **claim** the ledger row (insert; a conflict means this person already got a DM for this
     post → `duplicate`);
   - cap: count this channel's DMs this month (`dm_sent` + `dm_unknown`); at the cap → `cap_reached`;
   - **private reply** first (plain text with the link);
   - then the **public reply** if `reply_policy` says so (`after_dm`: only after `dm_sent`), with an
     `Idempotency-Key` derived from the comment id.
4. **Catch-up:** the same worker reads recent comments of channels with active rules every 10
   minutes and records the ones it has not seen; the ledger makes it idempotent.

### 4.3 Private reply: at most once, by us

The endpoint has no `Idempotency-Key` and Instagram allows one private reply per comment. So the
ledger row moves `claimed → dm_sending → dm_sent | dm_failed | dm_unknown`, and **`dm_sending` is
written before the call**. A row found in `dm_sending` (crash, timeout, 502) becomes `dm_unknown`
and is **never retried**; `400 privateReplyConsumed` is terminal (`dm_consumed`). At-most-once is
the right trade: a duplicate DM is worse than a missing one, and Instagram refuses a second one
anyway.

### 4.4 Cap and counting

`fair_use_dms_per_month` = 5,000 per channel (config). Counted from the ledger per calendar month
(Asia/Bangkok). Matches beyond it are recorded as `cap_reached` and not sent.

### 4.5 Outcome codes and logs

One line per item, no text, ids or usernames:
`[automations] channel=<uuid> outcome=<code>` with codes `dm_sent`, `dm_failed_<category>`,
`dm_unknown`, `dm_consumed`, `duplicate`, `no_rule`, `cap_reached`, `own_account`, `too_old`,
`reply_sent`, `reply_failed_<category>`.

### 4.6 Owner UI

`/account/channels/<id>/automations` (owner-only, flag `KUBCODE_AUTOMATIONS_ENABLED`): list, add,
edit, pause rules; this month's DM count against the cap; last outcomes. Same style and guards as
`/account/channels` (session, member, RLS, CSRF). Writes go through the web host to our DB only (no
Zernio call), so no new Lambda route is needed for the UI.

### 4.7 Setup

- Zernio webhook subscription gains `comment.received` (admin step, `publishing-secrets.sh webhook`
  updated); the existing secret signs it.
- Read-only scope check on @lokeekbaebkub before E2E: `instagram_business_manage_comments` and
  `instagram_business_manage_messages` granted.

### 4.8 Decided (2026-11-10)

1. **Worker:** EventBridge Scheduler every minute invokes the publishing Lambda in a `worker` mode:
   one mechanism for sending and catch-up, at most about a minute's delay. An async self-invoke from
   the webhook is added only if a minute proves too slow.
2. **Keywords:** before matching, the comment and the keywords are case-folded, zero-width
   characters (U+200B–U+200D, U+2060, U+FEFF) removed and runs of whitespace collapsed; then
   `contains` (default) or `exact` (the whole normalised comment). Thai has no spaces between words,
   so there is no word mode.

## 5. Next steps

1. Read-only scope check (Keychain prompt, when the owner is at the keyboard).
2. TDD in slices: (i) webhook translation + Inbox item + ignore rules; (ii) matcher + ledger +
   cap; (iii) Zernio adapter calls (OpenAPI fixtures) + worker; (iv) owner UI; (v) schedule +
   webhook subscription.
3. Local E2E against real Zernio in protected mode on @lokeekbaebkub; **no real reply or DM before
   the owner approves in the session and makes the test comment**. Then PR, deploy behind the flag.
