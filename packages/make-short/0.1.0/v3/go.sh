#!/bin/bash
# go.sh rNN  -> full native 1080x1920 render in 3 processes, encode, archive as out/rounds/rNN-silent.mp4
# Length comes from shots.json (last f_out), so a 15 s Short = 450 frames. Override: FRAMES=450 ./go.sh r1
. "$(dirname "$0")/env.sh"; cd "$HERE"
R=${1:?usage: ./go.sh rNN}; export NATIVE=1
N=${FRAMES:-$(python -c "import json;print(max(s['f_out'] for s in json.load(open('shots.json'))))")}
rm -rf render; mkdir -p render out/rounds; date +%s > render/start.txt
A=$(( N/3 )); B=$(( 2*N/3 ))
for r in "0 $A" "$A $B" "$B $N"; do set -- $r; ./render.sh $1 $2 & done; wait
[ -e render/f$(printf %04d $((N-1))).png ] || { echo "RENDER FAILED: last frame missing. See render/log_*.txt"; tail -5 render/log_*.txt; exit 1; }
ffmpeg -loglevel error -y -framerate 30 -i render/f%04d.png -c:v libx264 -crf 16 -pix_fmt yuv420p out/short-v3-silent.mp4
[ -e out/rounds/$R-silent.mp4 ] || cp out/short-v3-silent.mp4 out/rounds/$R-silent.mp4
ffmpeg -loglevel error -y -i out/short-v3-silent.mp4 -vf "fps=1/2,scale=216:-1,tile=10x3" -frames:v 1 out/contact.png
echo done $(( $(date +%s) - $(cat render/start.txt) ))s, $N frames
