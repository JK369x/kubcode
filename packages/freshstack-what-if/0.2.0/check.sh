#!/bin/sh
# Checks what this package needs on macOS or Linux / Windows WSL2. Installs nothing.
# Usage: sh check.sh
ok=0
have() { command -v "$1" >/dev/null 2>&1; }
say() { printf '%-28s %s\n' "$1" "$2"; }
case "$(uname -s)" in
  Darwin) say "OS" "macOS: supported" ;;
  Linux) if grep -qi microsoft /proc/version 2>/dev/null; then say "OS" "Windows WSL2: supported"; else say "OS" "Linux: supported"; fi ;;
  *) say "OS" "$(uname -s): NOT supported (use macOS, Linux or Windows WSL2)"; ok=1 ;;
esac
if have node; then
  v=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$v" -ge 18 ]; then say "Node" "$(node -v) ok"; else say "Node" "$(node -v): need 18+ (24 recommended)"; ok=1; fi
else say "Node" "MISSING: install Node 24 (nvm install 24)"; ok=1; fi
for t in ffmpeg ffprobe; do
  if have $t; then say "$t" "ok"; else say "$t" "MISSING: brew install ffmpeg / sudo apt install ffmpeg"; ok=1; fi
done
PY=${PYTHON:-python3}
if have "$PY"; then
  if "$PY" -c 'import sys;sys.exit(0 if sys.version_info>=(3,9) else 1)'; then say "Python" "$("$PY" -V 2>&1) ok"; else say "Python" "need 3.9+"; ok=1; fi
  for m in numpy PIL; do
    if "$PY" -c "import $m" 2>/dev/null; then say "python: $m" "ok"; else say "python: $m" "MISSING: pip install numpy Pillow"; ok=1; fi
  done
else say "Python" "MISSING: install Python 3.12"; ok=1; fi
if "$PY" -c "import sys;sys.path.insert(0,'$(dirname "$0")/host');from host_lib import find_chrome;print(find_chrome())" >/dev/null 2>&1; then
  say "Chrome (covers)" "ok"
else
  say "Chrome (covers)" "not found yet: run 'npx remotion browser ensure' in studio/ (Linux: see README for libnss3 etc.)"
fi
if [ -d "$(dirname "$0")/studio/node_modules" ]; then say "studio/node_modules" "ok"; else say "studio/node_modules" "run: cd studio && npm ci"; fi
if [ -n "${ELEVENLABS_VOICE_NAME:-}" ]; then say "ELEVENLABS_VOICE_NAME" "set"; else say "ELEVENLABS_VOICE_NAME" "not set: the name of YOUR voice (in .env or shell)"; fi
if [ -n "${ELEVENLABS_API_KEY:-}" ] || grep -qs '^ELEVENLABS_API_KEY=' .env; then say "ELEVENLABS_API_KEY" "set (not shown)"; else say "ELEVENLABS_API_KEY" "not set: put it in .env yourself, never in chat"; fi
[ $ok -eq 0 ] && echo "READY" || echo "MISSING ITEMS ABOVE"
exit $ok
