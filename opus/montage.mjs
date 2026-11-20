// node montage.mjs card.wasm out.wav secs seed1 seed2 ...: 'secs' from the start of bar 24 (full section) of each seed
import fs from "fs"
const [,, wasmPath, outPath, secs, ...seeds] = process.argv
const bin = fs.readFileSync(wasmPath), sr = 44100, all = []
for (const sd of seeds) {
  const { instance } = await WebAssembly.instantiate(bin), ex = instance.exports
  ex.s(Number(sd) >>> 0)
  const i32 = new Int32Array(ex.m.buffer), spb = i32[(16 + 16) / 4], root = i32[(16 + 36) / 4], sc = [...i32.slice(16, 23)]
  const skip = Math.round(24 * 16 * spb * 1.0)
  console.error(`seed ${sd}: bpm=${(sr * 15 / spb).toFixed(0)} root=${root} scale=${sc}`)
  for (let i = 0; i < skip; i++) ex.p()
  for (let i = 0; i < secs * sr; i++) all.push(ex.p() * (Math.min(1, i / 2000, (secs * sr - i) / 2000)))
}
const n = all.length, buf = Buffer.alloc(44 + n * 2)
buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12)
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24)
buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40)
all.forEach((x, i) => buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x * 32767))), 44 + i * 2))
fs.writeFileSync(outPath, buf)
