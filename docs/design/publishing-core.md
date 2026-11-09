# Design — Publishing core, phase 1 on Zernio, swappable per platform and capability

Status: **approved 2026-11-09; slice 1 built (#39–#45)** · 2026-11-09 · ADR `docs/adr/0004-publishing-core-zernio-first.md`
Inputs: orchestrator `decisions/2026-11-08-publishing-two-phase.md`, `docs/zernio-research-2026-11-08.md`,
`docs/scheduler-prd.md`, `docs/scheduler.md`; repo ADR 0001–0003, `docs/design/settings-keys.md`,
`infra/README.md`. Zernio facts below were read from docs.zernio.com on 2026-11-09 (URLs in §12).

Grill answers (orchestrator, 2026-11-09): every recommended default accepted, except that the web
schedule + confirm page is **slice 2** (the CLI confirm is only the slice-1 proof). The owner still has
to choose the first two channels and the test clip (§10). **Nothing is posted externally until the
orchestrator passes on the owner's OK.**

## 0. Findings that shape the design (read first)

1. **Zernio can set a custom YouTube thumbnail** (`mediaItems[].thumbnail`, a URL; JPG/PNG, docs say
   2 MB on one page and 10 MB on another, so we keep covers ≤ 2 MB) and a Reel cover
   (`platformSpecificData.instagramThumbnail`). The owner's mandatory-cover rule does not force native
   YouTube on day one.
2. **Zernio holds the schedule.** `scheduledFor` + `timezone`; for public YouTube it uploads early as
   private with YouTube's own `publishAt`. Phase 1 needs **no EventBridge**. Native IG (phase 2) will.
   Zernio does not document a maximum horizon, so the adapter has a configured `max_ahead` and refuses at
   validate time (orchestrator note); start at 30 days and change it once Zernio confirms.
3. **Rate limit is 60 req/min while we have ≤ 2 accounts** (600 from the 3rd, 1,200 above 2,000),
   shared by the whole team, i.e. by every creator. Plus 25 posts/hour/account (held, not rejected)
   and daily caps (IG 100, TikTok 15, others 50).
4. **Inbox is included** with every account (comments + DMs, comment automations, workflows). Only
   outbound messages are metered: 10,000/month/team free, then $1 per 10,000; over the allowance with no
   card, sends fail with `403 message_allowance_exceeded`. `INBOX_REQUIRED` applies to legacy plans only.
5. **Webhook signature has no timestamp** (`X-Zernio-Signature` = lowercase hex HMAC-SHA256 of the raw
   body). Replay protection is ours: unique event id + stored raw-body hash (§6.3).
6. **Zernio is the app of record and cannot export tokens.** Leaving Zernio for a platform = every
   channel on that platform reconnects. So every post, delivery, receipt, inbox item and rule lives in
   **our** DB under **our** ids; Zernio holds only what it needs to execute.
7. Not built yet from the scheduler PRD: `kubcode push`, the clips table, publishers. This design
   replaces scheduler slices 3–5 for Zernio-backed channels; BYOK settings (slice 2, merged) stay as the
   native path.

## 1. Language (added to `CONTEXT.md`)

**Workspace** owns channels and is the unit billed per channel later; one Creator owns one Workspace
now (the owner's first). **Channel**: one social account on one platform inside a workspace (a YouTube
channel, an IG account). **Provider**: who executes a capability for a channel, `zernio` or `native`.
**Connection**: a channel's link through one provider. **Post**: what the creator wants published (one
clip, its texts and cover). **Delivery**: one post going to one channel at one time. **Receipt**: proof
that a delivery went out (platform id, URL, cover check). **Inbox item**: a comment or message received
on a channel. **Automation rule**: e.g. comment keyword on a post → DM. "customer" stays avoided.

## 2. Domain owned by kubcode

All ids are our UUIDs. Provider ids (`provider_ref`) are opaque strings written and read **only by
adapters**; routes, UI, CLI output and logs never show them.

