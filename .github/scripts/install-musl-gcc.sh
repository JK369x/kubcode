#!/usr/bin/env bash
# Provides musl-gcc (what the build-lambda.sh scripts link with) without the
# Ubuntu apt mirrors: builds the pinned musl release from source with the
# runner's gcc, checksum verified (~1 min). Idempotent: a second call only
# puts it on PATH.
#
# Usage (GitHub Actions): bash .github/scripts/install-musl-gcc.sh
set -euo pipefail

MUSL_VERSION="1.2.5"
MUSL_SHA256="a9a118bbe84d8764da0ea0d28b3ab3fae8477fc7e4085d90102b8596fc7c75e4"
PREFIX="${MUSL_PREFIX:-$HOME/.musl-$MUSL_VERSION}"

if [[ ! -x "$PREFIX/bin/musl-gcc" ]]; then
  work="$(mktemp -d)"
  tgz="$work/musl.tar.gz"
  curl -fsSL --retry 5 --retry-all-errors -o "$tgz" \
    "https://musl.libc.org/releases/musl-${MUSL_VERSION}.tar.gz"
  echo "${MUSL_SHA256}  $tgz" | sha256sum -c -
  tar -xzf "$tgz" -C "$work"
  (
    cd "$work/musl-${MUSL_VERSION}"
    ./configure --prefix="$PREFIX" --disable-shared >/dev/null
    make -j"$(nproc)" >/dev/null
    make install >/dev/null
  )
  rm -rf "$work"
fi

"$PREFIX/bin/musl-gcc" --version | head -1
echo "$PREFIX/bin" >>"${GITHUB_PATH:-/dev/null}"

# zip ships on the GitHub ubuntu images; fail loudly if that ever changes.
command -v zip >/dev/null || { echo "error: zip not found on the runner" >&2; exit 1; }
