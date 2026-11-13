# Design — Per-channel billing with Stripe (draft for the grill)

Status: **decided 2026-11-12/13 — see ADR 0008** (`docs/adr/0008-billing-month-pass.md`), which overrides
anything below where they differ (price ฿289 not ฿299; in-site reminders, no email; 14-day disconnect).
Kept as written for the reasoning and the option comparison. Test mode only until the owner says otherwise.
· Facts and sources: `docs/research/stripe-thailand-2026-11-09.md`
· Builds on ADR 0004 (publishing core), `docs/design/publishing-core.md`, orchestrator decision
  `2026-11-09-zernio-resale-stripe`

## 0. What we sell

kubcode is a Thai site for short-form video creators: free tutorials, a library of AI video tools, and
a paid service to connect your own YouTube, Instagram and TikTok accounts and schedule or publish from
one dashboard. A **Creator** pays for the **Channels** in their **Workspace**, per channel per month.
Phase 1 channels run through Zernio (ADR 0004). Instagram comment → DM automation is included in the
channel price, with a fair-use cap (§6).

Proposed price: **฿299 per channel per month** (not confirmed). Stripe fees are absorbed into the price,
with no surcharge (Stripe offers surcharging only in the US, CA and NZ anyway).

## 1. Findings that shape the design (read first)

1. **The Thai Stripe account can do Billing subscriptions, at least in test mode.** The en-th
   marketing site shows "Not available in your country" next to Billing, but the docs, the TH price list
   (Billing 0.7%, Invoicing 0.4%) and a **sandbox probe** disagree: a THB monthly subscription Checkout
   Session was accepted on "kubcode sandbox" (2026-11-09). Live mode needs one more check at activation.
2. **PromptPay cannot auto-charge.** It is single-use, with no SetupIntents and no `setup_future_usage`.
   Subscriptions and invoices take PromptPay only with `collection_method=send_invoice`, which means the
   customer scans a QR every month. Checkout in subscription mode does not offer PromptPay at all.
   No other Thai bank-app method is available on Stripe; TrueMoney, LINE Pay and Rabbit are unsupported.
3. **Checkout in payment mode takes card + PromptPay in THB.** The probe got `["card","promptpay"]`.
   The current API version **rejects `payment_method_types`** on Checkout Sessions: methods are turned
   on in the Dashboard, not in code.
4. **Stripe Tax does not support Thai-based sellers**, and no Stripe page claims its invoices are a
   valid Thai tax invoice (ใบกำกับภาษี). If kubcode is VAT-registered, the tax invoice is ours to issue.
5. **Adaptive Pricing is on by default**, so a foreign card holder may see their own currency.
6. **No email sending exists in the repo** (no SES or other provider). Reminders need either new email
   infra or Stripe's own invoice emails (§3, option A2).
7. ADR 0004 said reselling needs Zernio's written OK; the owner has since decided not to ask, and
   accepts the risk. The billing ADR records that this supersedes ADR 0004's line.

## 2. Fees at ฿299 (Thai account, VAT 7% on Stripe's fee)

| Paid with | Stripe fee | + 7% VAT | kubcode keeps (1 channel) | 3 channels in one payment (฿897) |
|---|---|---|---|---|
| PromptPay | 1.65% = ฿4.93 | ฿5.28 | **฿293.72** | fee ฿15.84 |
| Thai card | 3.65% + ฿10 = ฿20.91 | ฿22.38 | **฿276.62** | fee ฿45.73 |
| Foreign card | 4.75% + ฿10 = ฿24.20 | ฿25.89 | **฿273.11** | fee ฿56.29 |
| + post-payment invoice PDF (optional) | 0.4%, cap US$2 | | −฿1.28 | |
| + Billing (subscription options only) | 0.7% | | −฿2.24 | |

The ฿10 fixed card fee is per payment, so paying for several channels in **one** payment is cheaper
than one payment per channel. Zernio's own cost per account (graduated, about US$6 in earlier notes)
comes out of what kubcode keeps; the margin is the owner's call on price.

## 3. Options

