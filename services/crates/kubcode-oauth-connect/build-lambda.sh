#!/usr/bin/env bash
# Builds dist/bootstrap for the Lambda runtime provided.al2023 (x86_64),
# statically linked against musl like the package signer. TLS uses rustls with
# the ring provider (ring's C parts build with musl-gcc). Run on Linux x86_64
# (CI does), or in Docker on a Mac: see infra/README.md.
#
# Outputs:
#   dist/bootstrap      the binary
#   dist/bootstrap.zip  `bootstrap` alone at the zip root, mode 0755. Pulumi
#                       uploads this file as-is (FileArchive).
set -euo pipefail

TARGET="x86_64-unknown-linux-musl"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

host="$(uname -s)-$(uname -m)"
[[ "$host" == "Linux-x86_64" ]] || { echo "error: build on Linux x86_64 (the CI runner); this host is $host" >&2; exit 1; }
command -v cargo >/dev/null 2>&1 && command -v rustup >/dev/null 2>&1 || { echo "error: cargo and rustup are required" >&2; exit 1; }
rustup target list --installed | grep -qx "$TARGET" || { echo "error: run: rustup target add $TARGET" >&2; exit 1; }
command -v musl-gcc >/dev/null 2>&1 || { echo "error: musl-gcc not found; run: sudo apt-get install -y musl-tools" >&2; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "error: zip not found; run: sudo apt-get install -y zip" >&2; exit 1; }

# The crate is a member of the services/ workspace.
cd "$HERE/../.."
CC_x86_64_unknown_linux_musl=musl-gcc \
  cargo build --release --locked -p kubcode-oauth-connect --bin bootstrap --target "$TARGET"

mkdir -p "$HERE/dist"
cp "${CARGO_TARGET_DIR:-target}/$TARGET/release/bootstrap" "$HERE/dist/bootstrap"
chmod 755 "$HERE/dist/bootstrap"
# -j drops directory names; -X drops uid/gid and timestamp extras but keeps the mode.
(cd "$HERE/dist" && rm -f bootstrap.zip && zip -X -j bootstrap.zip bootstrap)

echo "built dist/bootstrap ($(wc -c <"$HERE/dist/bootstrap") bytes), dist/bootstrap.zip ($(wc -c <"$HERE/dist/bootstrap.zip") bytes)"
