#!/usr/bin/env bash
# Local end-to-end for publishing (docs/dev/local-e2e.md, "Publish").
#
#   KUBCODE_LOCAL_E2E_CLIP=<clip-id> [KUBCODE_LOCAL_E2E_TITLE=...] scripts/local-e2e/run-publish.sh
#       dry run: push + the CLI's summary, then cancel (nothing sent to Zernio)
#   ... KUBCODE_LOCAL_E2E_POST=<same clip-id> scripts/local-e2e/run-publish.sh
#       posts it (private by default) to the production channel's account
#
# The Zernio key goes from the Keychain straight in on stdin (macOS asks for
# the login password); it is never printed, logged or put in env or argv.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source-path=SCRIPTDIR source=../../infra/scripts/lib/keychain.sh
source "$ROOT/infra/scripts/lib/keychain.sh"

: "${KUBCODE_TEST_DATABASE_URL:?set KUBCODE_TEST_DATABASE_URL to the local test database}"
: "${KUBCODE_LOCAL_E2E_CLIP:?set KUBCODE_LOCAL_E2E_CLIP to the clip id}"
kc_has zernio-api-key || { echo "local-e2e: vault has no kubcode/zernio-api-key" >&2; exit 2; }

cd "$ROOT"
kc_get zernio-api-key | npx tsx scripts/local-e2e/publish.ts "${1:-youtube}"
