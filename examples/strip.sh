#!/bin/sh
echo Before stripping: $(wc -c < $1) &&
# TODO: This is a hacky way to remove/rename specific exports.
wasm-dis -all $1 |
    grep -v '^ *(export "stack.*\|_initialize\|__indirect_function_table"' | # Emscripten exports
    grep -v '^ *(export "__data_end\|__heap_base"' | # Rust exports
    sed 's/^ *(export "memory"/(export "m"/' | # Rename memory -> m
    # Legacy renaming:
    sed 's/^ *(export "title"/(export "d"/' | # Rename title -> d
    sed 's/^ *(export "setup"/(export "s"/' | # Rename setup -> s
    sed 's/^ *(export "process"/(export "p"/' | # Rename process -> p
    wasm-as -all - -o /dev/stdout |
    wasm-opt -all -Oz -o /dev/stdout |
    wasm-opt -all -Oz -o $1 &&
echo After stripping: $(wc -c < $1)
