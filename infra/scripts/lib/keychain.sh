# shellcheck shell=bash
# Keychain vault for the owner's kubcode secrets (sourced by owner scripts).
#
# Items live in the login keychain as generic passwords with service
# "kubcode/<name>" and account "kubcode". They are created with an EMPTY
# trusted-application list (-T ""), so macOS asks for the login password on
# every read; nothing, including an agent running a script, reads them
# silently. Values only ever go into a variable or straight to their
# destination; no function here prints one except kc_get, whose output is
# meant for command substitution only.
#
# KUBCODE_KEYCHAIN=<path> targets another keychain file instead.
# Compatible with macOS's bash 3.2.

KC_PREFIX=kubcode/
KC_ACCOUNT=kubcode

_kc_path() { [ -z "${KUBCODE_KEYCHAIN:-}" ] || printf '%s' "$KUBCODE_KEYCHAIN"; }

kc_valid_name() { [[ "${1:-}" =~ ^[a-z0-9][a-z0-9-]{1,60}$ ]]; }

# GOOGLE_CLIENT_SECRET -> google-client-secret
kc_name() { printf '%s\n' "$1" | tr 'A-Z_' 'a-z-'; }

kc_has() {
  local p; p=$(_kc_path)
  security find-generic-password -s "$KC_PREFIX$1" -a "$KC_ACCOUNT" ${p:+"$p"} >/dev/null 2>&1
}

# For $(...) only: macOS asks for the login password before answering.
kc_get() {
  local p; p=$(_kc_path)
  security find-generic-password -s "$KC_PREFIX$1" -a "$KC_ACCOUNT" -w ${p:+"$p"} 2>/dev/null
}

kc_put() { # name value
  local p; p=$(_kc_path)
  kc_valid_name "$1" || return 2
  security add-generic-password -U -s "$KC_PREFIX$1" -a "$KC_ACCOUNT" -l "kubcode $1" -T "" -w "$2" ${p:+"$p"} >/dev/null
}

kc_del() {
  local p; p=$(_kc_path)
  security delete-generic-password -s "$KC_PREFIX$1" -a "$KC_ACCOUNT" ${p:+"$p"} >/dev/null 2>&1
}

# Names only, one per line.
kc_list() {
  local p; p=$(_kc_path)
  security dump-keychain ${p:+"$p"} 2>/dev/null |
    sed -n 's/^ *"svce"<blob>="kubcode\/\([a-z0-9-]*\)"$/\1/p' | sort -u
}

# kc_or_ask NAME HIDDEN PROMPT: the stored value if there is one (macOS asks
# for the password), otherwise ask on the terminal and offer to store it.
# Prints the value for command substitution; returns 1 if it ends up empty.
kc_or_ask() {
  local name=$1 hidden=$2 prompt=$3 value="" yn=""
  if kc_has "$name"; then
    if value=$(kc_get "$name") && [ -n "$value" ]; then
      echo "keychain: using kubcode/$name" >&2
      printf '%s' "$value"
      return 0
    fi
    echo "keychain: could not read kubcode/$name; asking instead" >&2
  fi
  if [ "$hidden" = 1 ]; then
    read -r -s -p "$prompt: " value
    echo >&2
  else
    read -r -p "$prompt: " value
  fi
  [ -n "$value" ] || return 1
  if [ -t 0 ]; then
    read -r -p "Save it in Keychain as kubcode/$name for next time? [Y/n] " yn
    case "$yn" in
    n | N) ;;
    *) kc_put "$name" "$value" && echo "keychain: saved kubcode/$name" >&2 ;;
    esac
  fi
  printf '%s' "$value"
}
