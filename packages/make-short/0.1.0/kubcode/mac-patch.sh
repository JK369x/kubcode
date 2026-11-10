#!/bin/bash
# mac-patch.sh <project folder>: makes a copy of make-short's v3 run on macOS (kubcode.dev, MIT like upstream).
# Upstream assumes Windows + Git Bash: `pwd -W`, `python`, Blender under C:\Program Files. This only edits the copy.
set -euo pipefail
P="${1:?usage: mac-patch.sh <project folder (a copy of v3)>}"; cd "$P"
[ -f env.sh ] && [ -f scene.py ] || { echo "not a make-short v3 copy: $P" >&2; exit 2; }
for f in gate.sh tune.sh render.sh; do sed -i '' 's/\$(pwd -W)/$(pwd)/g' "$f"; done
sed -i '' 's/^python gate.py/python3 gate.py/' gate.sh
sed -i '' 's/(python -c /(python3 -c /' go.sh
sed -i '' "s/\['python', os.path.abspath/['python3', os.path.abspath/" lib/sets.py
grep -q 'Blender.app' env.sh || sed -i '' 's#^\[ -x "\$BL" \]#[ -x "$BL" ] || BL="/Applications/Blender.app/Contents/MacOS/Blender"\n&#' env.sh
chmod +x ./*.sh
echo "mac-patch: done ($P)"
