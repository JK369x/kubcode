#!/usr/bin/env bash
# The owner's Keychain vault for kubcode secrets (see lib/keychain.sh).
#
#   infra/scripts/secret.sh put NAME    store or replace (typed hidden, or piped on stdin)
#   infra/scripts/secret.sh has NAME    exit 0 if stored, 1 if not
#   infra/scripts/secret.sh list        stored names, never values
#   infra/scripts/secret.sh rm NAME     delete
#
# NAME: lowercase letters, digits and dashes, e.g. google-connect-client-secret.
# There is deliberately no command that prints a value: owner scripts
# (webhost.sh set-env / set-connect) read them and send them straight to
# their destination, and macOS asks for your login password on every read.
#
# Examples:
#   infra/scripts/secret.sh put supabase-sg-postgres-uri
#   python3 -c '...' file.json | infra/scripts/secret.sh put google-connect-client-secret
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib/keychain.sh
source "$(dirname "$0")/lib/keychain.sh"

die() { echo "secret: $*" >&2; exit 2; }
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" >&2; }

cmd=${1:-}
name=${2:-}
need_name() { kc_valid_name "$name" || die "NAME must be lowercase letters, digits and dashes (2-61 chars)"; }

case "$cmd" in
put)
  need_name
  if [ -t 0 ]; then
    read -r -s -p "Value for kubcode/$name (hidden): " value
    echo >&2
  else
    value=$(cat)
  fi
  [ -n "$value" ] || die "empty value; nothing stored"
  kc_put "$name" "$value" || die "Keychain refused to store kubcode/$name"
  unset value
  echo "secret: stored kubcode/$name (macOS will ask for your password when a script reads it)" >&2
  ;;
has)
  need_name
  if kc_has "$name"; then exit 0; else exit 1; fi
  ;;
list)
  kc_list
  ;;
rm)
  need_name
  kc_del "$name" || die "no kubcode/$name"
  echo "secret: removed kubcode/$name" >&2
  ;;
*)
  usage
  exit 2
  ;;
esac
