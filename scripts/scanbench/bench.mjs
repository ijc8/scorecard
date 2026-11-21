import fs from "fs"
import jsQR from "jsqr"
import { readBarcodes, prepareZXingModule } from "zxing-wasm/reader"
import * as ZX from "@zxing/library"
const meta = JSON.parse(fs.readFileSync("clean/meta.json")), index = JSON.parse(fs.readFileSync("frames/index.json"))
const hints = new Map([[ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.QR_CODE]], [ZX.DecodeHintType.TRY_HARDER, true]])
const decoders = {
  async jsqr(rgba, w, h) { return jsQR(rgba, w, h)?.data },
  async zxingjs(rgba, w, h, gray) {
    try { const r = new ZX.MultiFormatReader(); return r.decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(gray, w, h))), hints).getText() } catch { return undefined }
  },
  async zxingwasm(rgba, w, h) {
    const r = await readBarcodes({ data: rgba, width: w, height: h, colorSpace: "srgb" }, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 1 })
    return r[0]?.text
  },
}
const stats = {}, times = {}
for (const f of index) {
  const gray = new Uint8ClampedArray(fs.readFileSync(`frames/${f.name}.gray`))
  const rgba = new Uint8ClampedArray(f.w * f.h * 4)
  for (let i = 0; i < gray.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray[i]; rgba[i * 4 + 3] = 255 }
  for (const [name, fn] of Object.entries(decoders)) {
    const t = performance.now(); const text = await fn(rgba, f.w, f.h, gray); const dt = performance.now() - t
    const key = `${f.h}p ${f.level}`
    stats[key] ??= {}; stats[key][name] ??= [0, 0, 0]
    stats[key][name][0] += text === meta[f.card].url; stats[key][name][1]++; stats[key][name][2] += dt
    if (text && text !== meta[f.card].url) console.log("MISREAD", name, f.name)
  }
}
for (const [k, v] of Object.entries(stats)) console.log(k.padEnd(14), Object.entries(v).map(([n, [ok, tot, ms]]) => `${n}: ${ok}/${tot} (${(ms / tot).toFixed(0)}ms)`).join("   "))