```
Workspace 1─* WorkspaceMember(user, role=owner)        Workspace 1─* ProviderProfile(provider, provider_ref)
Workspace 1─* Channel(platform, display_name, handle, status)
Channel 1─* Connection(provider, provider_ref, status)  ── at most one active per (channel, provider)
Workspace 1─* MediaAsset(kind video|cover, s3_key, sha256, bytes, w, h, seconds)
Workspace 1─* Post(clip_ref, title, description, tags, cover, video, confirm_digest, status)
Post 1─* Delivery(channel, connection pinned at schedule, provider, publish_at, visibility,
                  options, status, provider_ref, idempotency_key, last_error_code)
Delivery 1─0..1 Receipt(platform_url, published_at, cover_check)
Channel 1─* InboxItem(kind comment|message, delivery?, author_handle, text, received_at)
Channel 1─* AutomationRule(kind comment_to_dm, delivery?, keywords, match, dm_text, button, reply, enabled,
                           provider, provider_ref)
```

### 2.1 Lifecycles

**Channel / connection**

```
(start) ─connect_start→ intent open ─callback ok + verified→ Channel active, Connection active
Connection active ─account.disconnected | token error→ needs_reconnect ─reconnect→ active
Connection active ─creator disconnects→ revoked (provider disconnect called; row kept for history)
Channel status = active if it has an active connection for every capability its routes need,
                 needs_reconnect otherwise, disconnected if it has no non-revoked connection.
```

**Post / delivery**

```
Post: draft ─confirm(digest)→ confirmed ─cancel→ cancelled          (any edit voids the confirm → draft)
Delivery: pending ─schedule ok→ scheduled ─(provider) publishing→ published ─cover check→ receipt.cover_check
                     │                 └─failed (code) ─retry→ scheduled
                     └─validate fails→ rejected (never sent)        scheduled ─cancel→ cancelled
```

Transitions are monotonic by rank (`published` and `cancelled` are final); a late or out-of-order
webhook cannot move a delivery backwards. Confirmation rules are the scheduler PRD's: explicit
"ยืนยันตั้งเวลา" on a full summary (video, cover, title, description, tags, channel, time), digest-bound;
any edit voids it; AI-pushed clips wait unconfirmed.

## 3. Ports (Rust traits, crate `kubcode-publishing`)

One trait per capability. Every method takes and returns domain types; adapter errors are mapped to
`PublishError` (§3.3) before they leave the adapter.

```rust
pub enum Platform { YouTube, Instagram, TikTok, Facebook, Threads, LinkedIn, X, Pinterest, Bluesky }
pub enum Capability { Connect, Publish, Inbox, Automations, Analytics }
pub enum ProviderKind { Zernio, Native }

pub trait ConnectProvider {
    async fn start(&self, ws: &WorkspaceRef, platform: Platform, return_to: &CallbackUrl) -> Result<ConnectStart>;
    async fn complete(&self, ws: &WorkspaceRef, platform: Platform, cb: &CallbackParams) -> Result<ConnectedAccount>;
    async fn disconnect(&self, conn: &ConnectionRef) -> Result<()>;
    async fn health(&self, ws: &WorkspaceRef) -> Result<Vec<ConnectionHealth>>;
}

pub trait Publisher {
    /// Provider/platform-specific limits on top of the core rules (§3.2). Pure, no network.
    fn validate(&self, d: &DeliveryDraft) -> Vec<Violation>;
    /// Hands the delivery to the provider. Idempotent on `d.idempotency_key`.
    async fn schedule(&self, d: &DeliveryRequest, media: &dyn MediaSource) -> Result<ProviderRef>;
    async fn cancel(&self, r: &ProviderRef) -> Result<()>;
    async fn status(&self, r: &ProviderRef) -> Result<DeliveryState>;
}

pub trait Inbox {
    async fn list(&self, ch: &ConnectionRef, since: Cursor) -> Result<Page<InboxItemIn>>;
    async fn reply_comment(&self, ch: &ConnectionRef, item: &ProviderRef, text: &str) -> Result<()>;
    async fn send_message(&self, ch: &ConnectionRef, convo: &ProviderRef, msg: &OutboundMessage) -> Result<()>;
}

pub trait Automations {
    fn validate(&self, rule: &AutomationRuleDraft) -> Vec<Violation>;
    async fn install(&self, rule: &AutomationRule) -> Result<ProviderRef>;
    async fn remove(&self, r: &ProviderRef) -> Result<()>;   // edit = remove + install (Zernio has no update yet)
}

pub trait EventSource {
    /// Verify + translate one webhook delivery into domain events. No DB access.
    fn verify(&self, headers: &Headers, raw_body: &[u8]) -> Result<VerifiedDelivery>;
    fn translate(&self, d: &VerifiedDelivery) -> Vec<DomainEvent>;
}
// Analytics: later; same shape (fetch per delivery / per channel).
```

