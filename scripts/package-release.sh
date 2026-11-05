#!/usr/bin/env bash
# Packs a finished `next build` (output: "standalone") into the release tarball
# that infra/web/host/kubcode-deploy installs: server.js at the root, plus
# .next/static and public/, which standalone output leaves out. Symlinks are
# dereferenced because the deploy command refuses links.
# Usage: scripts/package-release.sh <out.tar.gz>
set -euo pipefail
out=${1:?usage: package-release.sh <out.tar.gz>}
[ -f .next/standalone/server.js ] || { echo "package-release: run next build with output standalone first" >&2; exit 1; }

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -RL .next/standalone/. "$stage/"
mkdir -p "$stage/.next"
cp -RL .next/static "$stage/.next/static"
cp -RL public "$stage/public"
# Public Supabase CA (provenance: db/certs/README.md); start-web exports it.
cp db/certs/supabase-prod-ca.pem "$stage/db-ca.pem"
# Never ship local env files or the build cache.
rm -rf "$stage"/.env* "$stage/.next/cache"

# mktemp -d is 0700 and tar records it on "./"; the box's app user must read it.
chmod 755 "$stage"
tar -czf "$out" -C "$stage" .
echo "package-release: $out $(wc -c <"$out" | tr -d ' ') bytes, $(tar -tzf "$out" | wc -l | tr -d ' ') entries"
