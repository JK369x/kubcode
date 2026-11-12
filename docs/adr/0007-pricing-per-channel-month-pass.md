# 0007 — Pricing: THB 289 per channel, month pass

Status: accepted (2026-11-12, owner) · Amends 0003 ("Free beta with a posting limit") · Billing build: `docs/design/billing-stripe.md` (draft, separate PR)

## Context

The owner is activating a Stripe account. Stripe reviews the website, which said nothing about what we sell: no
prices, no refund policy, no contact page. The billing build (Checkout, webhooks, entitlements) is not done yet, so
the site must state the offer truthfully before anything can be bought.

## Decision

### Plans (`lib/plans.ts`, rendered on `/pricing`)

| Plan | Price | Status | Includes |
|---|---|---|---|
| ฟรี (Free) | 0 ฿ | available | articles, stars/comments, free skills (What If Lab, Podcast Shorts, Make Short, EGM; MIT / Apache-2.0) for signed-in members |
| โซเชียล (Social) | **289 ฿ per connected channel per month**, every channel the same price | available (sign-up opens with billing) | connect YouTube, Instagram, TikTok; unlimited scheduled posts; comment auto-reply (Instagram comment → DM, TikTok public reply). **No** members-only skills |
| สกิลแพ็ก (Skill Pack) | 149 ฿ / month | coming soon | members-only skills (Deep Sea Docs, more later) |
| โซเชียล + สกิล (Social + Skill) | 389 ฿ / month for the first channel, +289 ฿ per extra channel | coming soon | everything in Social + Skill Pack |

- No discount for extra channels: the margin is a deliberate buffer for FX, Zernio price changes, Stripe/Radar fees,
  disputes and fixed infra cost.
- Facebook is not supported. Pages may say it is coming; they never imply it works.
- Coming-soon plans show price and features with a "เร็ว ๆ นี้" badge and a "แจ้งฉันเมื่อเปิด" button instead of
  a buy button; they cannot be bought even with billing on (tested). The waitlist is one row per member per target
  (`kubcode_accounts.plan_waitlist`, migration 0012, additive); the owner sees counts at `/account/waitlist`. No email
  is sent; the copy promises no channel.
- Paid sign-up stays closed until `KUBCODE_BILLING_ENABLED=true`; until then the Social button reads
  "เปิดให้สมัครเร็ว ๆ นี้" (disabled). Download gating is unchanged in this step: gating Deep Sea Docs by paid status
  ships with billing.
- `/roadmap` (`lib/roadmap.ts`) lists now / next / later. Next and later items are marked "ยังไม่เปิด", carry no
  prices or dates, and `/pricing` never sells them (tested).

### Payment: month pass (option ก)

One-time payment per month through Stripe Checkout (`mode=payment`), card or PromptPay, THB. The customer renews by
hand each month; **no auto-renewal**. (PromptPay cannot auto-charge on Stripe; a month pass is the one model that
treats card and PromptPay the same.)

### Refunds (option ก)

No refunds for a paid month. Cancel any time by not renewing; access lasts until the end of the paid month.
Exception: duplicate or erroneous charges are refunded in full. When a month lapses, posts scheduled after it are
not published and automations stop; channels, clips and settings are kept.

### Tax, price changes, fair use, seller

- The seller is **not VAT-registered**: prices include no VAT, and the pages say so.
- Price changes are announced at least **30 days** in advance and never change a month already paid.
- Automations are under a fair-use clause (`/terms#fair-use`): unusual volume that harms the system, other users or a
  platform's limits may be throttled, with the reason shown.
- The seller is the owner as an **individual**. Name and email live in one constant, `lib/seller.ts`;
  `tests/seller.test.ts` **fails while they are placeholders**, so the site cannot ship without them.

## Cost math (per channel per month, 34 THB/USD)

| Item | Amount |
|---|---|
| Zernio per connected account | US$6 (3–10 accounts), US$3 (11–100), first 2 free → about **฿204** at the US$6 tier |
| Stripe TH domestic card | 3.65% + ฿10, +7% VAT on the fee |
| Stripe PromptPay | 1.65%, +7% VAT on the fee |
| Radar Standard | ฿2 per screened card transaction |

Social at 289 ฿, one channel per payment:

- Card: fee (0.0365 × 289 + 10) × 1.07 = **฿21.99**, + Radar ฿2 → net ฿265 − Zernio ฿204 ≈ **฿61 kept**.
- PromptPay: fee 0.0165 × 289 × 1.07 = **฿5.10** → net ฿284 − ฿204 ≈ **฿80 kept**.

Other plans on card (no Zernio cost for skills):

- Skill Pack 149 ฿: fee (0.0365 × 149 + 10) × 1.07 = ฿16.52, + Radar ฿2 → **≈ ฿131 kept**.
- Social + Skill 389 ฿ (first channel): fee (0.0365 × 389 + 10) × 1.07 = ฿25.89, + Radar ฿2 → ฿361 − ฿204 ≈
  **≈ ฿157 kept**; each extra channel keeps about the same as Social (≈ ฿61 on card).

Paying for several channels in one payment pays the ฿10 card fee once, so it keeps a little more.

## Review triggers

Re-price (with the 30-day notice) if:

- THB is weaker than **37 per USD** (Zernio at US$6 costs ฿222, and the card margin on Social drops under ฿45);
- Zernio changes its prices or tiers;
- Stripe changes TH fees, or disputes/chargebacks become material.

## Consequences

- New public pages: `/pricing`, `/roadmap`, `/refund`, `/contact`; `/terms` gains payment, renewal, cancellation,
  refund, price-change and fair-use sections; `/privacy` names Stripe as the payment processor (we never see or store
  card numbers). Every page footer links pricing, refund, contact, terms and privacy.
- ADR 0003's "free beta with a posting limit" is superseded for paid channels once billing opens.
- The billing build follows `docs/design/billing-stripe.md` option A at these prices (its ฿299 draft is replaced).
