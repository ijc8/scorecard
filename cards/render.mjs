// Offline renderer: plays a card the way public/worklet.js does (s(seed) once, then p() per sample).
// usage: node render.mjs card.wasm out.wav [seconds=60] [seed=1] [startSeconds=0]
import fs from "fs"
const [file, out, secs = "60", seedArg = "1", start = "0"] = process.argv.slice(2)
const sr = 44100
const { instance } = await WebAssembly.instantiate(fs.readFileSync(file))
const e = instance.exports
const setup = e.s ?? e.setup, proc = e.p ?? e.process
if (setup) setup(Number(seedArg) >>> 0)
const skip = Math.round(Number(start) * sr), n = Math.round(Number(secs) * sr)
for (let i = 0; i < skip; i++) proc()
const x = new Float32Array(n)
const t0 = performance.now()
for (let i = 0; i < n; i++) x[i] = proc()
const elapsed = (performance.now() - t0) / 1000
let peak = 0, bad = 0, clipped = 0, sum = 0
const win = sr * 5, rms = []
for (let w = 0; w < n; w += win) {
    let s2 = 0, m = Math.min(n, w + win)
    for (let i = w; i < m; i++) s2 += x[i] * x[i]
    rms.push(Math.sqrt(s2 / (m - w)).toFixed(3))
}
for (let i = 0; i < n; i++) {
    const v = x[i]
    if (!Number.isFinite(v)) { bad++; continue }
    if (Math.abs(v) > peak) peak = Math.abs(v)
    if (Math.abs(v) > 1) clipped++
    sum += v
}
console.log(`${file} seed=${seedArg}: peak ${peak.toFixed(3)}, clipped ${clipped}, non-finite ${bad}, DC ${(sum / n).toFixed(4)}, ${(n / sr / elapsed).toFixed(0)}x realtime`)
console.log(`rms per 5s: ${rms.join(" ")}`)
if (out && out !== "-") {
    const buf = Buffer.alloc(44 + n * 2)
    buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8)
    buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
    buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
    buf.write("data", 36); buf.writeUInt32LE(n * 2, 40)
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] || 0)) * 32767), 44 + i * 2)
    fs.writeFileSync(out, buf)
}
