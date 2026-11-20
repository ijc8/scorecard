#!/bin/sh
# Debug aid: build each stem solo (via -DSOLO=<expr>) and print its level. usage: ./stems.sh card.c [seconds] [seed]
for st in pad bass drums lead "pluck*.7f" "sum*.2f" x; do
    CFLAGS="-DSOLO=$st" ./build.sh $1 >/dev/null; echo "== $st"; node render.mjs ${1%.c}.wasm - ${2:-60} ${3:-1} | sed 's/.*seed=[0-9]*: //'
done
./build.sh $1
