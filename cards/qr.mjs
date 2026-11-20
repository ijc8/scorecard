// Encode a card exactly as src/App.tsx does (base43 into ?c=, qrcode lib, EC level L) and report whether it fits.
// usage: node qr.mjs card.wasm [out.png] [prefix=https://ijc8.me/s]
import fs from "fs"
import QRCode from "qrcode"
const [file, png, prefix = "https://ijc8.me/s"] = process.argv.slice(2)
const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:"
function encodeBlob(data) {
    let offset = data.findIndex(x => x !== 0); if (offset === -1) offset = data.length
    let num = 0n
    for (const x of data.subarray(offset)) num = (num << 8n) | BigInt(x)
    const out = []
    while (num) { out.unshift(chars[Number(num % 43n)]); num /= 43n }
    return chars[0].repeat(offset) + out.join("")
}
const binary = new Uint8Array(fs.readFileSync(file))
const url = `${prefix}?c=${encodeBlob(binary)}`
try {
    const qr = QRCode.create(url, { errorCorrectionLevel: "L" })
    console.log(`${file}: ${binary.length} bytes wasm, URL ${url.length} chars, QR version ${qr.version}-L (${qr.modules.size}x${qr.modules.size}) FITS`)
    if (png) await QRCode.toFile(png, url, { errorCorrectionLevel: "L", scale: 4, margin: 4 })
    fs.writeFileSync(file.replace(/\.wasm$/, ".url"), url + "\n")
} catch (err) {
    console.log(`${file}: ${binary.length} bytes wasm, URL ${url.length} chars: DOES NOT FIT (${err.message})`)
    process.exit(1)
}
