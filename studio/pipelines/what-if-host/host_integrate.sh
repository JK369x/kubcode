#!/bin/sh
# Host integration + stills QA for one vertical episode.
# Usage: sh host_integrate.sh <slug> [--voice-dir DIR]
# Paths come from env (see host_lib.py): WHATIF_STUDIO, WHATIF_WORK, WHATIF_VOICE_DIR, STUDIO_MEDIA_ROOT.
set -eu
H=$(cd "$(dirname "$0")" && pwd)
SLUG=$1; shift
PY=${PYTHON:-python3}
STUDIO=$("$PY" -c "import sys;sys.path.insert(0,'$H');from host_lib import studio_dir;print(studio_dir())")
WORK=$("$PY" -c "import sys;sys.path.insert(0,'$H');from host_lib import work_dir;print(work_dir())")
COMP=$("$PY" -c "import sys;sys.path.insert(0,'$H');from host_lib import comp_id;print(comp_id('$SLUG'))")
EP=$STUDIO/src/episodes/$SLUG
"$PY" - "$EP" <<'PY'
import json, re, sys
ep = sys.argv[1]
c = json.load(open(ep + '/cues.json', encoding='utf-8')); t = json.load(open(ep + '/timing.json', encoding='utf-8'))
norm = lambda s: re.sub(r'\s+', '', s)
bad = [L['id'] for L in t['lines'] if norm(''.join(x['spoken'] for x in c if x['line'] == L['id'])) != norm(L['text'])]
print('cues mismatch:', bad or 'none')
sys.exit(1 if bad else 0)
PY
"$PY" "$H/host_timing.py" "$SLUG" "$@"
grep -qx "$SLUG" "$STUDIO/READY" 2>/dev/null || echo "$SLUG" >> "$STUDIO/READY"
"$PY" "$H/host_root.py"
# Typecheck the whole project but only fail on errors in this episode or shared files (other episodes may be mid-write).
TSC=$(cd "$STUDIO" && npx tsc --noEmit 2>&1 || true)
ERR=$(printf "%s\n" "$TSC" | grep "error TS" | grep -v "src/episodes/" || true; printf "%s\n" "$TSC" | grep "src/episodes/$SLUG/" || true)
ERR=$(printf "%s" "$ERR" | grep . || true)
[ -z "$ERR" ] || { echo "$ERR"; exit 1; }
echo "typecheck ok"
FR=$("$PY" -c "import json;t=json.load(open('$EP/timing.json',encoding='utf-8'));print(' '.join(map(str,[8]+[(s['a']+s['b'])//2 for s in t['segments']]+[t['total']-5])))")
OUT=$WORK/deliverables/qa-$SLUG/stills; mkdir -p "$OUT"
(cd "$STUDIO" && node stills.mjs "$COMP" "$OUT" $FR) | grep -c still
ARGS=""; N=0; for f in $FR; do ARGS="$ARGS -i $OUT/f$f.png"; N=$((N+1)); done
# shellcheck disable=SC2086
ffmpeg -v error -y $ARGS -filter_complex "hstack=inputs=$N,scale=2430:-1" "$WORK/deliverables/qa-$SLUG/stills-strip.jpg"
echo "strip $WORK/deliverables/qa-$SLUG/stills-strip.jpg"
