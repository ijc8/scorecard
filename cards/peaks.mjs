// Print the strongest spectral peaks (with note names) in a window of a 16-bit mono WAV.
// usage: node peaks.mjs file.wav startSeconds [windowSeconds=0.37] [count=12]
import fs from "fs"
const [file, start = "0", dur = "0.37", count = "12"] = process.argv.slice(2)
const buf = fs.readFileSync(file), sr = buf.readUInt32LE(24)
const N = 1 << Math.round(Math.log2(Number(dur) * sr)), off = 44 + 2 * Math.round(Number(start) * sr)
const re = new Float64Array(N), im = new Float64Array(N)
for (let i = 0; i < N; i++) re[i] = (off + 2 * i + 1 < buf.length ? buf.readInt16LE(off + 2 * i) / 32768 : 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))
for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]] } }
for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len
    for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(ang * k), s = Math.sin(ang * k), a = i + k, b = a + len / 2
        const xr = re[b] * c - im[b] * s, xi = re[b] * s + im[b] * c
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi
    }
}
const mag = new Float64Array(N / 2)
for (let i = 0; i < N / 2; i++) mag[i] = Math.hypot(re[i], im[i]) * 4 / N
const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const pk = []
for (let i = 2; i < N / 2 - 1; i++) if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > 1e-4) {
    const d = 0.5 * (mag[i - 1] - mag[i + 1]) / (mag[i - 1] - 2 * mag[i] + mag[i + 1])
    pk.push([(i + d) * sr / N, mag[i]])
}
pk.sort((a, b) => b[1] - a[1])
console.log(pk.slice(0, Number(count)).sort((a, b) => a[0] - b[0]).map(([f, m]) => {
    const n = 69 + 12 * Math.log2(f / 440), r = Math.round(n)
    return `${f.toFixed(0)}Hz ${names[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}${n - r >= 0 ? "+" : ""}${Math.round((n - r) * 100)}c ${(20 * Math.log10(m)).toFixed(0)}dB`
}).join("\n"))
