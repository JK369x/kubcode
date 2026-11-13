#!/usr/bin/env bash
# Admin steps for the billing Lambda's secrets (ADR 0008). TEST MODE ONLY:
# a live Stripe key is refused here and by the Lambda.
# Values go vault -> 0600 temp file -> SSM (file://), never argv, the screen or chat.
#
#   infra/scripts/billing-secrets.sh stripe-key        vault kubcode/stripe-secret-key -> SSM (sk_test_/rk_test_ only)
#   infra/scripts/billing-secrets.sh hmac              new web-host HMAC key -> SSM + vault kubcode/billing-hmac-key
#   infra/scripts/billing-secrets.sh webhook-secret    vault kubcode/stripe-webhook-secret (whsec_…) -> SSM
#                                                      (the old one stays valid as -previous until drop-previous)
#   infra/scripts/billing-secrets.sh drop-previous     end the webhook rotation window
#   infra/scripts/billing-secrets.sh status            which parameters exist (names only)
#
# The DB URL (/kubcode/prod/billing-db-url, role kubcode_billing with LOGIN)
# is set like the worker's: see infra/README.md "Billing Lambda".
# Needs the admin AWS profile (account 955758449820).
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib/keychain.sh
source "$(dirname "$0")/lib/keychain.sh"

REGION=ap-southeast-1
ACCOUNT=955758449820
P=/kubcode/prod

die() { echo "billing-secrets: $*" >&2; exit 2; }
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" >&2; }

TMP=$(mktemp -d)
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

check_account() {
  local acct
  acct=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || die "no AWS credentials"
  [ "$acct" = "$ACCOUNT" ] || die "wrong AWS account ($acct); use the kubcode admin profile"
}

put() {
  aws ssm put-parameter --region "$REGION" --type SecureString --key-id alias/kubcode-secrets \
    --overwrite --name "$1" --value "file://$2" >/dev/null
  echo "billing-secrets: set $1" >&2
}

cmd=${1:-}
case "$cmd" in
stripe-key)
  check_account
  kc_has stripe-secret-key || die "vault has no kubcode/stripe-secret-key; run: pbpaste | infra/scripts/secret.sh put stripe-secret-key"
  (umask 077; kc_get stripe-secret-key | tr -d '\n' >"$TMP/key")
  grep -Eq '^(sk|rk)_test_[A-Za-z0-9]+$' "$TMP/key" || die "the stored value is not a Stripe TEST key (sk_test_/rk_test_); live keys are out of scope"
  put "$P/stripe-secret-key" "$TMP/key"
  ;;
hmac)
  check_account
  (umask 077; openssl rand -hex 32 | tr -d '\n' >"$TMP/hmac")
  put "$P/billing-hmac-key" "$TMP/hmac"
  kc_put billing-hmac-key "$(cat "$TMP/hmac")" || die "Keychain refused kubcode/billing-hmac-key"
  echo "billing-secrets: also stored in the vault as kubcode/billing-hmac-key (for the web host env)" >&2
  ;;
webhook-secret)
  check_account
  kc_has stripe-webhook-secret || die "vault has no kubcode/stripe-webhook-secret (the endpoint's whsec_ from the Dashboard)"
  (umask 077; kc_get stripe-webhook-secret | tr -d '\n' >"$TMP/secret")
  grep -Eq '^whsec_[A-Za-z0-9]+$' "$TMP/secret" || die "the stored value does not look like a webhook secret"
  if aws ssm get-parameter --region "$REGION" --name "$P/stripe-webhook-secret" --with-decryption \
       --query Parameter.Value --output text >"$TMP/old" 2>/dev/null; then
    put "$P/stripe-webhook-secret-previous" "$TMP/old"
    echo "billing-secrets: run 'drop-previous' in about a day to end the rotation window" >&2
  fi
  put "$P/stripe-webhook-secret" "$TMP/secret"
  ;;
drop-previous)
  check_account
  aws ssm delete-parameter --region "$REGION" --name "$P/stripe-webhook-secret-previous" >/dev/null 2>&1 &&
    echo "billing-secrets: removed $P/stripe-webhook-secret-previous" >&2 ||
    echo "billing-secrets: no previous secret to remove" >&2
  ;;
status)
  check_account
  for n in billing-db-url billing-hmac-key stripe-secret-key stripe-webhook-secret stripe-webhook-secret-previous; do
    if aws ssm describe-parameters --region "$REGION" \
         --parameter-filters "Key=Name,Values=$P/$n" --query 'length(Parameters)' --output text | grep -qx 1; then
      echo "set     $P/$n"
    else
      echo "missing $P/$n"
    fi
  done
  ;;
*)
  usage
  exit 2
  ;;
esac
