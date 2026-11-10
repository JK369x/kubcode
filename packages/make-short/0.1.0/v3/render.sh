#!/bin/bash
# render.sh A B  -> frames A..B-1 into render/ (called by go.sh)
. "$(dirname "$0")/env.sh"; cd "$HERE"; mkdir -p render
"$BL" -b -P scene.py -- frames "$(pwd -W)/render" $1 $2 12 > render/log_$1.txt 2>&1
