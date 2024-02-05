#!/bin/sh
OUT=${1%.c}.wasm
emcc -Oz -Wall --no-entry -sSUPPORT_ERRNO=0 -sSUPPORT_LONGJMP=0 -sEXPORTED_FUNCTIONS=_process -o $OUT $@ &&
$(dirname "$0")/strip.sh $OUT
