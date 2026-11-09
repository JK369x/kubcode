# 0004 — Publishing core: our own domain, Zernio first, swappable per platform and capability

Status: accepted (2026-11-09; design approved by the orchestrator, slice 1 merged in #39–#45) · Design `docs/design/publishing-core.md`
· Extends ADR 0003 (posting tools for creators) and the scheduler PRD (replaces its slices 3–5 for
Zernio-backed channels)

## Context

- The owner's plan (2026-11-08): phase 1 connects every platform through Zernio, a third-party unified
  social API, and creators later pay per channel; phase 2 replaces Zernio with our own integration,
  **one platform at a time**.
- Zernio is the app of record on every platform and cannot export tokens, and its terms let it close an
  account without notice. Leaving it for a platform means every channel on that platform reconnects.
- Native pieces already exist for YouTube (shared Google app per ADR 0003, OAuth connect Lambda, KMS
  envelope store) and TikTok is in app review. Instagram comment → DM needs Meta Business Verification
  for a native build but works now through Zernio.

## Decision

1. **kubcode owns the domain.** Workspace, Channel, Connection, Post, Delivery, Receipt, Inbox item and
   Automation rule live in our DB under our ids. Provider ids are opaque `provider_ref` strings that
   only adapters read; they never reach routes, UI, CLI output or logs.
2. **One port per capability** (Connect, Publish, Inbox, Automations, Analytics later), implemented by
   a Zernio adapter now and native adapters later. Core rules that every adapter must obey (the
   mandatory designed cover, platform limits, velocity) live in the core, not in adapters.
3. **A routing table in the DB** (`platform × capability → zernio | native`) picks the provider. A
   delivery pins its connection and provider when it is scheduled, so a route flip never moves work
   already handed to a provider. Flipping is a data change with an audit row, not a deploy.
4. **One Zernio post per delivery**, not one multi-platform post, so each delivery has its own state
   and a platform can leave Zernio on its own.
5. **One Rust Lambda (`kubcode-publishing`) holds the Zernio key and the webhook secret.** The web host
   and the CLI call it with HMAC; Zernio webhooks are checked by signature and deduplicated by event id
   plus a hash of the raw body (Zernio signs without a timestamp).
6. **Media stays in our private S3.** The Lambda streams it into Zernio's presigned upload when the
   delivery is scheduled; Zernio is never given a link into our bucket.
7. **Same contract test suite for every adapter**, run against a fake provider, recorded Zernio
   fixtures, and later each native adapter before its platform may flip.

## Consequences

- Zernio's scheduler is used in phase 1 (no EventBridge). Native Instagram will need our own
  one-time schedules; the Publish port already lets an adapter decide where the schedule is held.
- Rate limits are team-wide (60/min until the 3rd account, then 600), so a shared limiter in Postgres
  is needed from the start.
- Moving a platform to native follows a fixed flow: contract suite + one live private post, route flip
  with fallback, creators reconnect onto the same channel (matched by platform account id), dual run
  until Zernio deliveries drain, then the Zernio account is removed and its billing stops.
- Reselling Zernio-backed channels needs Zernio's written OK before billing starts (terms are silent).

## Alternatives rejected

- **Store Zernio's model as ours** (profiles/accounts as our tables): fastest, but phase 2 would mean
  rewriting every table and every screen, and Zernio ids would leak into URLs and receipts.
- **Native first for YouTube** because of the cover rule: not needed, Zernio sets custom thumbnails.
- **Give Zernio a presigned S3 link**: simpler, but Zernio does not say when it fetches the file, so a
  link could expire before the publish time; the bucket stays private instead.
- **Zernio key on the web host**: one key reaches every creator's channels; it stays with one Lambda
  role, as the ADR 0001 box holds no such credentials.