| | **A. Month pass, Checkout** _(leading)_ | **A2. Month pass, Stripe invoice** | **B. Subscription, quantity = channels** | D. Other gateway |
|---|---|---|---|---|
| How it works | Creator buys N channels × 1 month in Checkout (one-time payment). We set `paid_until`. To renew, they buy again. | Each month we create a one-off invoice (`send_invoice`) for N channels. Stripe emails it; the hosted page takes card or PromptPay. | One subscription per workspace, one price, `quantity` = paid channels. Card: auto-charge. PromptPay: `send_invoice` each month. | Opn (Omise) or 2C2P |
| PromptPay | ✅ every month, by hand | ✅ every month, by hand | ✅ by hand (send_invoice) | ✅, but recurring PromptPay not shown in their docs either |
| Card auto-renew | ❌ (add later as B) | ❌ | ✅ | card only |
| Reminder emails | **we build** (no email infra today) | **Stripe sends** invoice + reminders | Stripe sends | ? |
| Proration on add/remove | ours, simple (§5.3) | ours | Stripe's | ours |
| Depends on Billing in TH | no | Invoicing only (0.4%) | yes (0.7%) | no |
| Customer Portal | not needed | not needed | cards only; PromptPay unsupported in portal | no |
| Build size | smallest Stripe surface; reminders + sweep are ours | small; needs a monthly job to create invoices | largest state machine (past_due, proration, two collection methods) | new integration, no MCP or docs checked |
| Main risk | we own reminders and expiry | Thai-language invoice emails unconfirmed | two payment paths, more webhook states | everything is unverified |

**Proposal:** A, with A2 as the answer if building email is not worth it. B is a later add-on for card
users who want auto-renew, sharing the same entitlement table. D is reference only. The comparison
sources are in the research file §D.

## 4. Option A in detail

### 4.1 Language (to add to `CONTEXT.md` after the grill)

- **Channel slot**: the right to keep one channel active in a workspace until a date. Slots are what
  the creator pays for; channels fill them. _Avoid_: seat, licence.
- **Month pass**: one payment that buys N channel slots up to one `paid_until` date.
- **Paused channel**: still connected and visible, with its data kept, but kubcode publishes nothing
  and runs no automation on it until it is in a paid slot again.

### 4.2 Flow

1. Creator opens `/account/billing`, chooses N (default = channels they have or want), and presses pay.
2. Web → billing Lambda (HMAC, like the publishing Lambda) `POST /checkout {workspace, slots}`.
   The Lambda computes the amount (§5.3), creates a Checkout Session (`mode=payment`, THB,
   `client_reference_id = workspace id`, `metadata.purchase_id`, `customer_email`, Idempotency-Key =
   purchase id) and stores a `pending` purchase row. Browser goes to the Stripe-hosted page.
3. Customer pays by card or PromptPay QR.
4. Stripe → `POST /stripe/webhook`. The Lambda verifies `Stripe-Signature`, dedupes the event id,
   then **fulfils**: on `checkout.session.completed` with `payment_status=paid`, or on
   `checkout.session.async_payment_succeeded`. Fulfilling moves the purchase to `paid` and extends the
   workspace's slots. `async_payment_failed` or `checkout.session.expired` → `failed`/`expired`.
5. The success page also asks the Lambda to fulfil from the session id (Stripe's recommended belt and
   braces). Both paths call the same idempotent `fulfil(purchase_id)`.

### 4.3 Idempotency and safety

- **Webhook signature**: HMAC-SHA256 of `"{t}.{raw body}"` against every `v1=` value, constant-time
  compare, reject if `t` is more than 5 minutes old. Raw bytes are verified before any JSON parse.
- **Event dedupe**: `stripe_events(event_id PRIMARY KEY, type, received_at)`. Insert first; a conflict
  means "already handled", so answer 200.
- **Fulfilment is a state transition**, `UPDATE purchases SET status='paid' … WHERE id=$1 AND
  status='pending'` in one transaction with the slot change. Zero rows updated means it was already
  done. A replayed event, a webhook racing the success page, or Stripe's retries can't add slots twice.
