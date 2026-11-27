# Scanner benchmark

Compares QR decoders on synthetic "phone camera" frames of the starter-pack cards (perspective,
defocus, motion blur, uneven light, sensor noise, JPEG). This is how `zxing-wasm` was chosen for
the Scan tab; rerun it before swapping decoders, and add real photos when available.

Not part of the web build. Build the starter cards (`examples/library/build.sh`), then in a
scratch directory:

    npm install qrcode zxing-wasm jsqr @zxing/library
    pip install opencv-python-headless numpy
    node /path/to/scripts/scanbench/gen.mjs      # clean QR PNGs into clean/
    python3 /path/to/scripts/scanbench/synth.py  # distorted frames into frames/
    cp /path/to/scripts/scanbench/bench.mjs . && node bench.mjs   # decode rate and time per decoder

(`bench.mjs` is copied in so that it finds the decoders installed in the scratch directory.)

Last run (192 frames of the eight starter cards, QR versions 18 to 26), frames read and time each:

                   jsQR            ZXing (JS)      ZXing-C++ (zxing-wasm)
    720p easy      27/32  90 ms    25/32  12 ms    32/32  16 ms
    720p medium    14/32 197 ms    14/32  11 ms    31/32   7 ms
    720p hard       0/32 339 ms     0/32  12 ms    10/32   8 ms
    1080p easy     28/32 151 ms    16/32  19 ms    32/32  13 ms
    1080p medium   20/32 398 ms    17/32  25 ms    31/32  15 ms
    1080p hard      1/32 841 ms     1/32  26 ms    26/32  16 ms
