#!/usr/bin/env bash
# Builds dist/bootstrap for the Lambda runtime provided.al2023 (x86_64).
# The binary is statically linked against musl, so it runs without any
# shared libraries from the Lambda image. Run on Linux x86_64 (CI does).
#
# Outputs:
#   dist/bootstrap      the binary
#   dist/bootstrap.zip  `bootstrap` alone at the zip root, mode 0755. Pulumi
#                       uploads this file as-is (FileArchive) because an
#                       AssetArchive may drop the executable bit.
set -euo pipefail

TARGET="x86_64-unknown-linux-musl"

cd "$(dirname "${BASH_SOURCE[0]}")"

host="$(uname -s)-$(uname -m)"
if [[ "$host" != "Linux-x86_64" ]]; then
  echo "error: build on Linux x86_64 (the CI runner); this host is $host" >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1 || ! command -v rustup >/dev/null 2>&1; then
  echo "error: cargo and rustup are required" >&2
  exit 1
fi

if ! rustup target list --installed | grep -qx "$TARGET"; then
  echo "error: Rust target $TARGET is not installed; run: rustup target add $TARGET" >&2
  exit 1
fi

if ! command -v musl-gcc >/dev/null 2>&1; then
  echo "error: musl-gcc not found; run: sudo apt-get install -y musl-tools" >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "error: zip not found; run: sudo apt-get install -y zip" >&2
  exit 1
fi

cargo build --release --locked --target "$TARGET"

mkdir -p dist
cp "target/$TARGET/release/bootstrap" dist/bootstrap
chmod 755 dist/bootstrap

# -j drops directory names; -X drops uid/gid and timestamp extras but keeps the mode.
(cd dist && rm -f bootstrap.zip && zip -X -j bootstrap.zip bootstrap)

echo "built dist/bootstrap ($(wc -c <dist/bootstrap) bytes), dist/bootstrap.zip ($(wc -c <dist/bootstrap.zip) bytes)"
