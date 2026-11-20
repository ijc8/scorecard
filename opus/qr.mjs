// node qr.mjs card.wasm out.png [prefix]  -> prints URL length, QR version (EC level L, as the player uses)
import fs from "fs"
import QRCode from "qrcode"
const [,, wasmPath, pngPath, prefix = "https://ijc8.me/s"] = process.argv
const data = new Uint8Array(fs.readFileSync(wasmPath))
// Port of src/base43Encoder.ts encodeBlob
const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:"
let off = data.findIndex(x => x !== 0); if (off === -1) off = data.length
let num = 0n; for (const x of data.subarray(off)) num = (num << 8n) | BigInt(x)
const out = []; while (num) { out.unshift(chars[Number(num % 43n)]); num /= 43n }
const url = `${prefix}?c=${chars[0].repeat(off) + out.join("")}`
const qr = QRCode.create(url, { errorCorrectionLevel: "L" })
console.log(`bytes=${data.length} url_chars=${url.length} qr_version=${qr.version} ec=L modules=${qr.modules.size}`)
if (pngPath) { await QRCode.toFile(pngPath, url, { errorCorrectionLevel: "L", scale: 4, margin: 4 }); fs.writeFileSync(pngPath.replace(/\.png$/, ".url"), url + "\n") }
