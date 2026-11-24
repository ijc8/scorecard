// Shows a card's QR code being read (in the pile look, when tracing is turned on), ending at the
// card's bits as the trace view draws them. The steps are the real ones, worked out in qrDecode.ts:
//   1. the function patterns (finders, timing, alignment, format) are set aside;
//   2. the mask comes off, row by row;
//   3. everything that isn't the program goes: error correction, padding, and the link's address;
//   4. the program's modules stream off in reading order, and settle as the program's bits.
// The last step is the one liberty taken: a module doesn't become one particular bit (base 43 and
// QR's alphanumeric packing lie between them), so each flies to roughly where its share of the
// program ends up, and what settles there is the true bit.
import { Decoding, Kind } from "./qrDecode"

const BLACK = 0xff000000, WHITE = 0xffffffff, LAVENDER = 0xffffcccc  // (as ABGR)
const PATTERNS = 350, UNMASK = 500, CLEAR = 350, FLIGHT = 450, STREAM = 900
export const DECODE_MS = PATTERNS + UNMASK + CLEAR + STREAM + FLIGHT

const grey = (level: number) => {
    const v = Math.round(255 * Math.min(Math.max(level, 0), 1))
    return 0xff000000 | v << 16 | v << 8 | v
}

// Run backwards it shows the program being written out as a QR code again; that goes quicker.
const REWIND = 2.2

// Plays on `canvas` (which should cover the QR code); returns a function that stops it.
export function playDecode(canvas: HTMLCanvasElement, steps: Decoding, binary: Uint8Array, done: () => void, backwards = false) {
    const { size, dark, mask, kind, progress } = steps
    // The trace view's grid of bits (see `draw` in App.tsx): the top four fifths of a square.
    const bits = binary.length * 8
    const grid = Math.ceil(Math.sqrt(bits / 0.8))
    const cell = 4, width = size * cell, landed = width / grid
    canvas.width = canvas.height = width
    const context = canvas.getContext("2d")!
    const image = context.createImageData(width, width)
    const pixels = new Uint32Array(image.data.buffer)
    const block = (x: number, y: number, side: number, colour: number) => {
        const x0 = Math.max(Math.round(x), 0), y0 = Math.max(Math.round(y), 0)
        const x1 = Math.min(Math.round(x + side), width), y1 = Math.min(Math.round(y + side), width)
        for (let py = y0; py < y1; py++) pixels.fill(colour, py * width + x0, py * width + x1)
    }
    const bitAt = (i: number) => binary[i >> 3] >> (i % 8) & 1
    const rows = size, total = size * size

    let frame = 0
    const start = performance.now()
    const draw = (now: number) => {
        const t = backwards ? DECODE_MS - (now - start) * REWIND : now - start
        pixels.fill(WHITE)
        const flying = t - PATTERNS - UNMASK - CLEAR
        if (flying > 0) {
            // The program's bits that have settled so far.
            const settled = Math.min(Math.floor((flying - FLIGHT) / STREAM * bits), bits)
            for (let i = 0; i < settled; i++) {
                if (bitAt(i)) block(i % grid * landed, Math.floor(i / grid) * landed, landed, LAVENDER)
            }
        }
        for (let at = 0; at < total; at++) {
            const row = Math.floor(at / rows), col = at % rows
            const k = kind[at]
            if (k === Kind.Function) {
                if (dark[at] && t < PATTERNS) block(col * cell, row * cell, cell, grey(t / PATTERNS))
                continue
            }
            // The mask comes off a row at a time, each module it flipped flashing as it turns back.
            const unmasking = (t - PATTERNS) / UNMASK * (rows + 12) - row
            const value = unmasking > 0 ? dark[at] ^ mask[at] : dark[at]
            if (mask[at] && unmasking > 0 && unmasking < 12) {
                block(col * cell, row * cell, cell, LAVENDER)
                continue
            }
            if (!value) continue
            if (k !== Kind.Program) {
                // Not the program: error correction first, then the rest, fade away.
                const fade = (t - PATTERNS - UNMASK - (k === Kind.Correction ? 0 : CLEAR * 0.3)) / (CLEAR * 0.7)
                if (fade < 1) block(col * cell, row * cell, cell, fade > 0 ? grey(fade) : BLACK)
                continue
            }
            // The program: each module leaves in its turn, and flies to where it belongs among the bits.
            const flight = (flying - progress[at] * STREAM) / FLIGHT
            if (flight >= 1) continue
            if (flight <= 0) {
                block(col * cell, row * cell, cell, BLACK)
                continue
            }
            const ease = flight * flight * (3 - 2 * flight)
            const target = Math.min(Math.floor(progress[at] * bits), bits - 1)
            const x = col * cell + (target % grid * landed - col * cell) * ease
            const y = row * cell + (Math.floor(target / grid) * landed - row * cell) * ease
            block(x, y, cell + (landed - cell) * ease, grey(ease * ease * 0.75))
        }
        context.putImageData(image, 0, 0)
        if (backwards ? t > 0 : t < DECODE_MS) frame = requestAnimationFrame(draw)
        else done()
    }
    // (Something to show at once, before the first frame.)
    draw(start)
    return () => cancelAnimationFrame(frame)
}
