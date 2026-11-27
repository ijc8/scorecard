// Render clean QR PNGs for every starter card (as served from the deployed player).
// Build the cards first: examples/library/build.sh.
import QRCode from "qrcode"; import fs from "fs"
import { encodeBlob } from "./base43.mjs"
const dir = new URL("../../examples/library/", import.meta.url)
const lib = fs.readdirSync(dir).filter(f => f.endsWith(".wasm")).sort().map(f => ({ title: f.replace(".wasm", ""), code: encodeBlob(fs.readFileSync(new URL(f, dir))) }))
if (!lib.length) throw new Error("No built cards in examples/library: run examples/library/build.sh first.")
fs.mkdirSync("clean", { recursive: true })
const meta = []
for (const [i, c] of lib.entries()) {
  const url = `https://ijc8.me/s?c=${c.code}`
  await QRCode.toFile(`clean/${i}.png`, url, { errorCorrectionLevel: "L", scale: 8, margin: 4 })
  meta.push({ i, title: c.title, url, version: QRCode.create(url, { errorCorrectionLevel: "L" }).version })
}
fs.writeFileSync("clean/meta.json", JSON.stringify(meta))
console.log(meta.map(m => `${m.title}: v${m.version}`).join(", "))
