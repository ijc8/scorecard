#!/bin/sh
OUT=${1%.c}.bin
clang $1 -Wall -lm -o $OUT &&
$(realpath $OUT) | sox -q -tf32 -r 44.1k -c1 - -d
