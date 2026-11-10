#!/bin/bash
# tune.sh 'JSON' ids... : gate stills with a LOOK_TUNE override, then the four numbers per shot
. "$(dirname "$0")/env.sh"; cd "$HERE"; mkdir -p gate; T="$1"; shift
LOOK_TUNE="$T" "$BL" -b -P scene.py -- gate "$(pwd -W)/gate" "$@" 2>&1 | grep -E "Traceback|Error"
for i in "$@"; do ./measure.sh gate/$i.png | sed 's/=/ /g' | awk '{printf "%s Y%.0f lo%s hi%s S%.0f\n",$1,$5,$3,$7,$9}'; done | paste - - - -
