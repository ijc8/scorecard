#!/bin/sh
# Build a card without emscripten: zig (clang) -> wasm-ld -> binaryen wasm-opt.
# Cards here export the short names (p/s/d/m) directly, so no rename pass is needed.
# usage: ./build.sh foo.c   ->  foo.wasm   (needs `npm i` in tools/ for binaryen)
set -e
HERE=$(dirname "$(realpath "$0")")
BIN=${BINARYEN_BIN:-$HERE/tools/node_modules/.bin}
SRC=$1; OUT=${SRC%.c}.wasm; OBJ=${SRC%.c}.o
FEAT="--enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals"
EXPORTS="--export=p"
grep -q '^void s(' "$SRC" && EXPORTS="$EXPORTS --export=s"
grep -q '^char d\[' "$SRC" && EXPORTS="$EXPORTS --export=d --export-memory=m"
zig cc -target wasm32-freestanding -mcpu=mvp+nontrapping_fptoint+sign_ext+mutable_globals \
    -Oz -ffast-math -fno-builtin -nostdlib -Wall -Wno-unused-function $CFLAGS -c -o "$OBJ" "$SRC"
zig wasm-ld --no-entry $EXPORTS --strip-all -z stack-size=0 --global-base=${GLOBAL_BASE:-4} \
    --initial-memory=${MEMORY:-1048576} -Map="$OUT.map" -o "$OUT" "$OBJ"
rm -f "$OBJ"
echo "Linked: $(wc -c < "$OUT")"
"$BIN/wasm-opt" $FEAT -Oz --converge "$OUT" -o "$OUT"
echo "After wasm-opt: $(wc -c < "$OUT")"
# Size pass: scalars in linear memory -> wasm globals (see globalize.py), then optimise again.
# (GLOBALIZE=0 skips it, to check that the output is sample-identical.)
if [ "${GLOBALIZE:-1}" = 1 ]; then
"$BIN/wasm-dis" $FEAT "$OUT" -o "$OUT.wat"
python3 "$HERE/globalize.py" "$OUT.wat" "$OUT.map" "$OUT.g.wat"
"$BIN/wasm-as" $FEAT "$OUT.g.wat" -o "$OUT"
"$BIN/wasm-opt" $FEAT -Oz --converge "$OUT" -o "$OUT"
echo "After globalize: $(wc -c < "$OUT")"
fi
rm -f "$OUT.map" "$OUT.wat" "$OUT.g.wat"
