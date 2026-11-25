// A page for testing which link forms a phone's camera app passes on whole: the same cards as
// "#program" (the current form) and as "?c=program" (the form on printed cards), at several sizes.
//
//     node scripts/link-test-page.mjs https://ijc8.me/s/ "Small=a.wasm" "Full=b.wasm" ... > links.html
//
// Scan each code with the camera app and open the link: if the card appears with its title, the
// link arrived whole (a cut-off program doesn't load).
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
    console.error("usage: node scripts/link-test-page.mjs <player URL> <title>=<card.wasm>...")
    process.exit(1)
}
const url = new URL(player)
const forms = [
    // As cardURL in src/card.ts writes it.
    ["#", code => `${url.origin.toUpperCase()}${url.pathname}#${code}`],
    // As the player on main (and print.py) writes it.
    ["?c=", code => `${url.origin}${url.pathname.replace(/\/$/, "")}?c=${code}`],
]
const escape = text => text.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)

let html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>link forms</title>
<body style="font-family:sans-serif;background:#fff">
<p style="max-width:40em;margin:20px">Scan each code with the camera app and open the link. If the card appears with its
title, the link arrived whole. Left column: the new form (program after #). Right column: the form on printed cards (?c=).</p>\n`
let row = 0
for (const card of cards) {
    const [title, path] = card.split("=")
    const binary = readFileSync(path)
    row++
    html += `<div style="white-space:nowrap">`
    for (const [name, make] of forms) {
        const link = make(encodeBlob(binary))
        let qr, version
        try {
            version = QRCode.create(link, { errorCorrectionLevel: "L" }).version
            qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "L", margin: 2, scale: 4 })
        } catch {
            html += `<div style="display:inline-block;margin:20px;width:560px;text-align:center"><h2>${row}${name === "#" ? "a" : "b"}. ${escape(title)} as ${escape(name)}: too big for a QR code</h2></div>`
            continue
        }
        html += `<div style="display:inline-block;margin:20px;text-align:center"><h2>${row}${name === "#" ? "a" : "b"}. <a href="${escape(link)}">${escape(title)}</a> as ${escape(name)}</h2>`
            + `<p>${binary.length} B · link ${link.length} characters · QR version ${version}</p>`
            + `<img style="width:560px;max-width:95vw;image-rendering:pixelated" src="${qr}"></div>`
    }
    html += `</div>\n`
}
process.stdout.write(html)
