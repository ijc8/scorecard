# Decode a card QR PNG with zxing-cpp and check it round-trips to the .wasm bytes.
# usage: uv run --with zxing-cpp --with pillow python qrcheck.py card.png card.wasm
import sys, zxingcpp
from PIL import Image
chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:"
res = zxingcpp.read_barcodes(Image.open(sys.argv[1]))
assert res, "no QR found"
url = res[0].text
blob = url.split("c=")[1]
seed = url.split("s=")[1].split("&")[0] if "s=" in url else None
off = len(blob) - len(blob.lstrip("0")); num = 0
for ch in blob[off:]: num = num * 43 + chars.index(ch)
data = b"\0" * off + num.to_bytes((num.bit_length() + 7) // 8, "big")
want = open(sys.argv[2], "rb").read()
print(f"seed param {seed}; decoded {len(url)} chars, version {res[0].symbol_version if hasattr(res[0],'symbol_version') else '?'}, ec {getattr(res[0],'ec_level','?')}; payload {len(data)} B; matches wasm: {data == want}")
