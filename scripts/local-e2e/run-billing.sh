#!/usr/bin/env bash
# Billing local E2E (docs/dev/local-e2e.md "Billing"), Stripe TEST mode only.
# Needs: the Stripe CLI logged in to the kubcode test account, the vault entry
# kubcode/stripe-secret-key (sk_test_/rk_test_), a loopback Postgres in
# KUBCODE_TEST_DATABASE_URL and `npm run build`. Keys go vault/CLI -> stdin
# of the runner; never argv, env, logs or files.
set -euo pipefail
cd "$(dirname "$0")/../.."
source infra/scripts/lib/keychain.sh
: "${KUBCODE_TEST_DATABASE_URL:?set KUBCODE_TEST_DATABASE_URL to the local test Postgres}"
command -v stripe >/dev/null || { echo "run-billing: Stripe CLI not installed" >&2; exit 2; }
kc_has stripe-secret-key || { echo "run-billing: vault has no kubcode/stripe-secret-key" >&2; exit 2; }
kc_get stripe-secret-key | head -c 8 | grep -Eq '^(sk|rk)_test_' || { echo "run-billing: not a TEST key; refusing" >&2; exit 2; }
# The CLI must be logged in to the same account as the key (compared by id, read only).
want=$(kc_get stripe-secret-key | python3 -c 'import sys,base64,json,urllib.request as u; k=sys.stdin.read().strip(); r=u.Request("https://api.stripe.com/v1/account",headers={"Authorization":"Basic "+base64.b64encode((k+":").encode()).decode()}); print(json.load(u.urlopen(r,timeout=20))["id"])')
have=$(stripe config --list 2>/dev/null | awk -F"'" '/account_id/ {print $2; exit}')
[ -n "$have" ] || { echo "run-billing: the Stripe CLI is not logged in (stripe login)" >&2; exit 2; }
[ "$have" = "$want" ] || { echo "run-billing: the CLI is logged in to a different account than the key" >&2; exit 2; }
cargo build -q --manifest-path services/Cargo.toml -p kubcode-billing-lambda --example billing_local
exec npx tsx scripts/local-e2e/billing.ts
