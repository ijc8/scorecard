#!/bin/sh
faust -lang wast -ct 1 -cn main -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 2 main.dsp -o main.wat &&
rm main.json &&
patch main.wat main.wat.patch &&
sed -i 's/^\t(memory (export "memory")/\t(memory $memory/' main.wat &&
sed -i '/(data (i32.const 0) "{\\"name\\": \\"main\\"/d' main.wat &&
wasm-as main.wat -o main.wasm &&
rm main.wat &&
wasm-opt -Oz main.wasm -o main.wasm
