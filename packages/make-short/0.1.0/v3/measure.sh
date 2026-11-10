#!/bin/bash
# usage: measure.sh files...  -> SATAVG YAVG YLOW YHIGH
for f in "$@"; do echo -n "$(basename $f) "; ffmpeg -i $f -vf signalstats,metadata=print -f null - 2>&1 | grep -E "SATAVG|YAVG|YLOW|YHIGH" | sed 's/.*signalstats.//' | tr '\n' ' '; echo; done
