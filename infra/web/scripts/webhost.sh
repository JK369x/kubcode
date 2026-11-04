#!/usr/bin/env bash
# Local admin/owner tool for the kubcode-web box (docs/adr/0001). Run from the
# repo root on the owner's machine, after `pulumi up` in infra/web.
#
#   webhost.sh known-hosts   pin the box's SSH host keys (read from the Lightsail API)
#   webhost.sh deploy-key    new CI deploy key: public half to host/, private half
#                            straight into the GitHub secret; plus host/known_hosts variables
#   webhost.sh provision     copy host/ to the box and run setup.sh (re-runnable)
#   webhost.sh set-env       owner types the secrets into hidden prompts; they go
#                            to /etc/kubcode/web.env over SSH stdin and nowhere else
#   webhost.sh smoke         run the on-box smoke test
#   webhost.sh status|rollback   the deploy command's status / switch back to the previous release
#   webhost.sh ssh           admin shell
set -euo pipefail

REPO_SLUG=JK369x/kubcode
INSTANCE=kubcode-web
STATIC_IP=kubcode-web-ip
REGION=ap-southeast-1
export AWS_PROFILE="${AWS_PROFILE:-default}"
HERE=$(cd "$(dirname "$0")/.." && pwd) # infra/web
KNOWN_HOSTS="$HERE/.known_hosts"       # git-ignored; host keys change on rebuild
ADMIN_KEY="${KUBCODE_ADMIN_KEY:-$HOME/.ssh/id_ed25519}"

die() { echo "webhost: $*" >&2; exit 1; }
box_ip() {
  aws lightsail get-static-ip --region "$REGION" --static-ip-name "$STATIC_IP" --query 'staticIp.ipAddress' --output text
}
admin_ssh() {
  [ -s "$KNOWN_HOSTS" ] || die "no pinned host keys; run: webhost.sh known-hosts"
  ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=yes "ubuntu@$(box_ip)" "$@"
}

known_hosts() {
  local ip keys
  ip=$(box_ip)
  # Host keys as the Lightsail control plane saw them at boot: no trust on first use.
  keys=$(aws lightsail get-instance-access-details --region "$REGION" --instance-name "$INSTANCE" --protocol ssh \
    --query 'accessDetails.hostKeys[].[algorithm,publicKey]' --output text)
  [ -n "$keys" ] || die "Lightsail has no host keys yet (instance still booting?)"
  awk -v ip="$ip" 'NF == 2 { print ip, $1, $2 }' <<<"$keys" >"$KNOWN_HOSTS"
  echo "webhost: pinned $(wc -l <"$KNOWN_HOSTS" | tr -d ' ') host keys for $ip in $KNOWN_HOSTS"
}

deploy_key() {
  local tmp ip
  [ -s "$KNOWN_HOSTS" ] || die "run known-hosts first"
  ip=$(box_ip)
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  ssh-keygen -q -t ed25519 -N '' -C kubcode-ci-deploy -f "$tmp/key"
  gh secret set LIGHTSAIL_DEPLOY_KEY -R "$REPO_SLUG" <"$tmp/key"
  gh variable set LIGHTSAIL_HOST -R "$REPO_SLUG" --body "$ip"
  gh variable set LIGHTSAIL_KNOWN_HOSTS -R "$REPO_SLUG" <"$KNOWN_HOSTS"
  cp "$tmp/key.pub" "$HERE/host/deploy_key.pub"
  echo "webhost: deploy key rotated. Commit infra/web/host/deploy_key.pub, then run: webhost.sh provision"
}

provision() {
  [ -s "$HERE/host/deploy_key.pub" ] || die "no host/deploy_key.pub; run deploy-key first"
  # shellcheck disable=SC2016 # expands on the box
  tar -czf - -C "$HERE" host | admin_ssh 'set -e; d=$(mktemp -d); tar -xzf - -C "$d"; sudo bash "$d/host/setup.sh"; rm -rf "$d"'
}

# Reads one value without echoing it. Values must fit a single-quoted line of
# a systemd EnvironmentFile: no newline and no single quote.
ask() {
  local name=$1 hidden=$2 value
  if [ "$hidden" = 1 ]; then read -r -s -p "$name: " value; echo >&2; else read -r -p "$name: " value; fi
  [ -n "$value" ] || die "$name is empty"
  case "$value" in *"'"* | *$'\n'*) die "$name contains a quote or newline" ;; esac
  printf "%s='%s'\n" "$name" "$value"
}

set_env() {
  local env db
  echo "Type each value; nothing is shown or saved on this machine." >&2
  env=$(
    ask GOOGLE_CLIENT_ID 0
    ask GOOGLE_CLIENT_SECRET 1
    ask LINE_CLIENT_SECRET 1
    ask DATABASE_URL 1
  )
  db=$(grep '^DATABASE_URL=' <<<"$env")
  [[ "$db" =~ ^DATABASE_URL=\'postgres(ql)?:// ]] || die "DATABASE_URL must start with postgres:// or postgresql://"
  env+=$'\n'"LINE_CLIENT_ID='2012344557'"
  env+=$'\n'"NEXTAUTH_URL='https://kubcode.dev'"
  env+=$'\n'"KUBCODE_ACCOUNTS_ENABLED='true'"
  env+=$'\n'"NEXT_PUBLIC_MEDIA_MODE='licensed-only'"
  # NEXTAUTH_SECRET is kept or generated on the box by write-env, never typed or printed.
  admin_ssh sudo /usr/local/lib/kubcode/write-env <<<"$env"
}

case "${1:-}" in
known-hosts) known_hosts ;;
deploy-key) deploy_key ;;
provision) provision ;;
set-env) set_env ;;
smoke) admin_ssh /usr/local/lib/kubcode/smoke ;;
status | rollback) admin_ssh sudo -u deploy env SSH_ORIGINAL_COMMAND="$1" /usr/local/bin/kubcode-deploy ;;
ssh) shift; admin_ssh "$@" ;;
*) sed -n '2,14p' "$0" >&2; exit 2 ;;
esac
