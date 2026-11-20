#!/usr/bin/env python3
"""Independent check of a card's QR code: decode the PNG with ZXing (not the library that made it),
base43-decode the ?c= payload and compare it byte-for-byte with the .wasm.
usage: verify-qr.py card.png card.wasm   (needs zxing-cpp and pillow)"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from base43 import decode
import zxingcpp
from PIL import Image

png, wasm = sys.argv[1:3]
results = zxingcpp.read_barcodes(Image.open(png))
assert len(results) == 1, "expected exactly one QR code, got %d" % len(results)
url = results[0].text
payload = url.split("c=", 1)[1].encode()
ok = decode(payload) == open(wasm, "rb").read()
print("%s: decoded %d-char URL (%s...), payload %s the %d-byte wasm" % (
    png, len(url), url[:24], "MATCHES" if ok else "DOES NOT MATCH", os.path.getsize(wasm)))
sys.exit(0 if ok else 1)
