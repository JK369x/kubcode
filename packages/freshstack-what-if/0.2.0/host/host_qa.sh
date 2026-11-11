#!/bin/sh
# Host QA on a finished MP4: stream format, duration vs timing, loudness, and a 4x3 contact sheet.
# Usage: sh host_qa.sh <slug> [path/to/episode.mp4]   (default: $WHATIF_WORK/deliverables/<slug>.mp4)
set -eu
H=$(cd "$(dirname "$0")" && pwd)
SLUG=$1
PY=${PYTHON:-python3}
STUDIO=$("$PY" -c "import sys;sys.path.insert(0,'$H');from host_lib import studio_dir;print(studio_dir())")
WORK=$("$PY" -c "import sys;sys.path.insert(0,'$H');from host_lib import work_dir;print(work_dir())")
MP4=${2:-$WORK/deliverables/$SLUG.mp4}
QA=$WORK/deliverables/qa-$SLUG
mkdir -p "$QA"
echo "== streams"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,sample_rate,channels -show_entries format=duration -of compact "$MP4"
echo "== expected seconds"
"$PY" -c "import json;t=json.load(open('$STUDIO/src/episodes/$SLUG/timing.json',encoding='utf-8'));print(round(t['total']/30,2))"
echo "== loudness"
ffmpeg -hide_banner -nostats -i "$MP4" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|LRA|Peak):" | tail -3
echo "== full decode"
ffmpeg -hide_banner -v error -i "$MP4" -f null - && echo "decode ok"
ffmpeg -hide_banner -v error -y -i "$MP4" -vf "fps=1/3,scale=270:-1,tile=4x3" -frames:v 1 "$QA/sheet.jpg"
echo "sheet $QA/sheet.jpg"
