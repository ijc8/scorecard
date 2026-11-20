#!/bin/sh
# Rebuild the cards and refresh the deliverables folder (renders, QR codes, checks).
set -e
D=${D:-$HOME/projects/assistant/vault/assistant/notes/overnight-2026-11-20/scorecard-opus}
mkdir -p out $D/runners-up
for c in radio guitar choir; do ./build.sh $c.c | tail -1; node qr.mjs $c.wasm out/${c}_qr.png; uv run -q --with zxing-cpp --with pillow python qrcheck.py out/${c}_qr.png $c.wasm; done
node render.mjs radio.wasm out/s46.wav 210 46
ffmpeg -loglevel error -y -i out/s46.wav -t 60 -af "afade=t=out:st=58:d=2" -c:a libvorbis -q:a 6 $D/radio_seed46_first60s.ogg
ffmpeg -loglevel error -y -ss 87 -t 60 -i out/s46.wav -af "afade=t=in:d=1,afade=t=out:st=58:d=2" -c:a libvorbis -q:a 6 $D/radio_seed46_build_drop60s.ogg
ffmpeg -loglevel error -y -ss 140 -t 60 -i out/s46.wav -c:a libvorbis -q:a 6 $D/radio_seed46_song_change60s.ogg
ffmpeg -loglevel error -y -i out/s46.wav -lavfi "showspectrumpic=s=1600x500:scale=log:fscale=log:legend=1" $D/radio_seed46_spectrogram.png
node render.mjs guitar.wasm out/g7.wav 60 7 && ffmpeg -loglevel error -y -i out/g7.wav -c:a libvorbis -q:a 6 $D/runners-up/guitar_seed7_60s.ogg
node render.mjs choir.wasm out/c42.wav 45 42 && ffmpeg -loglevel error -y -i out/c42.wav -c:a libvorbis -q:a 6 $D/runners-up/choir_seed42_45s.ogg
cp radio.c radio.wasm out/radio_qr.png out/radio_qr.url $D/
cp guitar.c guitar.wasm out/guitar_qr.png out/guitar_qr.url choir.c choir.wasm $D/runners-up/
ls -la $D $D/runners-up
