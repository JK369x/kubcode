#!/usr/bin/env bash
# Admin steps for the publishing Lambda's secrets (docs/design/publishing-core.md §9).
# Values go vault -> 0600 temp file -> SSM (file://), never argv, the screen or chat.
#
#   infra/scripts/publishing-secrets.sh zernio-key       vault kubcode/zernio-api-key -> SSM
#   infra/scripts/publishing-secrets.sh hmac             new web-host HMAC key -> SSM + vault kubcode/publishing-hmac-key
#   infra/scripts/publishing-secrets.sh webhook URL [--compromised]
#                                                        new webhook secret -> SSM, registered with Zernio for URL.
#                                                        The old one stays valid as -previous until drop-previous,
#                                                        unless --compromised (then it is dropped at once).
#   infra/scripts/publishing-secrets.sh drop-previous    end the rotation window (run about a day after webhook)
#   infra/scripts/publishing-secrets.sh status           which parameters exist (names only)
#
# Needs the admin AWS profile (account 955758449820). macOS asks for the
# login password whenever the vault is read.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib/keychain.sh
source "$(dirname "$0")/lib/keychain.sh"

REGION=ap-southeast-1
ACCOUNT=955758449820
P=/kubcode/prod
EVENTS='["post.platform.published","post.platform.failed","post.failed","post.partial","account.connected","account.disconnected","account.permissions_changed"]'

die() { echo "publishing-secrets: $*" >&2; exit 2; }
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" >&2; }

TMP=$(mktemp -d)
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

check_account() {
  local acct
  acct=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || die "no AWS credentials"
  [ "$acct" = "$ACCOUNT" ] || die "wrong AWS account ($acct); use the kubcode admin profile"
}

# put NAME FILE: SecureString under alias/kubcode-secrets.
put() {
  aws ssm put-parameter --region "$REGION" --type SecureString --key-id alias/kubcode-secrets \
    --overwrite --name "$1" --value "file://$2" >/dev/null
  echo "publishing-secrets: set $1" >&2
}

random_hex() { openssl rand -hex 32 | tr -d '\n'; }

cmd=${1:-}
case "$cmd" in
zernio-key)
  check_account
  kc_has zernio-api-key || die "vault has no kubcode/zernio-api-key; run: pbpaste | infra/scripts/secret.sh put zernio-api-key"
  (umask 077; kc_get zernio-api-key | tr -d '\n' >"$TMP/key")
  grep -Eq '^(sk|zrk)_[A-Za-z0-9]+$' "$TMP/key" || die "the stored value does not look like a Zernio key"
  put "$P/zernio-api-key" "$TMP/key"
  ;;
hmac)
  check_account
  (umask 077; random_hex >"$TMP/hmac")
  put "$P/publishing-hmac-key" "$TMP/hmac"
  kc_put publishing-hmac-key "$(cat "$TMP/hmac")" || die "Keychain refused kubcode/publishing-hmac-key"
  echo "publishing-secrets: also stored in the vault as kubcode/publishing-hmac-key (for the web host env)" >&2
  ;;
webhook)
  url=${2:-}
  compromised=${3:-}
  [ -z "$compromised" ] || [ "$compromised" = "--compromised" ] || die "unknown option $compromised"
  [[ "$url" =~ ^https://[a-z0-9]+\.lambda-url\.ap-southeast-1\.on\.aws/webhooks/zernio$ ]] ||
    die "URL must be the publishing Function URL + /webhooks/zernio"
  check_account
  kc_has zernio-api-key || die "vault has no kubcode/zernio-api-key"
  (umask 077
   random_hex >"$TMP/secret"
   printf 'Authorization: Bearer %s\n' "$(kc_get zernio-api-key | tr -d '\n')" >"$TMP/auth"
   python3 -c 'import json,sys; print(json.dumps({"name":"kubcode-prod","url":sys.argv[1],"secret":open(sys.argv[2]).read(),"events":json.loads(sys.argv[3])}))' \
     "$url" "$TMP/secret" "$EVENTS" >"$TMP/body")
  # The new secret goes to SSM first. The old one stays valid as -previous
  # until drop-previous, so deliveries signed just before the switch still
  # verify; after a leak it must stop working at once.
  if [ "$compromised" = "--compromised" ]; then
    aws ssm delete-parameter --region "$REGION" --name "$P/zernio-webhook-secret-previous" >/dev/null 2>&1 || true
  elif aws ssm get-parameter --region "$REGION" --name "$P/zernio-webhook-secret" --with-decryption \
       --query Parameter.Value --output text >"$TMP/old" 2>/dev/null; then
    put "$P/zernio-webhook-secret-previous" "$TMP/old"
    echo "publishing-secrets: run 'drop-previous' in about a day to end the rotation window" >&2
  fi
  put "$P/zernio-webhook-secret" "$TMP/secret"
  code=$(curl -sS -o "$TMP/resp" -w '%{http_code}' -X POST https://zernio.com/api/v1/webhooks/settings \
    -H @"$TMP/auth" -H 'Content-Type: application/json' --data-binary @"$TMP/body") || die "Zernio unreachable"
  case "$code" in
  2??) echo "publishing-secrets: webhook registered with Zernio ($code)" >&2 ;;
  *) die "Zernio answered $code; the SSM secret is set, register again after fixing" ;;
  esac
  ;;
drop-previous)
  check_account
  aws ssm delete-parameter --region "$REGION" --name "$P/zernio-webhook-secret-previous" >/dev/null 2>&1 &&
    echo "publishing-secrets: removed $P/zernio-webhook-secret-previous (the Lambda drops it within 5 minutes)" >&2 ||
    echo "publishing-secrets: no previous secret to remove" >&2
  ;;
status)
  check_account
  for n in worker-db-url publishing-hmac-key zernio-api-key zernio-webhook-secret zernio-webhook-secret-previous; do
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
