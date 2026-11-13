# 0008 — Billing: Stripe Checkout month pass, separate billing Lambda

Status: accepted (2026-11-13, owner: "start everything") · Implements ADR 0007 (pricing) · Design
`docs/design/billing-stripe.md` (option A) · Facts `docs/research/stripe-thailand-2026-11-09.md`
· Test mode only; live keys and the production webhook are a later, separate step.

## Context

ADR 0007 set the price: kubcode Social, ฿289 per connected channel per month, every channel the same price,
paid by card or PromptPay, renewed by hand. Stripe's TH account accepts card and PromptPay in Checkout
`mode=payment`, but PromptPay cannot auto-charge, and Stripe Tax and Thai tax invoices are not available to us.
The publishing core (ADR 0004) already runs as a Rust Lambda holding the Zernio key.

## Decision

1. **Month pass through Stripe Checkout.** One-time payment (`mode=payment`), THB only (Adaptive Pricing is off
   in the Dashboard), card or PromptPay (enabled in the Dashboard; the API version rejects
   `payment_method_types`). A pass buys N channel slots for one calendar month. **No auto-renewal.**
2. **Amounts** (`kubcode-billing` crate, satang):
   - new or renewal: N × ฿289, for one month from `max(now, paid_until)` (renewing early loses no day);
   - mid-pass add: extra slots up to the **same** `paid_until`, prorated by the seconds left in the current
     period, rounded up to the baht, at least ฿10 (Stripe's THB minimum). One renewal date per workspace.
   - A month is a calendar month in Asia/Bangkok, day clamped (31 Jan → 28/29 Feb).
3. **Entitlement is derived from paid purchases**, and written to `billing_entitlements` in the same
   transaction as the fulfilment that changes it.
4. **Fulfilment is one idempotent state transition** (`pending → paid`, `WHERE status = 'pending'`), reached
   from the webhook (`checkout.session.completed` with `payment_status=paid`, or `async_payment_succeeded`) or
   from the success page asking the Lambda to check the session. It grants only if Stripe's `amount_total` and
   `currency` match the stored purchase; a mismatch is flagged (`review_code`) and grants nothing. A payment
   on a purchase already `failed`/`expired` is never auto-granted. Webhook events are deduplicated by event
   id (`stripe_events`) and verified against the raw body (`Stripe-Signature`, HMAC-SHA256, 5-minute
   tolerance, every `v1`, constant-time compare).
5. **Expiry**: 3-day grace after `paid_until` (everything keeps working), then channels beyond the paid slots
   are **paused** (newest first; nothing is deleted, publishing and automations skip them). Renewing resumes
   them, oldest first. After **14 days paused** the channel is disconnected from Zernio (it bills per
   connected account); our rows stay and the creator reconnects later. A workspace that never paid is not
   swept (free-beta channels are a separate owner decision).
6. **Reminders are in-site only**: a banner on `/account` at 7, 3 and 0 days left, during grace and when
   paused (`billing_reminders`). **No email** is sent (none exists).
7. **Refunds**: none, except duplicate or erroneous charges (ADR 0007), done by the owner in the Dashboard.
   Not VAT-registered: no tax lines.
8. **Fair use**: Instagram comment → DM, at most 5,000 automated DMs per IG channel per calendar month.
9. **The owner's own workspace is exempt**: it never pays and is never paused.
10. **A separate Lambda, `kubcode-billing`**, holds the Stripe key and webhook secret on its own IAM role and
    DB role (`kubcode_billing`), so the Stripe key and the Zernio key never share a role. The web host calls
    it with HMAC (`/checkout`, `/fulfil`); Stripe calls `/stripe/webhook`. Crates: `kubcode-billing` (pure
    domain), `kubcode-billing-store` (Postgres), `kubcode-billing-lambda`.
11. **Database (migration 0013, additive)**: `billing_purchases`, `billing_entitlements`, `stripe_events`,
    `billing_reminders`, `billing_channel_pauses`, `billing_request_nonces` (HMAC replay guard), and the role
    `kubcode_billing`. The web role reads its own
    workspace's rows (never Stripe ids) and writes nothing but a banner dismissal; the publishing role reads
    entitlements and pauses; nothing grants DELETE on money records (only expired request nonces).

## Delivery

Four PRs, each green before the next, none merged without the owner:

1. this ADR, migration 0013, the `kubcode-billing` domain crate;
2. store + Lambda + Pulumi (role scoped to its own SSM parameters) + contract tests on recorded fixtures;
3. web: `/account/billing`, success/cancel pages, banner, connect gating, `/pricing` CTA behind
   `KUBCODE_BILLING_ENABLED` (off in production);
4. sweep (grace → pause → disconnect), `docs/dev/local-e2e.md` billing section, a local end-to-end run.

## Consequences

- Creators renew by hand each month; reminders are only visible when they visit the site. If that loses too
  many renewals, card auto-renew (Billing subscriptions, design option B) can be added on the same
  entitlement table.
- Stripe receipts are not Thai tax invoices; that matters only if the seller registers for VAT.
- Free-beta channels (ADR 0003) keep working until the owner decides when billing gating applies to them.

## Alternatives rejected

- **Stripe subscriptions (option B)**: card-only auto-renew, PromptPay only by monthly invoice; two payment
  paths and more webhook states for the first version.
- **Monthly Stripe invoices (option A2)**: Stripe would send the emails, but the owner chose in-site reminders.
- **Billing inside the publishing Lambda**: one role would hold both the Stripe and the Zernio keys.
