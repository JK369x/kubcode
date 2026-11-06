#!/usr/bin/env bash
# Local admin/owner tool for the kubcode-web box (docs/adr/0001). Run from the
# repo root on the owner's machine, after `pulumi up` in infra/web.
#
#   webhost.sh known-hosts   pin the box's SSH host keys (read from the Lightsail API)
#   webhost.sh deploy-key    new CI deploy key: public half to host/ and onto the box
#                            (runs provision), THEN the private half into the GitHub
#                            secret, plus the host and known_hosts variables
#   webhost.sh provision     copy host/ to the box and run setup.sh (re-runnable)
#   webhost.sh set-env       owner types the secrets into hidden prompts; they go
#                            to /etc/kubcode/web.env over SSH stdin and nowhere else
#   webhost.sh set-downloads only the skill-download settings (signer URL + key),
#                            merged into web.env; every other value is kept
#   webhost.sh set-worker-db rotate the LOGIN password of the DB role kubcode_worker:
#                            the SQL goes to the clipboard for the Supabase SQL editor,
#                            the URL straight into SSM (/kubcode/prod/worker-db-url).
#                            The first password comes from infra/scripts/move-db.sh
#   webhost.sh set-connect   OAuth connect (docs/design/settings-keys.md §2): a new
#                            HMAC key and the Google "kubcode web connect" client go
#                            to SSM; the Lambda URL, HMAC key and client id are merged
#                            into web.env. No value is printed or put in argv
#   webhost.sh smoke         run the on-box smoke test
#   webhost.sh tls           right after the DNS flip: restart Caddy so it gets the
#                            certificate now, and wait until the box serves it
#   webhost.sh status|rollback   live/previous release; rollback SWAPS them (twice = undo)
#   webhost.sh ssh           admin shell
set -euo pipefail

REPO_SLUG=JK369x/kubcode
INSTANCE=kubcode-web
STATIC_IP=kubcode-web-ip
REGION=ap-southeast-1
export AWS_PROFILE="${AWS_PROFILE:-default}"
HERE=$(cd "$(dirname "$0")/.." && pwd) # infra/web
KNOWN_HOSTS="$HERE/.known_hosts"       # git-ignored; host keys change on rebuild
# Owner secrets come from the Keychain vault when stored there
# (infra/scripts/secret.sh); otherwise they are asked for and can be saved.
# shellcheck source-path=SCRIPTDIR source=../../scripts/lib/keychain.sh
source "$HERE/../scripts/lib/keychain.sh"
# Admin login: by default a short-lived SSH certificate from the Lightsail
# API (what Lightsail's browser SSH uses), so no passphrase or agent is
# needed. Set KUBCODE_ADMIN_KEY to use your own key instead (it must be
# usable without a prompt, e.g. loaded in ssh-agent).
ADMIN_KEY="${KUBCODE_ADMIN_KEY:-}"

