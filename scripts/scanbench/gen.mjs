// Render clean QR PNGs for every library card (as served from the deployed player).
import QRCode from "qrcode"; import fs from "fs"
const lib = JSON.parse(fs.readFileSync(new URL("../../src/library.json", import.meta.url)))
fs.mkdirSync("clean", { recursive: true })
const meta = []
for (const [i, c] of lib.entries()) {
  const url = `https://ijc8.me/s?c=${c.code}`
  await QRCode.toFile(`clean/${i}.png`, url, { errorCorrectionLevel: "L", scale: 8, margin: 4 })
  meta.push({ i, title: c.title, url, version: QRCode.create(url, { errorCorrectionLevel: "L" }).version })
}
fs.writeFileSync("clean/meta.json", JSON.stringify(meta))
console.log(meta.map(m => `${m.title}: v${m.version}`).join(", "))
