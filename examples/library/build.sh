#!/bin/sh
# Builds every starter card.
cd "$(dirname "$0")" &&
for f in *.c; do
    echo "$f:" && ../build.sh "$f" || exit 1
done
