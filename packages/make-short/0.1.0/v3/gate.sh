#!/bin/bash
# gate.sh [shot ids...]  -> one still per shot in gate/ + PASS/FAIL numbers (gate.py)
. "$(dirname "$0")/env.sh"; cd "$HERE"; mkdir -p gate
"$BL" -b -P scene.py -- gate "$(pwd -W)/gate" "$@" 2>&1 | grep -E "^PROJ|Traceback|Error|File" > gate/proj.txt
grep -vE "^PROJ" gate/proj.txt
python gate.py
