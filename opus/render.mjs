// Offline render: node render.mjs card.wasm out.wav [seconds] [seed]
import fs from "fs"
const [,, wasmPath, outPath, secs = "60", seedArg] = process.argv
const bin = fs.readFileSync(wasmPath)
const { instance } = await WebAssembly.instantiate(bin)
const ex = instance.exports
const p = ex.p ?? ex.process, s = ex.s ?? ex.setup
const seed = seedArg !== undefined ? Number(seedArg) >>> 0 : (Math.random() * 2 ** 32) >>> 0
if (s) s(seed)
// SOLO=k: silence every instrument but k (debug; INST_OFF = byte offset of inst[][] in State, NP fields, GAIN/SEND idx)
if (process.env.SOLO !== undefined) {
  const f = new Float32Array((ex.m ?? ex.memory).buffer), off = Number(process.env.INST_OFF ?? 716) / 4, np = 15
  for (let i = 0; i < 9; i++) if (i !== Number(process.env.SOLO)) f[off + i * np + 9] = f[off + i * np + 10] = 0
}
const d = ex.d ?? ex.title
if (d && (ex.m ?? ex.memory)) {
  const mem = new Uint8Array((ex.m ?? ex.memory).buffer), a = d.value; let e = a
  while (mem[e]) e++
  console.error("title:", new TextDecoder().decode(mem.subarray(a, e)))
}
const sr = 44100, n = Math.round(Number(secs) * sr)
const buf = Buffer.alloc(44 + n * 2)
let peak = 0, sumsq = 0, clip = 0, nan = 0
const t0 = performance.now()
for (let i = 0; i < n; i++) {
  let x = p()
  if (!Number.isFinite(x)) { nan++; x = 0 }
  const a = Math.abs(x); if (a > peak) peak = a; if (a > 1) clip++
  sumsq += x * x
  buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x * 32767))), 44 + i * 2)
}
const ms = performance.now() - t0
buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12)
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24)
buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40)
fs.writeFileSync(outPath, buf)
console.error(`seed=${seed.toString(16)} peak=${peak.toFixed(3)} rms=${Math.sqrt(sumsq / n).toFixed(3)} clipped=${clip} nan=${nan} realtime=${(secs * 1000 / ms).toFixed(1)}x`)
