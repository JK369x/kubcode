#!/usr/bin/env bash
# Local end-to-end run for channel connect (docs/dev/local-e2e.md).
#
#   scripts/local-e2e/run.sh            connect YouTube, check, disconnect, clean up
#   scripts/local-e2e/run.sh instagram  same for Instagram
#
# Needs: the local test Postgres (KUBCODE_TEST_DATABASE_URL), `npm run build`,
# and the owner at the keyboard: macOS asks for the login password to read the
# Zernio key, and the platform's consent runs in the owner's default browser.
# The key goes from the Keychain straight into the harness on stdin; it is
# never printed, logged or put in env or argv.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source-path=SCRIPTDIR source=../../infra/scripts/lib/keychain.sh
source "$ROOT/infra/scripts/lib/keychain.sh"

: "${KUBCODE_TEST_DATABASE_URL:?set KUBCODE_TEST_DATABASE_URL to the local test database}"
[ -f "$ROOT/.next/BUILD_ID" ] || { echo "local-e2e: run 'npm run build' first" >&2; exit 2; }
kc_has zernio-api-key || { echo "local-e2e: vault has no kubcode/zernio-api-key" >&2; exit 2; }

cd "$ROOT"
kc_get zernio-api-key | npx tsx scripts/local-e2e/connect.ts "${1:-youtube}"
