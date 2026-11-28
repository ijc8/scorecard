// Works out a card's score (see Score.tsx): runs the card ahead of time, in silence, and sends
// back how loud each band of pitch is in each column of time, as far ahead as it's asked to go.
import { COLUMN, FRAME, ROWS, rowBins } from "./score"

// Start (or carry on) a card from column `from`, as far as `upTo`; or just go on further with the same one.
interface Request { id: number, binary?: Uint8Array, seed?: number, from?: number, upTo: number }

// The card that's being run, and how far it has got (in samples).
let running: { binary: Uint8Array, seed: number, at: number, process: (x: number) => number } | null = null
let job = { id: 0, next: 0, upTo: 0, busy: false }

// Set a card up as the player does.
function start(binary: Uint8Array, seed: number) {
    const { exports } = new WebAssembly.Instance(new WebAssembly.Module(binary as BufferSource))
    ;((exports.s ?? exports.setup) as ((seed: number) => void) | undefined)?.(seed)
    return (exports.p ?? exports.process) as (x: number) => number
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
const samples = new Float32Array(COLUMN), re = new Float32Array(FRAME), im = new Float32Array(FRAME)
// (Between pieces of work, see whether something else has been asked for.)
const breathe = () => new Promise(resolve => setTimeout(resolve))

async function work() {
    if (job.busy) return
    job.busy = true
    const mine = job, card = running!
    try {
        // Get to where this starts, a few seconds of the card at a time.
        while (card.at < mine.next * COLUMN) {
            const n = Math.min(mine.next * COLUMN - card.at, 44100 * 4)
            for (let i = 0; i < n; i++) card.process(0)
            card.at += n
            self.postMessage({ id: mine.id, skipping: true })
            await breathe()
            if (job !== mine) return
        }
        while (mine.next < mine.upTo) {
            for (let i = 0; i < COLUMN; i++) samples[i] = card.process(0)
            card.at += COLUMN
            for (let i = 0; i < FRAME; i++) {
                re[i] = samples[i] * window[i]
                im[i] = 0
            }
            fft(re, im)
            const levels = new Uint8Array(ROWS)
            for (let row = 0; row < ROWS; row++) {
                let most = 0
                for (let bin = bins[row]; bin < Math.max(bins[row + 1], bins[row] + 1); bin++) most = Math.max(most, re[bin] * re[bin] + im[bin] * im[bin])
                // In decibels below full scale (a sine as loud as can be), from -60 (0) up to -6 (255).
                const decibels = 10 * Math.log10(most / (FRAME / 4) ** 2 + 1e-12)
                levels[row] = Math.max(0, Math.min(255, Math.round((decibels + 60) / 54 * 255)))
            }
            self.postMessage({ id: mine.id, column: mine.next++, levels })
            if (mine.next % 8 === 0) {
                await breathe()
                if (job !== mine) return
            }
        }
    } catch (error: any) {
        running = null
        self.postMessage({ id: mine.id, error: String(error?.message ?? error) })
    } finally {
        mine.busy = false
    }
}

self.onmessage = (e: MessageEvent<Request>) => {
    const { id, binary, seed, from, upTo } = e.data
    if (!binary) {
        // (Further with the same card.)
        if (id === job.id && running) {
            job.upTo = Math.max(job.upTo, upTo)
            work()
        }
        return
    }
    try {
        // (A card that hasn't got as far as this yet carries on; otherwise it starts again.)
        if (!running || running.binary !== binary || running.seed !== seed || running.at > from! * COLUMN) {
            running = null
            running = { binary, seed: seed!, at: 0, process: start(binary, seed!) }
        }
        job = { id, next: from!, upTo, busy: false }
        work()
    } catch (error: any) {
        self.postMessage({ id, error: String(error?.message ?? error) })
    }
}
