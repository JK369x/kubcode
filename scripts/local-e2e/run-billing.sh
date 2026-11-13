#!/usr/bin/env bash
# Billing local E2E (docs/dev/local-e2e.md "Billing"), Stripe TEST mode only.
#
# The Stripe CLI is never logged in for this: `stripe listen` and `stripe
# events resend` act as the account of the vault key kubcode/stripe-secret-key,
# which billing.ts hands to those child processes only, as STRIPE_API_KEY in
# their environment. The key is never on argv (ps), never printed, never
# written to disk, and ~/.config/stripe is not read or changed.
#
# Needs: the vault entry kubcode/stripe-secret-key (sk_test_/rk_test_), a
# loopback Postgres in KUBCODE_TEST_DATABASE_URL and `npm run build`.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${KUBCODE_TEST_DATABASE_URL:?set KUBCODE_TEST_DATABASE_URL to the local test Postgres}"
command -v stripe >/dev/null || { echo "run-billing: Stripe CLI not installed" >&2; exit 2; }
# shellcheck source=../../infra/scripts/lib/keychain.sh
source infra/scripts/lib/keychain.sh
kc_has stripe-secret-key || { echo "run-billing: vault has no kubcode/stripe-secret-key" >&2; exit 2; }
# Test keys only, checked on the prefix without printing the key.
kc_get stripe-secret-key | head -c 8 | grep -Eq '^(sk|rk)_test_' || { echo "run-billing: not a TEST key; refusing" >&2; exit 2; }
cargo build -q --manifest-path services/Cargo.toml -p kubcode-billing-lambda --example billing_local
# billing.ts reads the key from the vault itself (stdin of a subshell) and
# checks that the webhook secret `stripe listen` prints belongs to the same
# account as the key (the account id of every event must match).
exec npx tsx scripts/local-e2e/billing.ts
