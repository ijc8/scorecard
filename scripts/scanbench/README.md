# Scanner benchmark

Compares QR decoders on synthetic "phone camera" frames of the starter-pack cards (perspective,
defocus, motion blur, uneven light, sensor noise, JPEG). This is how `zxing-wasm` was chosen for
the Scan tab; rerun it before swapping decoders, and add real photos when available.

Not part of the web build. In a scratch directory:

    npm install qrcode zxing-wasm jsqr @zxing/library
    pip install opencv-python-headless numpy
    node gen.mjs      # clean QR PNGs into clean/
    python3 synth.py  # distorted frames into frames/
    node bench.mjs    # decode rate and time per decoder

Run them from the scratch directory by path, e.g. `node /path/to/scripts/scanbench/gen.mjs`.
