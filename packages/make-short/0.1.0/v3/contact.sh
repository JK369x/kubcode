#!/bin/bash
# contact.sh A B -> gate/contact_A.png : shots with index A..B (1-based), 6 columns
. "$(dirname "$0")/env.sh"; cd "$HERE/gate"; L=contact_list.txt
ls s[0-9][0-9].png | sed -n "$1,$2p" > $L
args=(); for f in $(cat $L); do args+=(-i $f); done
n=$(wc -l < $L)
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "$(for i in $(seq 0 $((n-1))); do echo -n "[$i]scale=300:-1,drawtext=text='$(sed -n "$((i+1))p" $L | cut -c1-3)':x=6:y=6:fontsize=22:fontcolor=yellow:box=1[v$i];"; done)$(for i in $(seq 0 $((n-1))); do echo -n "[v$i]"; done)xstack=inputs=$n:layout=$(for i in $(seq 0 $((n-1))); do echo -n "$(( (i%6)*300 ))_$(( (i/6)*533 ))|"; done | sed 's/|$//')" contact_$1.png