`MediaSource` gives an adapter a streaming reader for a `MediaAsset` (S3 GetObject) plus its metadata;
adapters never see S3 keys. Domain events are a closed enum: `DeliveryPublished{delivery, url,
platform_id, at}`, `DeliveryFailed{delivery, code}`, `ConnectionLost{connection, code}`,
`CommentReceived{..}`, `MessageReceived{..}`, `Ignored{kind}`. Translation resolves provider refs to our
ids through the store; an unknown ref is `Ignored` (logged by fixed code, stored for 30 days).

### 3.1 Provider routing table

```
provider_routes(platform, capability, provider, PRIMARY KEY(platform, capability))
seed (0007): every (platform, capability) → zernio
```

Data, not code: flipping YouTube publishing to native is one `UPDATE`, done by an operator script with
audit, not a deploy. Resolution for a delivery:

1. `route = provider_routes[platform, capability]`.
2. The channel must have an **active connection with that provider**. If not, and the channel has an
   active connection with the previous provider and `provider_routes.allow_fallback` is true (the
   dual-run window, §8), use that one. Otherwise the channel shows **ต้องเชื่อมใหม่** for that capability.
3. The chosen `connection_id` and `provider` are **pinned on the delivery** at schedule time. A route
   flip never moves an already-scheduled delivery.

The routes also decide which provider a **new** connect uses (`capability = connect`).

### 3.2 Validation (core first, then adapter)

Core rules, the same for every adapter (so native adapters cannot forget them):
- **Cover mandatory** for YouTube and Instagram (and every video platform that takes one): a
  `MediaAsset(kind=cover)` must exist, be JPG/PNG and ≤ 2 MB. It must be the designed file named by
  `clip.json` `cover.file`, never a video frame; `kubcode push` refuses a clip without one, and no
  adapter may fall back to a frame offset (`thumbOffset`) or the platform's auto-pick.
- Title/description/tag lengths per platform (YouTube title ≤ 100, description ≤ 5,000, tags ≤ 500
  combined; IG caption ≤ 2,200), aspect/duration/size per platform (Reels ≤ 15 min, 300 MB).
- Not in the past; not beyond the adapter's `max_ahead`.
- **Velocity**: our own count of scheduled deliveries for that channel in the same hour (≤ 25) and day
  (platform cap). Checked in the DB at confirm time, so Zernio never "holds" a post silently.
- Posting limit per creator (ADR 0003) plugs in here later; the owner's workspace is unlimited.

