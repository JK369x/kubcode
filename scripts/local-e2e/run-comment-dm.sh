#!/usr/bin/env bash
# Local end-to-end for Instagram comment → DM (docs/dev/local-e2e.md).
#
#   scripts/local-e2e/run-comment-dm.sh
#       dry run: catch-up reads the account's recent comments and shows what the
#       rule (keyword KUBCODE_LOCAL_E2E_KEYWORD, default "kubcode-test") matches
#   KUBCODE_LOCAL_E2E_SEND=yes-send-real-dm scripts/local-e2e/run-comment-dm.sh
#       also sends: the real private reply and the public reply, from the account
#
# The Zernio key goes from the Keychain straight in on stdin (macOS asks for
# the login password); it is never printed, logged or put in env or argv.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source-path=SCRIPTDIR source=../../infra/scripts/lib/keychain.sh
source "$ROOT/infra/scripts/lib/keychain.sh"

: "${KUBCODE_TEST_DATABASE_URL:?set KUBCODE_TEST_DATABASE_URL to the local test database}"
kc_has zernio-api-key || { echo "local-e2e: vault has no kubcode/zernio-api-key" >&2; exit 2; }

cd "$ROOT"
kc_get zernio-api-key | npx tsx scripts/local-e2e/comment-dm.ts
