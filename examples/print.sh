#!/bin/bash
OUT=${1%*.c}.wasm
./build.sh $1 && python ../print.py $OUT "${@:2}"
