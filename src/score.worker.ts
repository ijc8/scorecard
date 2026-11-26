// Works out a card's score (see Score.tsx): runs the card ahead of time, in silence, and sends
// back how loud each band of pitch is in each column of time.
import { COLUMN, FRAME, ROWS, rowBins } from "./score"

interface Request { id: number, binary: Uint8Array, seed: number, from: number, columns: number }

// The card that's being run, and how far it has got (in samples), to carry on from if asked for the next page.
let running: { binary: Uint8Array, seed: number, at: number, process: (x: number) => number } | null = null
let latest = 0

// Set a card up as the player does, as far as the card that ends up playing (see generate.ts).
function start(binary: Uint8Array, seed: number) {
    for (;;) {
        const { exports } = new WebAssembly.Instance(new WebAssembly.Module(binary as BufferSource))
        const next = ((exports.s ?? exports.setup) as ((seed: number) => unknown) | undefined)?.(seed)
        if (typeof next !== "number" || next === 0) return (exports.p ?? exports.process) as (x: number) => number
        const memory = ((exports.m ?? exports.memory) as WebAssembly.Memory).buffer
        const length = new DataView(memory).getUint32(next >>> 0, true)
        binary = new Uint8Array(memory.slice((next >>> 0) + 4, (next >>> 0) + 4 + length))
    }
}

// In-place radix-2 FFT.
function fft(re: Float32Array, im: Float32Array) {
    const n = re.length
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1
        for (; j & bit; bit >>= 1) j ^= bit
        j ^= bit
        if (i < j) {
            let t = re[i]; re[i] = re[j]; re[j] = t
            t = im[i]; im[i] = im[j]; im[j] = t
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const angle = -2 * Math.PI / len
        for (let k = 0; k < len / 2; k++) {
            const wr = Math.cos(angle * k), wi = Math.sin(angle * k)
            for (let a = k; a < n; a += len) {
                const b = a + len / 2
                const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr
                re[b] = re[a] - xr; im[b] = im[a] - xi
                re[a] += xr; im[a] += xi
            }
        }
    }
}

const window = Float32Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FRAME))
const bins = rowBins()
// (Between pieces of work, see whether something else has been asked for.)
const breathe = () => new Promise(resolve => setTimeout(resolve))

self.onmessage = async (e: MessageEvent<Request>) => {
    const { id, binary, seed, from, columns } = e.data
    latest = id
    try {
        if (!running || running.binary !== binary || running.seed !== seed || running.at > from) {
            running = null
            running = { binary, seed, at: 0, process: start(binary, seed) }
        }
        const card = running
        // Get to where the page starts, a few seconds of the card at a time.
        while (card.at < from) {
            const n = Math.min(from - card.at, 44100 * 4)
            for (let i = 0; i < n; i++) card.process(0)
            card.at += n
            self.postMessage({ id, skipped: card.at / from })
            await breathe()
            if (latest !== id) return
        }
        const samples = new Float32Array(COLUMN), re = new Float32Array(FRAME), im = new Float32Array(FRAME), power = new Float32Array(FRAME / 2)
        for (let column = 0; column < columns; column++) {
            for (let i = 0; i < COLUMN; i++) samples[i] = card.process(0)
            card.at += COLUMN
            // The loudest each band gets, over four looks at this stretch of time.
            power.fill(0)
            for (let look = 0; look < 4; look++) {
                const start = Math.floor(look * (COLUMN - FRAME) / 3)
                for (let i = 0; i < FRAME; i++) {
                    re[i] = samples[start + i] * window[i]
                    im[i] = 0
                }
                fft(re, im)
                for (let i = 0; i < FRAME / 2; i++) power[i] = Math.max(power[i], re[i] * re[i] + im[i] * im[i])
            }
            const levels = new Uint8Array(ROWS)
            for (let row = 0; row < ROWS; row++) {
                let most = 0
                for (let bin = bins[row]; bin < Math.max(bins[row + 1], bins[row] + 1); bin++) most = Math.max(most, power[bin])
                // In decibels below full scale (a sine as loud as can be), from -60 (0) up to -6 (255).
                const decibels = 10 * Math.log10(most / (FRAME / 4) ** 2 + 1e-12)
                levels[row] = Math.max(0, Math.min(255, Math.round((decibels + 60) / 54 * 255)))
            }
            self.postMessage({ id, column, levels })
            if (column % 8 === 7) {
                await breathe()
                if (latest !== id) return
            }
        }
        self.postMessage({ id, done: true })
    } catch (error: any) {
        running = null
        self.postMessage({ id, error: String(error?.message ?? error) })
    }
}
