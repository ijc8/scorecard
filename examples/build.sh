#!/bin/sh
OUT=${1%.c}.wasm
emcc -Oz -Wall --no-entry -sSUPPORT_ERRNO=0 -sSUPPORT_LONGJMP=0 -sEXPORTED_FUNCTIONS=_process -o $OUT $@ &&
echo Before stripping: $(stat -c%s $OUT) &&
wasm2wat $OUT | grep -v 'export "stack.*\|_initialize\|__indirect_function_table"' | wat2wasm - -o /dev/stdout | wasm-opt -all -Oz -o /dev/stdout | wasm-opt -all -Oz -o $OUT &&
echo After stripping: $(stat -c%s $OUT)
