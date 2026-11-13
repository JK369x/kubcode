# Stripe fixtures (test mode)

`session_created.json` is a real `POST /v1/checkout/sessions` response from the kubcode
test-mode account (2026-11-13, API `2026-10-28.endive`, 2 × ฿289, THB), with the
hosted URL's token redacted. That session was expired right after recording.

The paid / unpaid / expired sessions and the events are derived from it by changing only
the fields Stripe documents for those states (`status`, `payment_status`, `payment_intent`
expanded with `payment_method_types`), because completing a payment needs a browser.
PR4's local end-to-end run checks them against live test-mode payments (card 4242,
declined card, PromptPay) through `stripe listen`.