Adapter `validate` adds provider-only limits (e.g. Zernio's media ≤ 5 GB, upload age ≤ 7 days).

Numbers that may change (`max_ahead` 30 days, cover cap 2 MB, velocity 25/h, daily caps, API 60/min)
are **config** (`PublishingConfig`, read from Lambda env with these defaults), not constants
(orchestrator note b).

### 3.3 Errors

`PublishError` = fixed code (`[a-z_]{1,40}`, the existing `last_error_code` shape) + class:

| Class | Retry? | Zernio mapping |
|---|---|---|
| `needs_reconnect` | no, mark connection | 401 `TOKEN_EXPIRED`, 403 `ACCOUNT_DISCONNECTED`, `account_not_found` |
| `rate_limited{retry_after}` | yes, after delay | 429 (+ `Retry-After`), `409 idempotency_conflict` |
| `rejected` | no, show creator | `platform_error` with platform code → `platform_rejected_<short>`; `invalid_field_value` from media |
| `provider_billing` | no, alert owner | 402 `payment_required`, `PROFILE_OVER_LIMIT`, `403 message_allowance_exceeded` |
| `bug` | no, alert owner | other `invalid_request_error` (our request was wrong) |
| `temporary` | yes, backoff | 5xx, `temporarily_unavailable`, timeouts |

Provider error text (`error`, `platformError`) is never stored or returned; only the code and class.

## 4. Where it runs

- **Rust Lambda `kubcode-publishing`** (`provided.al2023`, Function URL, auth NONE, same build and
  layout as `kubcode-oauth-connect`). Two route families:
  - `POST /api/*` from the web host: HMAC `KUBCODE-HMAC-V1` (the oauth-connect scheme, nonce table
    reused).
  - `POST /webhooks/zernio`: `X-Zernio-Signature` only.
- **Function `kubcode-publishing-ops`** (same binary, `KUBCODE_PUBLISHING_MODE=ops`, **no Function
  URL**) for the CLI (orchestrator note a, 2026-11-09). The CLI calls `lambda:Invoke` with the owner's
  AWS profile (SigV4, IAM), so there is no shared HMAC key on the laptop. A Function URL has one auth
  type, so IAM auth cannot sit next to the web host's HMAC on the same URL; a second function with no
  URL can only be reached through IAM, which makes every event it receives authenticated by
  construction. The payload is a small JSON command (`{"op": "push_register", …}`), not an HTTP event.
  It is the **only** holder of the Zernio API key (SSM `/kubcode/prod/zernio-api-key`) and the webhook
  secret (`/kubcode/prod/zernio-webhook-secret`), both SecureString with `alias/kubcode-secrets`, cached
  5 minutes like oauth-connect. The web host never holds them (ADR 0001: no AWS creds on the box; the
  Zernio key reaches every creator's channels, so it stays in one place).
- **Role `kubcode-lambda-publishing`**: logs, `ssm:GetParameters` on exactly those two + the worker DB URL
  + the HMAC key, `s3:GetObject` on `kubcode-media-…/clips/*`, `kms:Decrypt` on `alias/kubcode-secrets`
  (KeyUse hook). No wrap-key decrypt in phase 1 (native adapters will need it; added then).
- DB: role `kubcode_worker` (exists), new grants in migration 0007/0008. Web host uses `kubcode_app` with
  per-workspace RLS (`kubcode.workspace_id` set per transaction, same pattern as `kubcode.user_id`).
- **Admin apply** before merge of the infra PR (new role in the secrets key policy; SSM values put by the
  admin from the vault, §9). Behind stack flag `kubcode:publishing`.

### 4.1 Code layout

```
services/crates/kubcode-publishing/        lib: domain, ports, routing, validation, limiter, store traits
  src/adapters/zernio/{client,connect,publish,inbox,automations,events,errors}.rs
  src/adapters/fake.rs                     in-memory provider for unit tests
  tests/contract/*.rs                      the shared suite (§7)
services/crates/kubcode-publishing-lambda/ bin `bootstrap`: handlers, Postgres store, S3 MediaSource, SSM
services/crates/kubcode-cli/               bin `kubcode`: push, schedule (slice 1), status
lib/channels/*.ts, app/account/channels/   web: owner-gated page, connect start/callback routes
```

## 5. Zernio adapter

### 5.1 Profiles = workspaces

`POST /v1/profiles {name, externalId: <workspace uuid>}` with `Idempotency-Key = workspace uuid`, on the
first connect of a workspace. `409 profile_external_id_conflict` → `GET /v1/profiles?externalId=` and
adopt it. The profile id is stored in `provider_profiles`. Profile name = workspace id prefix, never the
creator's email or name (the processor gets the minimum).

### 5.2 Connect (headless, from our UI)

1. Web `POST /api/channels/connect/start {platform}` (Origin + CSRF guard, owner/flag gate) → creates an
   intent (`state` 32 random bytes, hash stored, TTL 10 min, cookie `__Host-kubcode-chconnect`, bound to
   the session like the settings-keys intents) → Lambda `/api/connect/start` → Zernio
   `GET /v1/connect/{platform}?profileId=…&redirect_url=https://kubcode.dev/api/channels/callback?i=<state>&headless=true`
   → `authUrl` → browser goes there. The provider's screen still names Zernio's app (known; copy on our
   page says so).
2. Callback `GET /api/channels/callback?i=…&connected=…&accountId=…&username=…` or `error=…` (also
   headless `step=select_page` for Facebook later). Web checks host, intent hash, cookie, session, then
   Lambda `/api/connect/complete {state, query}`.
3. The Lambda **does not trust the query**: it lists `GET /v1/accounts?profileId=<our profile>` and
   requires an account with that id **and** the expected platform. Then it upserts Channel + Connection
   (`provider_ref = accountId`), and matches an existing channel of the same platform by Zernio's
   platform user id if the list carries one (field name unconfirmed; else by username, confirmed by
   the creator on the page). Errors map to a fixed `notice=` (no open redirect).
4. Disconnect: `DELETE /v1/accounts/{id}` (Zernio keeps a 1-hour grace in which a reconnect keeps the
   id), connection `revoked`, audit row. Per-channel billing stops here.
5. Health: `GET /v1/accounts/health?profileId=` on page load (cached 5 min) and on `account.*` webhooks;
   `needsReconnect` → connection `needs_reconnect`.

### 5.3 Publish

1. **Media upload from S3, S3 stays private** (orchestrator OK): for each asset,
   `POST /v1/media/presign {filename, contentType, size}` → stream S3 `GetObject` into a `PUT uploadUrl`
   (no auth header) → keep `publicUrl` (in the delivery's adapter state, never shown). Done at schedule
   time, so the post is created within the 1-hour URL life and the 7-day upload life; once the post
   exists Zernio copies the file to permanent storage. Lambda memory 512 MB, timeout 5 min, streamed,
   so a 300 MB Reel fits; larger YouTube files (Zernio cap 5 GB) wait for multipart support or native.
2. `POST /v1/posts` with `Idempotency-Key = delivery.idempotency_key` (UUID made at confirm):
   - YouTube: `content` = description, `mediaItems[{type: video, url, thumbnail: <cover publicUrl>}]`,
     `platforms[{platform: youtube, accountId, platformSpecificData: {title, visibility, categoryId,
     madeForKids: false, containsSyntheticMedia}}]`, `tags`, `scheduledFor`, `timezone: Asia/Bangkok`.
   - Instagram Reel: `content` = caption, `mediaItems[{type: video, url}]`,
     `platformSpecificData: {instagramThumbnail: <cover publicUrl>, shareToFeed: true}`.
   - **One Zernio post per delivery** (not one multi-platform post), so each delivery has its own state,
     cancel and retry, and a platform can leave Zernio without splitting posts.
3. Cancel: `DELETE /v1/posts/{id}` (any state but published; Zernio sends no webhook, so we set
   `cancelled` from the 2xx). Reschedule = `PUT /v1/posts/{id}`. Retry: `POST /v1/posts/{id}/retry`.
4. Status: `GET /v1/posts/{id}` for the CLI/`kubcode status` and the reconcile job (slice 2+; hourly for
   deliveries past `publish_at` without a final state, so a lost webhook is caught).

### 5.4 Webhooks

Registered by an operator script with `POST /v1/webhooks/settings {name, url, secret, events}`; events:
`post.platform.published`, `post.platform.failed`, `post.failed`, `post.partial`,
`account.connected`, `account.disconnected`, `account.permissions_changed`, `comment.received`,
`message.received`. The secret is generated by the script and goes straight to SSM.

Handler, in this order, answering within Zernio's 5 s:
1. Body ≤ 1 MiB (Function URL may base64 it; decode first, HMAC over the exact bytes received).
2. Constant-time compare `hex(HMAC-SHA256(secret, raw))` with `X-Zernio-Signature` (current + previous
   secret accepted for 24 h during rotation). Bad signature → `401`, nothing stored (Zernio dead-letters
   other 4xx, which is what we want for forgeries).
3. `INSERT provider_events(provider, event_id, body_sha256, event, received_at) ON CONFLICT DO NOTHING`.
   Same id **and** same hash → duplicate, `200`. Same id, different hash → `200` but log `event_id_reuse`
   and ignore (a replayed id with a forged body cannot pass step 2 anyway; this catches oddities).
4. Translate (§3) and apply in the same transaction; failures inside → `500` so Zernio retries (7
   attempts over ~51 h). Unknown event types → stored, `200`.
5. Raw bodies are **not** kept; only the hash and the translated rows. Comment/DM text lives only in
   `inbox_items` (30-day retention, deletion with the workspace).

### 5.5 Inbox and comment → DM

- `comment.received` / `message.received` → `inbox_items`. Linking a comment to our delivery uses the
  Zernio post/platform post id stored on the delivery.
- Automation rule → `POST /v1/comment-automations {profileId, accountId, name, trigger: comment,
  platformPostId, keywords, matchMode, dmMessage, buttons[{type: url, title ≤ 20, url}], commentReply,
  followGate?, isActive}`. Zernio documents create and list only: **edit = create the new one, then remove
  the old** (removal endpoint unconfirmed; until found, an edited rule is created and the old one is set
  inactive or deleted by hand in the Zernio dashboard, which the operator note says). Verify list after
  install.
- Limits enforced in `Automations::validate`: DM ≤ 640 chars with buttons, button title ≤ 20, 1–3
  buttons, one active per post. Non-followers get plain text only (Meta rule); the page explains it.
- Outbound DM meter (10k/month free) is counted from `workflow.run.completed`/`message.sent` events into
  a monthly counter shown to the owner; at 80% the owner is alerted.

### 5.6 Rate limiter (client side, shared across Lambda instances)

In Postgres, because Lambda instances share nothing:
`rate_windows(key, window_start, count, PRIMARY KEY(key, window_start))`, one atomic
`INSERT … ON CONFLICT DO UPDATE SET count = count + 1 WHERE count < $limit RETURNING count`.
- `zernio:api` per minute, limit from config (60 now), lowered to `X-RateLimit-Remaining` hints; on 429
  wait `Retry-After` and retry once inside the request budget, else return `rate_limited` to the caller.
- Posting velocity and daily caps are checked at confirm time (§3.2), not here.
- The limiter is behind a trait so tests use an in-memory one.

## 6. Native adapters later (phase 2), where existing pieces plug in

| Platform | Connect | Publish | Notes |
|---|---|---|---|
| YouTube | existing `/api/keys/oauth/start` + `kubcode-oauth-connect` (ADR 0003 shared Google app, or BYOK), tokens in `oauth_connections` (KMS envelope, wrap key) | new `NativeYouTube` in the publishing Lambda: refresh token → resumable upload from S3 → `thumbnails.set` (cover mandatory) → `publishAt` | Lambda role gains wrap-key Decrypt (admin apply); quota 100 uploads/day/project shared |
| Instagram | kubcode Meta app after Business Verification (ADR 0003) | container + publish at time → needs EventBridge one-time schedules | the first platform where the adapter cannot hand the schedule to the platform |
| TikTok | app review in progress (`docs/tiktok-app-review.md`) | Content Posting API | Business connections public only on Zernio; native may differ |

`Connection.provider_ref` for native = our `oauth_connections.id`. The publishing core never reads
tokens; the native adapter does, through the existing envelope crate.

### 6.1 Per-channel migration when a platform flips to native

1. Native adapter passes the **same contract suite** (§7) and one live private post on the owner's channel.
2. Operator sets `provider_routes[(youtube, connect)] = native` and `allow_fallback = true` on the
   capabilities that move. New channels connect natively from then on.
3. Existing Zernio channels show **"เชื่อมใหม่เพื่อใช้ระบบใหม่ของ kubcode"** with a deadline. Reconnecting
   adds a native connection to the **same** channel (matched by platform account id from the native
   connect, e.g. YouTube channel id; mismatch = refused, no silent merge). No token export from Zernio
   is possible or attempted.
4. **Dual run:** new deliveries resolve to native; deliveries already scheduled on Zernio keep their
   pinned connection and publish there (or the creator reschedules, which cancels on Zernio and creates
   natively). Inbox/automations: install the native rule, verify, then remove the Zernio rule (a few
   seconds with neither is accepted over a double DM).
5. **Cutover:** when a channel has no pending Zernio deliveries and a healthy native connection,
   `DELETE /v1/accounts/{id}` (Zernio billing stops), Zernio connection `revoked`. After the deadline,
   `allow_fallback = false`; channels never reconnected go `needs_reconnect`.
6. History (posts, receipts, inbox) is ours and does not move.

## 7. Testing

- **Contract suite** (`tests/contract`): generic functions `connect_contract<P: ConnectProvider>`,
  `publisher_contract<P>`, `automations_contract<P>`, `event_source_contract<E>`, run against a
  harness that each adapter provides. Every adapter must pass the same suite, e.g.: schedule is
  idempotent on the key; cancel after cancel is ok; status of an unknown ref is `not_found`; a delivery
  without a cover never reaches the network; an expired token maps to `needs_reconnect`; 429 maps to
  `rate_limited` with the delay; webhook with a wrong signature is rejected; a duplicate event yields
  no second domain event; out-of-order events do not regress state.
- **Fake provider** (`adapters/fake.rs`): in-memory, scriptable failures; used by core unit tests
  (routing, validation, lifecycle, limiter) and the Lambda handler tests.
- **Zernio fixtures**: the adapter's base URL is injectable; tests run a local HTTP stub that replays
  recorded responses from `tests/fixtures/zernio/*.json` (recorded once from real calls on the owner's
  account, then scrubbed: ids replaced with stable fakes, no usernames, no tokens, no URLs with
  signatures). Webhook fixtures are signed in-test with a test secret.
- **Live checks** are opt-in (`KUBCODE_ZERNIO_LIVE=1`, owner machine only), never in CI, and **never
  post publicly**: a live publish test may only create a YouTube `private` post or a draft (`isDraft`).
- Web: unit tests for routes/guards (existing patterns); migration integration tests on local Postgres 17
  (`test:accounts-db`).

## 8. Data model — migrations (additive only, grants + RLS inside each file)

- **0007_publishing_channels**: `workspaces`, `workspace_members`, `provider_profiles`, `channels`,
  `channel_connections`, `channel_connect_intents`, `provider_routes` (+ seed), `publishing_audit_events`.
- **0008_publishing_posts**: `media_assets`, `posts`, `deliveries`, `receipts`, `provider_events`,
  `rate_windows`.
- **0009_publishing_inbox**: `inbox_items`, `automation_rules`, `outbound_message_counts`.

Schema `kubcode_accounts` (existing runner and ledger). Status/platform/capability columns are
`text CHECK (… IN …)` today; adding a platform later is a new constraint in a new migration, which the
destructive gate flags, so platform lists use a regex check (`^[a-z]{1,20}$`) plus an app-side enum,
like `user_secrets.kind`.

## 9. Secrets

| Secret | Where | Who puts it |
|---|---|---|
| Zernio API key | Keychain vault `kubcode/zernio-api-key` → SSM `/kubcode/prod/zernio-api-key` | owner: `pbpaste \| infra/scripts/secret.sh put zernio-api-key`; admin script copies vault → SSM via a 0600 temp file (`file://`), never argv |
| Zernio webhook secret | generated by the register script → SSM `/kubcode/prod/zernio-webhook-secret` (+ Zernio settings) | admin script |
| Web host HMAC key | existing `KUBCODE_CONNECT_HMAC_KEY` reused, or a new `KUBCODE_PUBLISHING_HMAC_KEY` via `webhost.sh` | admin |

Nothing in git, chat, logs or Pulumi state. Zernio key scope: a full key in phase 1 (per-profile keys
exist, but one Lambda serves every workspace); rotation = create new key, put SSM, revoke old.

## 10. First slice plan (vertical, TDD)

Defaults pending the owner (asked by the orchestrator): channels **YouTube โลกอีกแบบ + IG
@lokeekbaebkub** (Zernio's 2 free accounts), test clip = an unposted backlog clip with a designed cover,
**YouTube private first**. No external post until the owner's OK is relayed.

**Slice 1 — connect + publish one clip (CLI confirm)**
1. Core crate: domain types, ports, routing, core validation (cover mandatory), fake provider, contract
   suite skeleton. Red → green on the fake.
2. Zernio adapter: client (auth, limiter, error mapping), profiles, connect, publish (presign upload,
   create post), events; fixtures replay. Contract suite green.
3. Migrations 0007 + 0008; Postgres store; integration tests.
4. Lambda `kubcode-publishing` + infra PR (role, function, URL, SSM names, flag) → admin apply.
5. Web `/account/channels` (owner-gated, flag `KUBCODE_PUBLISHING_ENABLED`): list channels, "เชื่อม
   YouTube", "เชื่อม Instagram", disconnect, status.
6. CLI `kubcode push <clip-id>` (reads `~/Studio/clips/<id>/clip.json`, refuses without `cover.file`,
   uploads video + cover to S3 `clips/<workspace>/<clip-id>/<sha256>.<ext>` with the owner's AWS profile,
   registers assets) and `kubcode schedule <clip-id> --channel … --at …` (prints the full summary,
   requires typing the clip id to confirm, digest-bound) and `kubcode status`.
7. Webhook registration; receipt + cover check (YouTube: oEmbed/`i.ytimg.com/vi/<id>/…` compared with
   our cover by perceptual hash after publish, `cover_check = ok | mismatch | pending`; IG: Graph-free
   check not available, so `pending` + owner look until Zernio exposes it).
Done = owner's two channels show active on kubcode.dev; one clip published (YouTube private, IG after
OK) from `~/Studio` with the designed cover; receipt in DB; `kubcode status` shows it.

**Slice 2 — web schedule + confirm page** (owner's standing preference: visible web UI): clip list from
`media_assets`/posts, schedule form per channel, summary + "ยืนยันตั้งเวลา" (digest), cancel/reschedule,
failure + retry button, reconcile job.

**Slice 3 — IG comment → DM**: migration 0009, Automations port + contract, Zernio adapter, rules on
`/account/channels/<id>`, inbox items from webhooks, outbound DM counter. Done = a keyword comment from a
second IG account on the owner's post gets the DM.

Later: per-channel billing (Stripe), customer onboarding UI, posting limits for creators, analytics,
native YouTube (§6).

## 11. Risks

- Zernio can terminate without notice (ToS) and is the app of record: one failure takes every channel
  down. Mitigation: our data is complete, native path stays alive (oauth-connect, reviews), and the
  migration flow (§6.1) is designed now.
- The ToS is silent on reselling; billing creators per channel (later) needs Zernio's written OK.
- 60 req/min is tight once creators join; the 3rd account lifts it to 600.
- Comment-automation update/delete not documented: edits need a manual cleanup until confirmed.
- YouTube thumbnail size: docs disagree (2 MB / 10 MB); we cap at 2 MB.

## 12. Sources (read 2026-11-09)

docs.zernio.com: `/platforms/youtube/posts`, `/platforms/instagram/fields`, `/guides/media-uploads`,
`/posts/create-post`, `/guides/post-lifecycle`, `/guides/error-handling`, `/guides/connecting-accounts`,
`/profiles/create-profile`, `/accounts/delete-account`, `/accounts/get-all-accounts-health`, `/webhooks`,
`/webhooks/social`, `/webhooks/inbox`, `/comment-automations/create-comment-automation`,
`/comment-automations/list-comment-automations`, `/workflows`, `/guides/rate-limits`, `/multi-tenant`,
`/pricing/inbox`; zernio.com `/pricing`.

## 13. As built (slice 1, 2026-11-09)

Where the build differs from the plan above, or settles what it left open:

- **Crates**: `kubcode-publishing` (core, no I/O), `kubcode-publishing-zernio` (adapter, its own crate so
  the core stays network-free), `kubcode-publishing-store` (Postgres, runs as `kubcode_worker`),
  `kubcode-publishing-lambda` (one binary, two functions), `kubcode-cli` (`kubcode`).
- **Ops function auth**: IAM invoke **and** an HMAC envelope `{command, ts, nonce, sig}` signed with
  `/kubcode/prod/publishing-ops-key` (copy in the owner's vault), ±5 min, one-time nonce. IAM alone is
  not trusted because the AWS account also holds other principals (security review).
- **KMS**: the publishing role is not in the secrets key's `KeyUse`; a `SsmParameterRead` statement lets
  it Decrypt only via SSM and only its own parameter ARNs. It is not on the wrap key.
- **Media**: the CLI uploads with SSE-S3 (`AES256`), so the role needs only `s3:GetObject` on `clips/*`.
- **Webhooks**: event id and type come only from the signed body (id falls back to the body hash);
  a reused id with a different body is recorded and never applied. Rotation keeps `-previous` until
  `drop-previous`; `--compromised` drops it and forces a reload.
- **Migrations**: 0007, 0008 as planned; 0009 lets the Lambda role read only the active owner's row.
- **Zernio fixtures** are the docs' own examples (`tests/fixtures/zernio`) until real calls are recorded.
- **Infra** was applied by an admin from the branch (owner's OK): 9 created + 3 updated, then 4 updated;
  no delete or replace.

Still to do before slice 1 is "done": register the webhook, turn on the page in `web.env`, connect the
owner's two channels, and one private test post (owner's OK). Checklist:
`docs/design/publishing-core-owner-checklist.md` §F.
