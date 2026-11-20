#!/bin/sh
# Print the score a card generates (native debug build). usage: ./trace.sh card.c [seed] [seconds]
OUT=${TMPDIR:-/tmp}/trace-$$
zig cc -O1 -DNATIVE -fsanitize=undefined -o $OUT $1 && $OUT $2 $3; rm -f $OUT
