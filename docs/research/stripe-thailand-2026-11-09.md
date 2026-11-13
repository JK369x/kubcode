# Stripe facts for a Thailand (TH) account: per-channel billing in THB

Researched 2026-11-09. Sources are official Stripe pages only, except section D, which uses Opn/2C2P docs. Pages were fetched from a Thai IP (ipinfo reported `TH`), so geo-dependent marketing pages show the TH view.

## Sandbox probe (2026-11-09, test mode, account "kubcode sandbox")

Two Checkout Sessions were created through the Stripe MCP to settle what the docs leave open. Both were
test mode only and expire unused after 24 hours.

- `mode=payment`, THB, 2 × ฿299 → accepted. Stripe chose `payment_method_types: ["card", "promptpay"]`
  from the Dashboard payment method configuration, so the sandbox is a TH account with PromptPay on.
- `mode=subscription`, THB, recurring monthly price, quantity 2 → **accepted** (card only, as the docs
  say). So Billing subscriptions work for this TH account **in test mode**. Live availability is the
  same account type but is still worth one check at activation.
- The current API version **rejects `payment_method_types` on Checkout Sessions** ("Payment methods are
  now managed from your Dashboard settings"). Card and PromptPay are switched on in the Dashboard, not
  in code.
- New sessions have `adaptive_pricing.enabled: true`: a foreign card holder may be shown their own
  currency. Turn it off if the owner wants THB only.

## TL;DR
- **Billing / Subscriptions / Invoicing: the sources conflict, but the docs and pricing point to "available".** The en-th marketing product nav shows "Not available in your country" on the Billing, Subscriptions and Invoicing pages. The en-th and th pricing pages still list Billing at 0.7% and Invoicing at 0.4% with no notice. The docs list PromptPay, a method only TH accounts can accept, as supported for Subscriptions and Invoicing. The sandbox probe above settled it for test mode: a THB subscription Checkout Session was accepted.
- **Stripe Tax: No for TH-based businesses.** The docs say: "Your business location: ❌ Not supported" for TH.
- **PromptPay cannot auto-recur.** It has no SetupIntents and no `setup_future_usage`. It works on subscriptions and invoices only with `collection_method=send_invoice`, so the customer pays each month's invoice by QR.
- **Checkout `mode=payment` with card and PromptPay in THB: supported.** PromptPay is "Payment mode: Yes / Subscription mode: No".
- **Fees:** domestic cards 3.65% + ฿10, international cards 4.75% + ฿10, +2% FX, PromptPay 1.65%, Billing 0.7%, post-payment invoice 0.4% (US$2 cap). Minimum charge ฿10.
- **Surcharging: Stripe does not offer it for TH.** It supports only US, CA and NZ.

---

## 1. Is Billing available to a TH account?
**Verdict: Partly. The sources conflict; the evidence leans to available. Confirm on the account.**

- **Marketing site (en-th) shows a notice, as rendered HTML:** the product sub-nav reads `Billing | Not available in your country | Overview | Usage-based billing | Subscriptions | Invoicing | Pricing`.
  - The notice is attached to the whole **Billing product family**, not to one plan. It appears on https://stripe.com/en-th/billing/pricing, https://stripe.com/en-th/billing/subscriptions and https://stripe.com/en-th/invoicing. The string is the generic site key `mkt-ssr.global.not-available`.
  - https://stripe.com/en-th/tax shows the same notice: "Tax | Not available in your country".
  - The en-th Billing overview page (https://stripe.com/en-th/billing) did **not** render the notice; the string only appears in its i18n dictionary.
  - https://stripe.com/en-sg/billing/pricing, /en-my/ and /en-in/ do not show it.
- **Pricing pages list Billing with no notice:**
  - https://stripe.com/en-th/pricing: Billing "0.7% of Billing volume … Includes Billing transactions processed on and off Stripe. Excludes one-off invoices."
  - Same page: Invoicing Starter "0.4% per paid invoice".
  - https://stripe.com/th/pricing: same figures.
- **Docs (product-level) list PromptPay, which only TH accounts can accept, as working with Subscriptions and Invoicing** (https://docs.stripe.com/payments/promptpay):
  - "Business locations: Stripe accounts in the following countries can accept PromptPay payments: TH".
  - "Billing support: Yes".
  - "Product support: … Subscriptions⁴, Invoicing⁴ … ⁴Invoices and Subscriptions only support the send_invoice collection method."
- **Newsroom (2022-10-26)** (https://stripe.com/newsroom/news/thailand): Thai companies get "Billing for subscriptions and recurring payments" and Invoicing.
- **Global availability:** https://stripe.com/global lists Thailand. It has no per-product breakdown.
- **Assessment (written before the sandbox probe at the top):**
  - The docs are more authoritative for API capability, and they are current: the PromptPay page footnotes are written specifically for Subscriptions and Invoicing.
  - The en-th nav notice is current but inconsistent. It is absent on the Billing overview page, and the pricing pages publish Billing and Invoicing fees for TH.
  - The Tax notice does match the docs (see section 5).
  - Can a TH account create Subscriptions via the API? **UNCONFIRMED from an official statement.** To confirm, create a test-mode Product, a THB recurring Price and a Subscription on the TH account.
- **Invoicing in TH:** same status as Billing. The pricing pages say yes and the en-th nav notice says no.
- **Customer Portal:** no TH-specific statement found (UNCONFIRMED). The payment-method support table marks PromptPay as Customer Portal "Unsupported". Cards are supported there.

## 2. PromptPay and recurring payments
**Verdict: No automatic recurring. Yes for `send_invoice` subscriptions and invoices paid each period on the hosted invoice page.**

- **API support table** (https://docs.stripe.com/payments/payment-methods/payment-method-support), PromptPay `promptpay` row:
  - PaymentIntents "✓ Supported".
  - SetupIntents "- Unsupported".
  - Manual capture "- Unsupported".
  - Setup future usage "- Unsupported".
- **Product table:** Subscriptions "✓ Supported ³", Invoicing "✓ Supported ³", Customer Portal "- Unsupported". Footnote ³: "Invoices and Subscriptions only support the send_invoice collection method."
- **Single-use method:** "PromptPay is a single-use payment method" (https://docs.stripe.com/payments/promptpay/accept-a-payment?payment-ui=direct-api).
- **Subscription API:** in https://docs.stripe.com/api/subscriptions/create, the `payment_method_types` enum includes `promptpay`: "Only supported when `collection_method` is `send_invoice`."
- **Invoicing payment-methods table** (https://docs.stripe.com/invoicing/payment-methods): "PromptPay | THB | Thailand | Invoices that use this payment method only support the `send_invoice` collection method."
- **Collection method** (https://docs.stripe.com/billing/collection-method):
  - "`send_invoice`: Generates an invoice for each billing period, and requires manual payment … You can use the hosted invoice page and set up email notifications and reminders."
  - "if the subscription's collection_method is set to send_invoice, it becomes past_due when its invoice remains unpaid by the due date."
- **Hosted invoice page** (https://docs.stripe.com/invoicing/hosted-invoice-page):
  - Customers can "Pay the invoice using any of the enabled payment methods."
  - "Invoice URLs expire 30 days after the due date … never longer than 120 days."
  - Whether the page renders a PromptPay QR is **UNCONFIRMED**. No doc says so explicitly, though it is implied by the Invoicing support above.
- **QR expiry:** **UNCONFIRMED.** No Stripe doc states a PromptPay QR lifetime, and the API has no `expires_after_seconds` option for PromptPay (Pix has one).
  - The PaymentIntent `next_action.promptpay_display_qr_code` has the fields `data`, `hosted_instructions_url`, `image_url_png` and `image_url_svg`. No expiry field is documented (https://docs.stripe.com/api/payment_intents/object).
  - Checkout Sessions expire after 30 minutes to 24 hours, default 24 hours (https://docs.stripe.com/api/checkout/sessions/create, `expires_at`).
- **Other PromptPay limits:**
  - Maximum: "The maximum is 2 million Baht per transaction" (https://support.stripe.com/questions/promptpay-faq).
  - Disputes: "Not applicable".
  - Refunds: Stripe emails the customer for bank account details before refunding.

## 3. Methods for TH accounts that support recurring
**Verdict: Cards only, plus Apple Pay and Google Pay, which are card wallets.**

- **Cards available to TH accounts** (https://support.stripe.com/questions/supported-payment-methods-currencies-and-businesses-for-stripe-accounts-in-thailand):
  - Credit: "Visa, Mastercard" supported. "AMEX, CUP, JCBI and other local schemes" not supported.
  - Debit: international debit cards, and domestic TH debit cards in THB only.
  - The docs agree: "In Thailand, you can accept these cards: Visa, Mastercard, debit cards" (https://docs.stripe.com/currencies).
- **Card reuse:** Cards support SetupIntents and `setup_future_usage`: "Cards and bank debit methods … support both on_session and off_session with setup future usage."
- **E-wallets:** "Google Pay, Apple Pay" are supported. "Apple Pay is not available locally in Thailand", but foreign customers can use it. Both are "✓ Supported" for Subscriptions and Invoicing.
- **Not available to TH accounts:**
  - WeChat Pay, Alipay, TrueMoney Wallet, LINE Pay and Rabbit Pay are in the support article's "Not Supported" column.
  - Link: its business-location list does not include TH.
  - No bank debit (direct debit) method lists TH as a business location.

## 4. Surcharging and fees
**Verdict: No. Stripe does not offer surcharging for TH.**

- **Surcharging** (https://docs.stripe.com/payments/cards/surcharge): "Surcharging is available in the following countries and payment methods: United States (Credit cards only, 3%), Canada (Credit cards only, 2.4%), New Zealand (All cards, 4%)."
- **Legality under Thai law or Visa/Mastercard rules in TH:** **UNCONFIRMED.** No official Stripe page covers it.
- **Fees for TH accounts** (https://stripe.com/en-th/pricing, matching https://stripe.com/th/pricing):

  | Item | Fee |
  |---|---|
  | Domestic cards | "3.65% + ฿10.00" |
  | International cards | "4.75% + ฿10.00" |
  | Currency conversion | "+ 2% if currency conversion is required" |
  | PromptPay | "1.65% per successful PromptPay transfer." |
  | Refund | "+ ฿10.00 per refund" |
  | Dispute | "฿500.00 for each dispute you receive" |
  | Billing | "0.7% of Billing volume" |
  | Invoicing | "0.4% per paid invoice" |

- **VAT and withholding tax on Stripe fees** (https://support.stripe.com/questions/taxes-on-stripe-fees-for-thailand-based-businesses):
  - "The VAT charge is applied in addition to Stripe's product and service fees." The page's example uses 7%.
  - "You will be provided with a monthly tax invoice for the VAT that is charged on your Stripe fees."
  - "The fees for Stripe's services may attract 3% WHT."
  - In practice, budget about fee × 1.07 when pricing.

## 5. Stripe Tax and Thai tax invoices
**Verdict: Stripe Tax: No for TH-based sellers. A Thai-compliant ใบกำกับภาษี: UNCONFIRMED / not claimed.**

- **Stripe Tax support for TH** (https://docs.stripe.com/tax/supported-countries): "TH | Digital products | VAT | ❌ Not supported (Your business location) | ✓ Supported (Your customer location)". Stripe defines the column as "❌ Not supported means your business can't be based here."
- **Thailand tax page** (https://docs.stripe.com/tax/supported-countries/asia-pacific/thailand): "To collect this tax on Stripe, you must be a remote seller without a physical presence in the country." This covers foreign sellers only, with a 1.8M THB threshold.
- **Customer Thai VAT ID** (https://docs.stripe.com/billing/customer/tax-ids):
  - `th_vat` is supported: "TH | th_vat | Thai VAT | 1234567891234".
  - "A customer's tax IDs display in the header of invoice and credit note PDFs."
  - "Stripe only checks the format of tax ID types other than AU ABN, EU VAT, and GB VAT."
- **Thai tax invoice compliance:** no official Stripe page says Stripe invoices meet the Thai Revenue Code requirements (§86/4: the "ใบกำกับภาษี" heading, sequential numbering, seller and buyer tax ID and branch, and so on). **UNCONFIRMED. Assume No** and plan to issue the Thai tax invoice yourself or through a Thai e-Tax provider.
- **Manual 7% VAT:** you can still add 7% VAT with manual tax rates (`tax_rates`), which are not Stripe Tax. Their availability to TH is not separately confirmed but is assumed, since they are a core Billing object.

## 6. THB minimum charge
**Verdict: ฿10.**

- https://docs.stripe.com/currencies: "10 THB".
- The minimum "depends on the payout bank account settlement currency". TH accounts settle only in THB.
- "Subscription charges support zero-amount charges … However, any non-zero amount is still subject to the applicable minimum."
- THB is a two-decimal currency in the API: ฿10 is `amount=1000`.

---

## A. PromptPay paying Billing subscription invoices
- **Supported path:** a Subscription with `collection_method=send_invoice` and `days_until_due`, with PromptPay in `payment_settings.payment_method_types` or enabled in the invoice template. Each period Stripe emails the invoice; the customer opens the hosted invoice page and pays.
- **Rejected options:**
  - Checkout `mode=subscription`: "PromptPay … Subscription mode: No" and "PromptPay Checkout Sessions don't support recurring subscription plans" (https://docs.stripe.com/payments/promptpay/accept-a-payment?payment-ui=checkout).
  - Saving PromptPay for auto-charge: not possible, because SetupIntents and `setup_future_usage` are unsupported.
- **Hosted invoice page shows a PromptPay QR:** UNCONFIRMED (implied, not stated).
- **QR expiry:** UNCONFIRMED (see section 2).

## B. Other Thai mobile-banking or bank-app methods
- **None beyond PromptPay.** The TH support article lists only PromptPay under "Local payment methods".
- **Not supported:** TrueMoney Wallet, LINE Pay and Rabbit Pay are listed as not supported.
- **Thai bank redirects / online direct debit:** none listed for TH.
- **Recurring:** none of these methods supports it.

## C. PromptPay fee
**1.65%**, confirmed. en-th: "1.65% per successful PromptPay transfer." th: "1.65%" "ต่อการโอนเงินผ่าน PromptPay ที่สำเร็จ". VAT on the fee is extra (see section 4).

## D. Opn Payments (Omise) and 2C2P, comparison only
Stripe can do monthly PromptPay only as a manual payment each month, so this is included for reference.

| | Opn (Omise) | 2C2P |
|---|---|---|
| PromptPay QR | Yes. "By default, the QR code expires 24 hours after creation"; `expires_at` ≤ 24h. Min ฿20, max ฿150,000 (https://docs.omise.co/promptpay) | Yes, channel PPQR in the payment channels reference (https://developer.2c2p.com/docs/reference-payment-channels) |
| Auto-recurring PromptPay | UNCONFIRMED. The PromptPay doc describes one-time charges only. The Schedules API (https://docs.omise.co/schedules-api) references `card`. | UNCONFIRMED. Recurring Payment Plan (RPP) examples are card-only (`channelCode: CC`) (https://developer.2c2p.com/docs/redirect-api-rpp-recurring-payment-plan) |
| Thai online direct debit (recurring) | Has an "Online Direct Debit" guide; recurring use UNCONFIRMED | Has an Online Direct Debit channel (KBank, SCB, BBL); recurring use UNCONFIRMED |
| PromptPay fee | UNCONFIRMED. A sample response shows `fee_rate: "1.65"`, `vat_rate: "7.0"`, but this is not a price list. The pricing page is country-gated. | UNCONFIRMED. No public price list found. |

## E. Checkout `mode=payment` with card and PromptPay in THB (prepaid month pass)
**Verdict: Supported.**

- **Docs** (https://docs.stripe.com/payments/promptpay/accept-a-payment?payment-ui=checkout):
  - "Supported business locations: TH; Supported currencies: thb; Payment mode: Yes; Setup mode: No; Subscription mode: No."
  - "You can only use one-time line items."
  - `promptpay` is in the Checkout `payment_method_types` enum. The docs recommend Dashboard dynamic payment methods over a hard-coded list.
- **Events:** **UNCONFIRMED.** No doc states the exact event sequence for PromptPay.
  - Stripe classes PromptPay as "Real-time payments", "Payment confirmation: Customer-initiated", and says "You receive confirmation from Stripe instantly when they complete the payment."
  - The Checkout doc says "Completing the payment redirects customers back to your website."
  - This implies `checkout.session.completed` with `payment_status=paid`, and not the delayed `async_payment_*` flow, which the docs tie to "ACH direct debit and other bank transfers" (https://docs.stripe.com/checkout/fulfillment?ui=full-page).
  - The fulfillment guide still says to check `payment_status != 'unpaid'` and handle `checkout.session.async_payment_succeeded` / `async_payment_failed`. Handling all three costs little and is safe.
- **QR expiry inside Checkout:** UNCONFIRMED. The session itself expires after 30 minutes to 24 hours, default 24 hours.

## F. Checkout `invoice_creation` (post-payment invoice PDF)
**Verdict: Available, and it does not depend on Invoicing.**

- https://docs.stripe.com/receipts: "Invoice creation for one-time payments through the Checkout Sessions API is not an Invoicing feature, and is priced separately." Enable it with `invoice_creation[enabled]=true`.
- **Fee:** "0.4% on the transaction total, up to a maximum of $2 USD (or local currency equivalent) per invoice" (https://support.stripe.com/questions/pricing-for-post-payment-invoices-for-one-time-purchases-via-checkout-and-payment-links). The en-th pricing page shows "Post-payment invoices … 0.4% on transaction total US$2.00 cap per invoice" with no availability notice.
- **TH restriction:** none stated.
- **Thai tax-invoice compliance:** UNCONFIRMED (see section 5). `invoice_data.account_tax_ids`, `custom_fields` and `footer` can carry a seller tax ID and other text.

## G. Receipt emails for one-time payments
**Verdict: Yes. No TH restriction is stated.**

- https://docs.stripe.com/receipts: "Stripe creates receipts for all successful payments and refunds."
- Automatic emails need a recipient email, the public business contact details, and live mode. For Checkout, set `payment_intent_data.receipt_email` or use the Customer's email.
- A Stripe receipt is not a Thai tax invoice (UNCONFIRMED; assume not).
- Thai-language receipts: UNCONFIRMED.