- **Amount check**: fulfil only if `amount_total` and `currency` match the stored purchase.
- **Never trust the browser**: the success page sends only the session id; the Lambda reads the
  session from Stripe.
- Keys never appear in logs, argv or errors. Stripe ids stay inside the billing crate, the same rule
  ADR 0004 applies to provider refs.

### 4.4 Data (migration 0010, additive, RLS and grants as in 0007)

```
billing_purchases   id, workspace_id, slots, amount_thb_satang, period_start, period_end,
                    kind (new|renew|add), status (pending|paid|failed|expired),
                    stripe_checkout_session_id UNIQUE, created_at, paid_at
billing_entitlements workspace_id PK, slots, paid_until, updated_at
stripe_events       event_id PK, type, received_at
billing_reminders   workspace_id, paid_until, kind (t7|t3|t0|paused), sent_at, UNIQUE(workspace_id, paid_until, kind)
```

`billing_entitlements` is derived from paid purchases and kept in the same transaction. The owner's
workspace is exempt, as it is from posting limits today.

### 4.5 Gating in the publishing core

One core check, `entitlement(workspace, at)`, gives `{slots, paid_until, grace_until}`. The publishing
service (the core, not an adapter, per ADR 0004 §2) calls it at:

| Action | Rule (_proposed_) |
|---|---|
| Connect a new channel | allowed only if active channels < paid slots; otherwise the page offers to buy a slot first |
| Schedule a delivery | allowed if the channel is in a paid slot now; deliveries planned after `paid_until` are accepted, with a notice that they run only if renewed |
| Sweep at `grace_until` | channels beyond the paid slot count (newest first, or the creator's choice) become **paused**; their pending deliveries are cancelled at Zernio and kept as `held` in our DB; their automation rules stop |
| Renewal | paused channels with a slot go back to active; `held` deliveries in the future are re-scheduled; past ones stay `held` for the creator to decide |
| Long unpaid | after X days paused, disconnect from Zernio (it bills us per connected account); our data stays, and the creator reconnects later |

Nothing is ever deleted by billing.

### 4.6 Reminders and expiry

A daily sweep in the billing Lambda: reminders at T−7, T−3 and on the day, each with a "renew" link
to a fresh Checkout; at `paid_until` + grace (_proposed_ 3 days) it pauses (§4.5). Rows in
`billing_reminders` make each reminder send once. It needs a scheduler (EventBridge Scheduler is
outside the current deploy boundary, infra README) and an email sender (none exists): SES, or option A2.

### 4.7 Receipts and tax

Stripe emails a receipt for each live payment. `invoice_creation` adds an invoice PDF for 0.4%
(cap US$2). Neither is a Thai tax invoice. If kubcode is VAT-registered, we issue the ใบกำกับภาษี
ourselves or through a Thai e-Tax provider, and the price question becomes "฿299 VAT-inclusive or not".

## 5. Rules to confirm

### 5.1 Price and currency
฿299 per channel per month, THB. _Proposed_: THB only, Adaptive Pricing off, so every customer pays the
same baht amount.

### 5.2 Trial
_Proposed_: none at launch; the free beta posting limits (ADR 0003) still apply to unpaid creators.

### 5.3 Adding and removing channels mid-pass
- **Add**: buy extra slots up to the **same** `paid_until`, at ฿299 × remaining days ÷ days in the
  period, rounded up to the baht, minimum ฿10 (Stripe's THB minimum). One renewal date per workspace.
- **Remove**: no refund; the slot stays until `paid_until`, and the creator can connect another channel
  into it.
- **Renew**: N slots for one month from `max(now, paid_until)`, and N can change at renewal.

## 6. Instagram comment → DM fair use

Included in the channel price. _Proposed_ cap: **5,000 automated DMs per Instagram channel per month**.
Zernio meters outbound messages per team: 10,000/month free, then US$1 per 10,000. The cap guards
against one creator using the whole team allowance. At the cap, automations pause until the next
period and the creator sees why. The pricing page says "ตอบคอมเมนต์เป็น DM อัตโนมัติ สูงสุด 5,000
ข้อความต่อช่อง IG ต่อเดือน". The counter lives in the publishing core next to the existing posting
limits.

## 7. Where it runs

- New crates `kubcode-billing` (pure domain: amounts, proration, entitlement, state transitions),
  `kubcode-billing-store` (Postgres) and `kubcode-billing-lambda` (Function URL: `/stripe/webhook`
  signed by Stripe, `/checkout` + `/fulfil` HMAC from the web host, `/sweep` from the scheduler).
  This follows the publishing crates' layout and Lambda style.
- **A separate Lambda from publishing** (_proposed_), so the Stripe key and the Zernio key sit on two
  roles, as ADR 0004 §5 keeps the Zernio key on one.
- Stripe calls go through a small hand-written client (reqwest, form-encoded, pinned API version),
  with recorded fixtures for contract tests, as with Zernio. Only Checkout Sessions create and
  retrieve are needed for A.
- TypeScript only in Next: `/account/billing`, the success and cancel pages, and the gating messages
  on `/account/channels`.

### Secrets
`stripe-secret-key` and `stripe-webhook-secret`, stored by the owner with
`pbpaste | infra/scripts/secret.sh put …`, and read in prod from SSM like the Zernio key. Test-mode
keys only (`sk_test_…` or, better, a restricted `rk_test_…` limited to Checkout Sessions).

## 8. Testing (TDD, then local end to end)

- Unit: proration and amount maths, signature verification (good, bad, stale timestamp, several `v1`),
  fulfilment transitions (twice → once; webhook vs success page race; wrong amount refused).
- Store tests on the local test Postgres, RLS included.
- Contract tests against recorded Stripe fixtures.
- **Local E2E** (`docs/dev/local-e2e.md` gains a billing section): Next + billing Lambda runner + local
  DB; `stripe listen --forward-to 127.0.0.1:<port>/stripe/webhook`, with the `whsec_` read by the
  harness over stdin and never printed. Test card 4242 4242 4242 4242 and a declined card, and the
  test-mode PromptPay page (authorize / fail). Then a replayed event (`stripe events resend`) shows no
  double credit. The Stripe CLI is not installed yet (`brew install stripe/stripe-cli/stripe`).

## 9. Questions for the grill

1. Price: ฿299/channel/month, with the fee table in §2 and Zernio's cost per account. VAT-inclusive?
2. ~~Fee wording~~ Resolved 2026-11-09 (owner via orchestrator): the fee is **absorbed** into the THB
   price ("คิดเผื่อค่าธรรมเนียมให้หน่อย"); no surcharge line.
3. Model: A (Checkout month pass), A2 (monthly Stripe invoice that Stripe emails), or B (subscription)?
   Card auto-renew now or later?
4. Proration on add (§5.3), no refund on remove, one renewal date per workspace?
5. Trial: none, N days, or the first channel free?
6. Expiry: reminders T−7/T−3/T−0, a 3-day grace, then pause. What happens to deliveries already
   scheduled after expiry? How long before a paused channel is disconnected from Zernio?
7. Thai tax: is kubcode (or the owner) VAT-registered? Who issues ใบกำกับภาษี?
8. THB only (Adaptive Pricing off), or USD too?
9. Customer Portal: not needed for A/A2. Needed only with B.
10. Gating: connect needs a free paid slot? Existing beta creators get a grace window?
11. Reminder email: build SES (domain verification, new infra) or let Stripe email invoices (A2)?
12. DM fair-use cap: 5,000 per IG channel per month?
13. Separate billing Lambda (proposed) or inside the publishing Lambda?

## 10. Stripe planner output (2026-11-09, test mode)

`stripe_implementation_planner` chose: Stripe-hosted Checkout (default), per-seat pricing, pay up
front, custom subscription management via API (quantity follows channels), Smart Retries + automated
emails for recovery, Stripe Tax threshold monitoring. Its blueprints were "subscription with hosted
Checkout" and "per-seat subscription". That is option B. The planner does not model PromptPay or the
Thai tax gaps, which is why A leads here.
