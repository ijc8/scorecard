#!/bin/sh
OUT=${1%.c}.wasm
emcc -Oz $1 -Wall --no-entry -sSUPPORT_ERRNO=0 -sSUPPORT_LONGJMP=0 -sEXPORTED_FUNCTIONS=_process -o $OUT &&
echo Before stripping: $(stat -c%s $OUT) &&
wasm-dis $OUT | grep -v 'export "stack.*\|_initialize\|__indirect_function_table"' | wat2wasm - -o /dev/stdout | wasm-opt -Oz -o /dev/stdout | wasm-opt -Oz -o $OUT &&
echo After stripping: $(stat -c%s $OUT)
