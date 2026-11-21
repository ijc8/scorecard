# Simulate phone-camera frames of printed cards: perspective, defocus, motion blur, uneven light, noise, JPEG.
import cv2, numpy as np, json, os, sys
rng = np.random.default_rng(1)
W, H = 1280, 720   # what getUserMedia typically hands back by default-ish; also test 1920x1080
LEVELS = {
  # fill = QR side as fraction of frame height; tilt = corner jitter fraction; blur sigma px; motion px; noise sigma; jpeg q
  "easy":   dict(fill=(0.75, 0.9), tilt=0.02, blur=(0.0, 0.6), motion=0, noise=2, jpeg=90, shade=0.1),
  "medium": dict(fill=(0.55, 0.8), tilt=0.07, blur=(0.5, 1.2), motion=3, noise=5, jpeg=75, shade=0.3),
  "hard":   dict(fill=(0.4, 0.65), tilt=0.13, blur=(1.0, 1.8), motion=5, noise=8, jpeg=60, shade=0.5),
}
def frame(qr, p, W, H):
    n = qr.shape[0]
    bg = np.full((H, W), 90, np.float32) + rng.normal(0, 25, (H // 8, W // 8)).astype(np.float32).repeat(8, 0).repeat(8, 1)[:H, :W]
    side = rng.uniform(*p["fill"]) * H
    cx, cy = W / 2 + rng.uniform(-0.05, 0.05) * W, H / 2 + rng.uniform(-0.05, 0.05) * H
    ang = rng.uniform(-0.3, 0.3) if p["tilt"] > 0.05 else rng.uniform(-0.05, 0.05)
    c, s = np.cos(ang) * side / 2, np.sin(ang) * side / 2
    corners = np.array([[-1, -1], [1, -1], [1, 1], [-1, 1]], np.float32)
    dst = np.array([[cx + x * c - y * s, cy + x * s + y * c] for x, y in corners], np.float32)
    dst += rng.uniform(-p["tilt"], p["tilt"], (4, 2)).astype(np.float32) * side
    M = cv2.getPerspectiveTransform(np.array([[0, 0], [n, 0], [n, n], [0, n]], np.float32), dst)
    img = cv2.warpPerspective(qr.astype(np.float32), M, (W, H), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT, borderValue=-1)
    out = np.where(img < 0, bg, img * 0.82 + 25)  # paper isn't pure white, ink isn't pure black
    b = rng.uniform(*p["blur"])
    if b > 0: out = cv2.GaussianBlur(out, (0, 0), b)
    if p["motion"]:
        k = int(rng.integers(1, p["motion"] + 1)); kern = np.zeros((k, k), np.float32); kern[k // 2, :] = 1 / k
        R = cv2.getRotationMatrix2D((k / 2 - .5, k / 2 - .5), rng.uniform(0, 180), 1); kern = cv2.warpAffine(kern, R, (k, k)); kern /= max(kern.sum(), 1e-6)
        out = cv2.filter2D(out, -1, kern)
    gx, gy = rng.uniform(-1, 1, 2)
    xx, yy = np.meshgrid(np.linspace(-1, 1, W), np.linspace(-1, 1, H))
    out *= 1 + p["shade"] * (gx * xx + gy * yy) / 2
    out += rng.normal(0, p["noise"], out.shape)
    out = np.clip(out, 0, 255).astype(np.uint8)
    ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, p["jpeg"]])
    return cv2.imdecode(enc, cv2.IMREAD_GRAYSCALE), side
os.makedirs("frames", exist_ok=True)
index = []
for res in [(1280, 720), (1920, 1080)]:
    for level, p in LEVELS.items():
        for card in range(8):
            qr = cv2.imread(f"clean/{card}.png", cv2.IMREAD_GRAYSCALE)
            for k in range(4):
                img, side = frame(qr, p, *res)
                name = f"{res[1]}-{level}-{card}-{k}"
                img.tofile(f"frames/{name}.gray")
                if card == 0 and k == 0: cv2.imwrite(f"frames/{name}.png", img)
                index.append(dict(name=name, w=res[0], h=res[1], level=level, card=card, px_per_module=side / (qr.shape[0] / 8)))
json.dump(index, open("frames/index.json", "w"))
print(len(index), "frames")