die() { echo "webhost: $*" >&2; exit 1; }
TMP=""
ACCESS=""
trap '[ -z "$TMP" ] || rm -rf "$TMP"; [ -z "$ACCESS" ] || rm -rf "$ACCESS"' EXIT
box_ip() {
  aws lightsail get-static-ip --region "$REGION" --static-ip-name "$STATIC_IP" --query 'staticIp.ipAddress' --output text
}
admin_ssh() {
  local id=()
  [ -s "$KNOWN_HOSTS" ] || die "no pinned host keys; run: webhost.sh known-hosts"
  if [ -n "$ADMIN_KEY" ]; then
    id=(-i "$ADMIN_KEY")
  else
    if [ -z "$ACCESS" ]; then
      ACCESS=$(mktemp -d)
      (umask 077 && aws lightsail get-instance-access-details --region "$REGION" --instance-name "$INSTANCE" --protocol ssh --output json |
        python3 -c 'import json, sys
d = json.load(sys.stdin)["accessDetails"]
open(sys.argv[1] + "/key", "w").write(d["privateKey"])
open(sys.argv[1] + "/key-cert.pub", "w").write(d["certKey"] + "\n")' "$ACCESS")
    fi
    id=(-i "$ACCESS/key" -o CertificateFile="$ACCESS/key-cert.pub")
  fi
  ssh "${id[@]}" -o IdentitiesOnly=yes -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=yes "ubuntu@$(box_ip)" "$@"
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

# The box gets the new public key first; only then does CI get the private
# key, so CI never holds a key the box doesn't accept. The private key lives
# in a temp dir removed on any exit.
deploy_key() {
  local ip
  [ -s "$KNOWN_HOSTS" ] || die "run known-hosts first"
  ip=$(box_ip)
  TMP=$(mktemp -d)
  ssh-keygen -q -t ed25519 -N '' -C kubcode-ci-deploy -f "$TMP/key"
  cp "$TMP/key.pub" "$HERE/host/deploy_key.pub"
  provision
  gh secret set LIGHTSAIL_DEPLOY_KEY -R "$REPO_SLUG" <"$TMP/key"
  gh variable set LIGHTSAIL_HOST -R "$REPO_SLUG" --body "$ip"
  gh variable set LIGHTSAIL_KNOWN_HOSTS -R "$REPO_SLUG" <"$KNOWN_HOSTS"
  echo "webhost: deploy key installed on the box and in GitHub. Commit infra/web/host/deploy_key.pub."
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
  value=$(kc_or_ask "$(kc_name "$name")" "$hidden" "$name") || die "$name is empty"
  [ -n "$value" ] || die "$name is empty"
  case "$value" in *"'"* | *$'\n'*) die "$name contains a quote or newline" ;; esac
  printf "%s='%s'\n" "$name" "$value"
}

# Optional skill downloads (docs/adr/0002). An empty signer URL leaves them
# off; otherwise the URL (stack output packageSignerUrl) and the HMAC key
# (the kubcode:packageSignerKey value) are written and the flag turned on.
ask_downloads() {
  local url key
  read -r -p "KUBCODE_PACKAGE_SIGNER_URL (empty = downloads off): " url
  [ -n "$url" ] || return 0
  [[ "$url" =~ ^https://[a-z0-9.-]+/?$ ]] || die "KUBCODE_PACKAGE_SIGNER_URL must be https://<host>/ with no path or query"
  read -r -s -p "KUBCODE_PACKAGE_SIGNER_KEY: " key
  echo >&2
  [ "${#key}" -ge 32 ] || die "KUBCODE_PACKAGE_SIGNER_KEY must be at least 32 characters"
  case "$key" in *"'"* | *$'\n'*) die "KUBCODE_PACKAGE_SIGNER_KEY contains a quote or newline" ;; esac
  printf "KUBCODE_PACKAGE_SIGNER_URL='%s'\nKUBCODE_PACKAGE_SIGNER_KEY='%s'\nKUBCODE_DOWNLOADS_ENABLED='true'\n" "$url" "$key"
}

set_env() {
  local env db
  echo "Type each value; nothing is shown or saved on this machine." >&2
  env=$(
    ask GOOGLE_CLIENT_ID 0
    ask GOOGLE_CLIENT_SECRET 1
    ask LINE_CLIENT_SECRET 1
    ask DATABASE_URL 1
    ask_downloads
  )
  # Same shape rule as lib/auth-policy.ts, to catch a paste error before the box does.
  grep -Eq "^GOOGLE_CLIENT_ID='[0-9]{6,}-[a-z0-9]{8,}[.]apps[.]googleusercontent[.]com'$" <<<"$env" ||
    die "GOOGLE_CLIENT_ID should look like 123456789-abc...xyz.apps.googleusercontent.com"
  db=$(grep '^DATABASE_URL=' <<<"$env")
  [[ "$db" =~ ^DATABASE_URL=\'postgres(ql)?:// ]] || die "DATABASE_URL must start with postgres:// or postgresql://"
  env+=$'\n'"LINE_CLIENT_ID='2012344557'"
  env+=$'\n'"NEXTAUTH_URL='https://kubcode.dev'"
  env+=$'\n'"KUBCODE_ACCOUNTS_ENABLED='true'"
  env+=$'\n'"NEXT_PUBLIC_MEDIA_MODE='licensed-only'"
  # NEXTAUTH_SECRET is kept or generated on the box by write-env, never typed or
  # printed. If the app then fails its smoke, write-env puts the old file back.
  admin_ssh sudo /usr/local/lib/kubcode/write-env <<<"$env"
}

# Turns skill downloads on without retyping the other secrets: write-env
# --merge replaces just these keys, then restarts and smokes (or rolls back).
set_downloads() {
  local env
  env=$(ask_downloads)
  [ -n "$env" ] || die "no signer URL given; nothing changed"
  admin_ssh sudo /usr/local/lib/kubcode/write-env --merge <<<"$env"
}

# --- OAuth connect (docs/design/settings-keys.md §2, §5). SecureStrings use
# alias/kubcode-secrets; values are written from a 0600 temp file (file://),
# never passed on the command line.
# Supabase project kubcode-sg (ap-southeast-1), next to the Lambdas and the web host.
SUPABASE_REF=pdoszbllzpgbspthcxis
ssm_put() { # name, file
  aws ssm put-parameter --region "$REGION" --type SecureString --key-id alias/kubcode-secrets \
    --overwrite --name "$1" --value "file://$2" >/dev/null
}

set_worker_db() {
  local host pw f
  read -r -p "Supabase Session pooler host (Connect › Session pooler, e.g. aws-0-ap-southeast-1.pooler.supabase.com): " host
  [[ "$host" =~ ^[a-z0-9.-]+[.]pooler[.]supabase[.]com$ ]] || die "host must be <something>.pooler.supabase.com"
  pw=$(openssl rand -hex 24) # hex: nothing to URL-encode
  printf "ALTER ROLE kubcode_worker LOGIN PASSWORD '%s';\nGRANT CONNECT ON DATABASE postgres TO kubcode_worker;\n" "$pw" | pbcopy
  echo "The SQL is on the clipboard. Paste it into the Supabase SQL editor (project $SUPABASE_REF), run it," >&2
  read -r -p "then press Enter here (Ctrl-C to stop; nothing has been stored yet): " _
  printf '' | pbcopy
  f="$TMP/worker"
  (umask 077 && printf "postgresql://kubcode_worker.%s:%s@%s:5432/postgres?sslmode=require" "$SUPABASE_REF" "$pw" "$host" >"$f")
  ssm_put /kubcode/prod/worker-db-url "$f"
  rm -f "$f"
  echo "webhost: /kubcode/prod/worker-db-url set; the Lambda picks it up within 5 minutes" >&2
}

set_connect() {
  local url cid secret key f env
  url=$(cd "$HERE/.." && pulumi stack output --stack prod oauthConnectUrl)
  [[ "$url" =~ ^https://[a-z0-9]+[.]lambda-url[.]ap-southeast-1[.]on[.]aws/$ ]] || die "no oauthConnectUrl stack output (admin pulumi up first)"
  cid=$(kc_or_ask google-connect-client-id 0 "Google Web client ID of \"kubcode web connect\"") || die "client ID is empty"
  [[ "$cid" =~ ^[0-9]{6,}-[a-z0-9]{8,}[.]apps[.]googleusercontent[.]com$ ]] || die "client ID should look like 123456789-abc...xyz.apps.googleusercontent.com"
  secret=$(kc_or_ask google-connect-client-secret 1 "Its client secret (hidden)") || die "client secret is empty"
  [ -n "$secret" ] || die "client secret is empty"
  case "$secret" in *"'"* | *'"'* | *\\* | *$'\n'*) die "client secret contains a quote, backslash or newline" ;; esac
  key=$(openssl rand -hex 32)
  f="$TMP/connect"
  (umask 077 && printf %s "$key" >"$f")
  ssm_put /kubcode/prod/connect-hmac-key "$f"
  (umask 077 && printf '{"client_id":"%s","client_secret":"%s"}' "$cid" "$secret" >"$f")
  ssm_put /kubcode/prod/google-connect-client "$f"
  rm -f "$f"
  unset secret
  env=$(printf "KUBCODE_CONNECT_URL='%s'\nKUBCODE_CONNECT_HMAC_KEY='%s'\nKUBCODE_YOUTUBE_CLIENT_ID='%s'\n" "$url" "$key" "$cid")
  unset key
  admin_ssh sudo /usr/local/lib/kubcode/write-env --merge <<<"$env"
  echo "webhost: connect settings stored; the Lambda picks up the new key within 5 minutes" >&2
}

# Caddy tried for the certificate at provision time, while DNS still pointed
# at Vercel, and is now backing off. A restart makes it try again at once.
tls() {
  local ip
  ip=$(box_ip)
  [ "$(dig +short A kubcode.dev @1.1.1.1)" = "$ip" ] || die "kubcode.dev does not resolve to $ip yet (pulumi up with dnsTarget=lightsail first)"
  admin_ssh sudo systemctl restart caddy
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null --resolve "kubcode.dev:443:$ip" https://kubcode.dev/; then
      echo "webhost: the box serves a valid certificate for kubcode.dev"
      return 0
    fi
    sleep 4
  done
  die "no valid certificate after 2 minutes; check: webhost.sh ssh sudo journalctl -u caddy -n 50"
}

case "${1:-}" in
known-hosts) known_hosts ;;
deploy-key) deploy_key ;;
provision) provision ;;
set-env) set_env ;;
set-downloads) set_downloads ;;
set-worker-db) TMP=$(mktemp -d) && set_worker_db ;;
set-connect) TMP=$(mktemp -d) && set_connect ;;
smoke) admin_ssh /usr/local/lib/kubcode/smoke ;;
tls) tls ;;
status | rollback) admin_ssh sudo -u deploy env SSH_ORIGINAL_COMMAND="$1" /usr/local/bin/kubcode-deploy ;;
ssh) shift; admin_ssh "$@" ;;
*) awk 'NR > 1 && /^#/ { print; next } NR > 1 { exit }' "$0" >&2; exit 2 ;;
esac
