# External dependencies:
# - the famous cat printer (BLE thermal printer)
# - https://github.com/NaitLee/Cat-Printer
# - https://github.com/robhagemans/hoard-of-bitfonts/blob/master/apple/mac/Chicago_12.yaff
# - monobit, segno, wasmtime (all on PyPI)

# Hacky dance to load cat printer stuff
import sys
import os
pwd = os.getcwd()
base_dir = os.path.join(sys.path[0], "..")
cat_printer_path = os.path.join(base_dir, "Cat-Printer")
sys.path.append(cat_printer_path)
os.chdir(cat_printer_path)
import printer
os.chdir(pwd)

import numpy as np
import monobit
from monobit.renderer import render
import segno
import base43
import wasmtime

font, *_ = monobit.load(os.path.join(base_dir, "Chicago_12.yaff"))


class DummyPrinter:
    class model:
        paper_width = 384

    def _prepare(self):
        self.img = []

    def flush(self):
        import matplotlib.pyplot as plt
        plt.imshow(np.array(self.img)[::-1, ::-1])
        plt.show()

    def draw_bitmap(self, bits):
        self.img.append(np.unpackbits(bits))
    
    def unload(self):
        pass


# Printing helpers
def print_line(pixels):
    p.draw_bitmap(np.packbits(pixels))

def center(img):
    arr = np.zeros((img.shape[0], p.model.paper_width), dtype=bool)
    offset = (arr.shape[1] - img.shape[1])//2
    arr[:, offset:img.shape[1] + offset] = img
    return arr

def scale(img):
    mult = p.model.paper_width // img.shape[1]
    img = np.repeat(np.repeat(img, mult, axis=0), mult, axis=1)
    return img

def upside(img):
    return img[::-1, ::-1]

def print_image(img):
    for row in img:
        print_line(row)

def render_text(text):
    glyph_map = render(font, text)
    text_image = glyph_map.as_image()
    return np.array(text_image) > 127

def space(height):
    row = np.zeros(p.model.paper_width, dtype=bool)
    for _ in range(height):
        print_line(row)



def get_title(wasm_blob):
    store = wasmtime.Store()
    module = wasmtime.Module(store.engine, wasm_blob)
    instance = wasmtime.Instance(store, module, [])
    exports = instance.exports(store)
    title_pointer = exports.get("title")
    if not title_pointer: return
    index = title_pointer.value(store)
    memory = exports["memory"].data_ptr(store)
    title = bytearray()
    while True:
        x = memory[index]
        if x == 0: break
        title.append(x)
        index += 1
    return title.decode("utf8")


def print_scorecard(wasm_path):
    with open(wasm_path, "rb") as f:
        data = f.read()
    title = get_title(data) or "untitled"
    print("Title:", title)
    payload = base43.encode(data)
    size = len(data)
    qrcode = segno.make_qr([
        ("https://ijc8.me/s?c=", segno.consts.MODE_BYTE),
        (payload, segno.consts.MODE_ALPHANUMERIC),
    ])
    print("QR code info:", qrcode.version, qrcode.error)
    qr_img = np.array(qrcode.matrix, dtype=bool)
    p.energy = 0xffff
    p.speed = 0xff
    p._prepare()
    print_image(upside(center(scale(render_text(f"{title} | {size}")))))
    space(20)
    print(f"Original size: {qr_img.shape}, scale: {p.model.paper_width // qr_img.shape[1]}")
    print_image(upside(center(scale(qr_img))))
    space(20)
    print_image(upside(center(scale(render_text("ScoreCard")))))
    for _ in range(84):
        print_line([False] * p.model.paper_width)
    p.flush()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("filename", help="wasm file to print as scorecard")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="don't print, just show what would be printed"
    )
    args = parser.parse_args()
    if args.dry_run:
        p = DummyPrinter()
    else:
        p = printer.PrinterDriver()
        # You may need to tweak this for your own BLE thermal printer
        print(p.scan("MX05", use_result=True))

    try:
        print_scorecard(args.filename)
    finally:
        p.unload()
