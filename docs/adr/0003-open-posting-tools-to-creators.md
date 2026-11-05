# 0003 — Open the posting tools to creators through kubcode's own apps

Status: accepted (2026-11-05, owner, grill session) · Extends the scheduler PRD (phase 1 = owner only)

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
| Whose apps | **kubcode's own apps**: a new Meta app "kubcode" and a new Google project "kubcode", verified on `kubcode.dev`. BYOK stays for the owner and technical members. |
| Legal entity | The owner registers a **sole proprietorship named "kubcode"** (ทะเบียนพาณิชย์, about 50 THB) and uses it for Meta Business Verification. If Meta rejects it, register a company. |
| Pricing | **Free beta with a posting limit** per creator (posts per month, clip size, posts with auto-reply). |
| Launch order | **YouTube first**: open the beta when Google verification passes. Instagram publishing and comment → DM follow once Meta's App Review passes. |

## Consequences

- Owner actions (no code): register the business, create a Meta Business
  portfolio with the exact registered name, submit Business Verification, create
  the kubcode Meta app under it, create the kubcode Google project.
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
