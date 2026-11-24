// A page of score cards to scan from a screen: each card's QR code, linking to a given player.
//
//     node scripts/qr-page.mjs https://ijc8.me/s/ "Return True=examples/return-true.wasm" ... > cards.html
//
// The links are in the player's current form (see cardURL in src/card.ts): scheme and host in
// capitals, the program after "#". A card too big for a QR code at that address is reported.
import { readFileSync } from "fs"
import QRCode from "qrcode"

const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:"
function encodeBlob(bytes) {
    let zeros = 0
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++
    let num = 0n
    for (const byte of bytes.subarray(zeros)) num = num << 8n | BigInt(byte)
    let out = ""
    while (num) {
        out = chars[Number(num % 43n)] + out
        num /= 43n
    }
    return "0".repeat(zeros) + out
}

const [player, ...cards] = process.argv.slice(2)
if (!player || !cards.length) {
    console.error("usage: node scripts/qr-page.mjs <player URL> <title>=<card.wasm>...")
    process.exit(1)
}
const url = new URL(player)
const base = `${url.origin.toUpperCase()}${url.pathname}#`
const escape = text => text.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)

let html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>cards</title>
<body style="font-family:sans-serif;background:#fff">\n`
for (const card of cards) {
    const [title, path] = card.split("=")
    const binary = readFileSync(path)
    const link = base + encodeBlob(binary)
    let qr
    try {
        qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "L", margin: 2, scale: 4 })
    } catch {
        console.error(`${title}: ${binary.length} bytes is too big for a QR code at ${player}`)
        process.exit(1)
    }
    html += `<div style="display:inline-block;margin:20px;text-align:center"><h2><a href="${escape(link)}">${escape(title)}</a> · ${binary.length} B</h2>`
        + `<img style="width:560px;max-width:95vw;image-rendering:pixelated" src="${qr}"></div>\n`
}
process.stdout.write(html)
