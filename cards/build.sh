#!/bin/sh
# Build a card without emscripten: zig (clang) -> wasm-ld -> binaryen wasm-opt.
# Cards here export the short names (p/s/d/m) directly, so no rename pass is needed.
# usage: ./build.sh foo.c   ->  foo.wasm   (needs `npm i` in tools/ for binaryen)
set -e
HERE=$(dirname "$(realpath "$0")")
BIN=${BINARYEN_BIN:-$HERE/tools/node_modules/.bin}
SRC=$1; OUT=${SRC%.c}.wasm; OBJ=${SRC%.c}.o
FEAT="--enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals"
EXPORTS="--export=p"
grep -q '^void s(' "$SRC" && EXPORTS="$EXPORTS --export=s"
grep -q '^char d\[' "$SRC" && EXPORTS="$EXPORTS --export=d --export-memory=m"
zig cc -target wasm32-freestanding -mcpu=mvp+bulk_memory+nontrapping_fptoint+sign_ext+mutable_globals \
    -Oz -ffast-math -fno-builtin -nostdlib -Wall -Wno-unused-function $CFLAGS -c -o "$OBJ" "$SRC"
zig wasm-ld --no-entry $EXPORTS --strip-all -z stack-size=0 --global-base=${GLOBAL_BASE:-4} \
    --initial-memory=${MEMORY:-1048576} -o "$OUT" "$OBJ"
rm -f "$OBJ"
echo "Before wasm-opt: $(wc -c < "$OUT")"
"$BIN/wasm-opt" $FEAT -Oz --converge "$OUT" -o "$OUT"
echo "After wasm-opt: $(wc -c < "$OUT")"
