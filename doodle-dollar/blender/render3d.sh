#!/bin/bash
cd "$(dirname "$0")"
mkdir -p logs logs3d frames frames3d
TOTAL=15240; N=4; CH=$(( (TOTAL + N - 1) / N ))
for i in $(seq 0 $((N-1))); do
  S=$(( i*CH + 1 )); E=$(( (i+1)*CH )); [ $E -gt $TOTAL ] && E=$TOTAL
  xvfb-run -a -s "-screen 0 1920x1080x24" blender -b --python build.py -- 1920 1080 2 $S $E frames3d --3d > logs3d/w$i.log 2>&1 &
done
wait
echo ALLDONE
