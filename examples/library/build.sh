#!/bin/sh
# Builds every card in the library, then regenerates the index used by the player's Library tab.
cd "$(dirname "$0")" &&
for f in *.c; do
    echo "$f:" && ../build.sh "$f" || exit 1
done &&
python3 index.py > ../../src/library.json
