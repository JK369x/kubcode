# TikTok channel: connect, publish, keyword reply

Status: built 2026-11-10 (owner request: post the reel to TikTok @kubcode and IG @kube.code, answer
the comment keyword "egm"). This extends `docs/design/publishing-core.md` and
`docs/design/ig-comment-dm.md`. No migration.

## 1. What Zernio documents (openapi.yaml, 2026-11-10 copy)

- **Connect:** `GET /v1/connect/tiktok`. Every new connection goes through the TikTok for Business
  app. The account itself does not have to be a Business Account. If the user leaves out a permission
  on TikTok's screen, nothing changes and the flow returns `error=missing_tiktok_permissions`. We do
  not pass `scopes`, so every area is requested (comments included). TikTok `open_id`s are scoped to
  each app.
- **Publish:** `platformSpecificData` = `TikTokPlatformData`. Direct post (`draft: false`). On
  Business connections, videos go out **public only**: a non-public `privacyLevel` is rejected when
  the post is created. `allowComment`/`allowDuet`/`allowStitch` must be sent (TikTok forbids defaults).
  `contentPreviewConfirmed` and `expressConsentGiven` record the creator's preview and consent.
  `videoCoverImageUrl` is handed to TikTok as the cover. Captions can be up to 2,200 characters.
- **Daily cap:** 15 videos per account per trailing 24 h. A post over the cap is **held, not
  rejected**, and goes out when a slot frees up. We enforce 15 per day ourselves (config).
- **Late URL:** TikTok reports the video id asynchronously. `post.published` can arrive with an empty
  URL, and `post.tiktok.url_resolved` brings it later (also for videos still processing, for up to
  48 h).
- **Comments:** `comment.received` fires for TikTok in real time. It carries only the author id;
  `isOwnAccount` is inferred. Replies go through `POST /v1/inbox/comments/{postId}` with
  `Idempotency-Key`. `postId` is the TikTok video id.
- **No private reply to a comment on TikTok.** TikTok DMs need a real Business Account registered
  outside the EEA, CH and UK, plus TikTok messaging approval. **We do not build TikTok DMs.**

## 2. Publish

`Platform::TikTok` limits (`validate.rs`): the frame must be 9:16 (±2 %), video up to 10 minutes,
caption up to 2,200 characters, no title, public only, the designed cover is mandatory, and the daily
cap is 15. The adapter sends the fields above, plus comments on and duet/stitch off. The CLI
refuses a non-public schedule that includes a TikTok channel before it uploads anything, and its
summary tells the owner what they are agreeing to.

## 3. Keyword reply (public only)

The same rules, matcher, Inbox items and ledger as Instagram. For a channel whose platform is
`public_reply_only()` (TikTok), the worker:

1. requires the rule's public reply (`no_public_reply` otherwise; the web form refuses a TikTok rule
   without one, with the message "TikTok ตอบได้แค่ในคอมเมนต์ ส่ง DM ไม่ได้");
2. checks the monthly cap (`dm_cap_per_month`, counted as public replies on that channel);
3. claims the ledger row: one answer per `(channel, post, author)`, the same key as Instagram;
4. posts the public reply with `Idempotency-Key: kubcode-reply-<comment id>`. If a run is
   interrupted after the claim, the next run finishes it, and the key makes the resend harmless.

Ledger rows stay `dm_state = 'claimed'`. `reply_state` records `sent` / `failed` / `skipped`.
Outcome codes are `reply_sent`, `reply_failed`, `no_public_reply`, `duplicate` and `cap_reached`.
A TikTok rule stores the fixed placeholder `(TikTok: no DM)` in the NOT NULL `dm_text` column. It
is never sent and never shown.

## 4. Local E2E

`scripts/local-e2e/run.sh tiktok` drives the connect flow (`docs/dev/local-e2e.md`). It needs the
owner's TikTok login and consent, and it uses a Zernio account slot. Only the owner runs it.
