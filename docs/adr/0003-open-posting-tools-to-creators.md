# 0003 — Open the posting tools to creators through kubcode's own apps

Status: accepted (2026-11-05, owner, grill session); amended 2026-11-06 (Google project, see "Amendment") · Extends the scheduler PRD (phase 1 = owner only)

## Context

- The idea: let anyone use kubcode to make videos with our skills and to run a
  ManyChat-like manager (scheduled posts, Instagram comment → DM).
- Skill packages only work with an AI agent on the member's own machine, so they
  do not serve non-technical people.
- The scheduler and settings design (`docs/design/settings-keys.md`) assume each
  person brings their own Google OAuth client and Meta app (BYOK). Non-technical
  creators cannot do that.
- Instagram comment → DM does not work in Meta's Development mode (live test
  2026-11-04): it needs Business Verification, a Live app and Advanced Access
  through App Review. Publishing Reels for accounts without a role on the app
  needs the same.
- Google treats `youtube.upload` as a sensitive scope: an unverified app shows a
  warning and is capped at 100 users. Verification is free and needs no business.
  The YouTube Data API quota is per project and shared by every user of the app.

## Decision

| Question | Decision |
|---|---|
| First outside users | **Creators**: any Thai creator, no technical skill assumed. |
| What they get first | **Posting tools** (scheduler, later comment → DM). Creators make clips with their own tools. Generating video on our servers is later. Skill packages stay for technical members. |
| Whose apps | **kubcode's own apps**: a new Meta app "kubcode", and the existing Google project `pure-album-512910-d0` with its consent screen renamed "kubcode" (amended 2026-11-06), verified on `kubcode.dev`. BYOK stays for technical members. |
| Legal entity | The owner registers a **sole proprietorship named "kubcode"** (ทะเบียนพาณิชย์, about 50 THB) and uses it for Meta Business Verification. If Meta rejects it, register a company. |
| Pricing | **Free beta with a posting limit** per creator (posts per month, clip size, posts with auto-reply). |
| Launch order | **YouTube first**: open the beta when Google verification passes. Instagram publishing and comment → DM follow once Meta's App Review passes. |

## Consequences

- Owner actions (no code): register the business, create a Meta Business
  portfolio with the exact registered name, submit Business Verification, create
  the kubcode Meta app under it, rename the Google consent screen to "kubcode".
- Google verification needs a privacy policy, terms, a data-deletion page on
  `kubcode.dev` and a demo video. Meta App Review needs a working flow, a screencast
  per permission, and the same pages.
- The settings design needs an amendment before its step 5 (OAuth connect Lambda):
  a connection may use kubcode's own app (credentials held for the Lambda only,
  not in `user_secrets`) or the member's own app (BYOK). Steps 1–4 are unaffected.
- Sign-up is open to the public, so the posting tools need a per-creator posting
  limit from day one, and the owner-only gate on the settings page becomes a
  per-feature flag.
- The registered business becomes responsible for creators' data on Meta. Moving
  the app to another business later would force every creator to reconnect.

## Alternatives rejected

- **Invite-only technical creators with BYOK**: no approvals needed, but it misses
  the people the idea is for.
- **Generate video on our servers first**: closest to the idea, but the largest
  build and a real per-clip cost before we know the demand.
- **Verify with someone else's business**: faster only if already verified, and
  it ties kubcode and creators' data to that business.
- **Charge from day one**: needs payments, receipts and tax work while Instagram
  is still waiting on Meta.
- **Wait for Google and Meta together**: delays a usable YouTube scheduler by weeks.
- **A new Google project "kubcode"** (the original choice): see the amendment.

## Amendment (2026-11-06, owner): reuse the existing Google project

YouTube locks videos uploaded through the API to private for API projects created
after 2020-07-28 that have not passed the YouTube API audit. A new project would
start under that lock, so scheduled posts could never go public until the audit
passes, which usually takes weeks.

The existing project `pure-album-512910-d0` ("YouTube Channel Uploader", set up
2026-10-27 for the STORY GRID uploader) is not affected. On 2026-11-06 all 8 videos
it uploaded were public, checked without credentials through YouTube's oEmbed
endpoint. Two were uploaded public and six were uploaded private with `publishAt`
on 28 and 30 October, which is exactly the scheduler's YouTube path.

So that project becomes kubcode's shared Google app:
- Its consent screen is renamed "kubcode", and `kubcode.dev` becomes an authorized
  domain.
- The Web client "kubcode web connect" (already created there, redirect
  `https://kubcode.dev/api/keys/oauth/callback/youtube`) is the shared client.
  Its secret is held for the Lambda only.
- The old Desktop client stays for the existing uploader script until the scheduler
  replaces it.

Still true: the project's free quota (about 10,000 units a day; an upload costs about
1,600) is shared by every creator, so the posting limit applies. Raising the quota,
and removing the unverified-app warning and its 100-user cap, still need the YouTube
API audit and Google verification.

## Update (2026-11-06): YouTube changed the upload quota and the private lock

Google's quota page (read 2026-11-06) now gives `videos.insert` its own bucket:
**100 uploads a day per project, 1 unit each**. The 10,000 units cover the other
endpoints. The "about 6 uploads a day" that the 1,600-unit figure implied no longer
applies. On 2026-11-02 the revision history also dropped the private-only lock for
unverified projects. The quota is still shared by every creator, so the posting limit
stays. Separately, Google's own rules still cap an unverified app with sensitive scopes
at 100 new users over the project's lifetime and show a warning screen. A consent
screen left in Testing also lets only listed test users in and expires refresh tokens
after 7 days.
