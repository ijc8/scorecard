#!/bin/sh
# Build a C score card: zig cc (wasm32-freestanding, -Oz) + binaryen wasm-opt.
# Mirrors examples/strip.sh: functions get short names via export_name, the title
# global is exported as d, and memory is renamed to m.
set -e
WASMOPT=${WASMOPT:-$HOME/.cache/.wasm-pack/wasm-opt-1ceaaea8b7b5f7e0/bin/wasm-opt}
SRC=$1; OUT=${SRC%.c}.wasm; T=${OUT}.tmp
shift
zig cc -c --target=wasm32-freestanding -Oz -fno-unroll-loops -mnontrapping-fptoint "$@" $SRC -o $T.o
EXP=""; grep -q '^char d\[\]' $SRC && EXP=--export=d
zig build-lib -dynamic -target wasm32-freestanding -O ReleaseSmall -rdynamic -fstrip \
  --global-base=${GBASE:-2048} --stack 8192 --initial-memory=${MEM:-524288} $EXP $T.o -femit-bin=$T.wasm 2>&1 | grep -v "no output file" || true
echo "zig: $(wc -c < $T.wasm)"
$WASMOPT -all --print $T.wasm 2>/dev/null | sed 's/(export "memory"/(export "m"/' > $T.wat
$WASMOPT -all -Oz --converge $T.wat -o $OUT
rm -f $T.o $T.wasm $T.wat
echo "$OUT: $(wc -c < $OUT) bytes"
