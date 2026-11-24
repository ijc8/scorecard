// What a phone does to get from a card's QR code back to its program, worked out module by module so
// that it can be shown (see decodeAnimation.ts). Reading a QR code goes: set aside the function
// patterns (finders, timing, alignment, format and version); take the mask off; read the remaining
// modules in the standard zigzag, bottom right to top left, as a stream of codewords; un-shuffle the
// blocks they were dealt into and drop the error-correction codewords; and read what's left as
// segments of text. For a score card that text is the link, and the end of it is the program in base 43.
import QRCode from "qrcode"
// (These are the QR library's own tables, which it doesn't export.)
import ECCode from "qrcode/lib/core/error-correction-code"
import Utils from "qrcode/lib/core/utils"
import Mode from "qrcode/lib/core/mode"

export const enum Kind { Function, Header, Address, Program, Padding, Correction, Remainder }

export interface Decoding {
    size: number            // modules along a side
    dark: Uint8Array        // each module as printed
    mask: Uint8Array        // 1 where the mask flipped it
    kind: Uint8Array        // what each module is part of
    stream: Int32Array      // each module's place in the zigzag (-1 for function patterns)
    progress: Float32Array  // for a module of the program: how far through the program it is, 0 to 1
    text: string            // what the modules say, read back from them (it should be the link)
}

// The eight masks, as conditions on a module's row and column.
const MASKS: ((i: number, j: number) => boolean)[] = [
    (i, j) => (i + j) % 2 === 0,
    i => i % 2 === 0,
    (_, j) => j % 3 === 0,
    (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
    (i, j) => (i * j) % 2 + (i * j) % 3 === 0,
    (i, j) => ((i * j) % 2 + (i * j) % 3) % 2 === 0,
    (i, j) => ((i * j) % 3 + (i + j) % 2) % 2 === 0,
]

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"

// `programChars`: how much of the end of the link is the program.
export function decodeSteps(url: string, programChars: number): Decoding {
    const qr = QRCode.create(url, { errorCorrectionLevel: "L" }) as any
    const size: number = qr.modules.size
    const dark = Uint8Array.from(qr.modules.data as ArrayLike<number>, bit => bit ? 1 : 0)
    const reserved: Uint8Array = qr.modules.reservedBit
    const maskAt = MASKS[qr.maskPattern]
    const mask = new Uint8Array(size * size), kind = new Uint8Array(size * size)
    const stream = new Int32Array(size * size).fill(-1), progress = new Float32Array(size * size)

    // The zigzag: two columns at a time from the right, up then down, skipping the timing column.
    let count = 0
    let up = true
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5
        for (let step = 0; step < size; step++) {
            const row = up ? size - 1 - step : step
            for (const col of [right, right - 1]) {
                const at = row * size + col
                if (reserved[at]) continue
                stream[at] = count++
                mask[at] = maskAt(row, col) ? 1 : 0
            }
        }
        up = !up
    }

    // The codewords are dealt out to blocks in turn (the last blocks are one codeword longer),
    // data first and then error correction. Where does each data codeword belong, un-dealt?
    const total: number = Utils.getSymbolTotalCodewords(qr.version)
    const correction: number = ECCode.getTotalCodewordsCount(qr.version, qr.errorCorrectionLevel)
    const blocks: number = ECCode.getBlocksCount(qr.version, qr.errorCorrectionLevel)
    const data = total - correction, longer = total % blocks, short = Math.floor(data / blocks)
    const length = (block: number) => short + (block >= blocks - longer ? 1 : 0)
    const starts: number[] = []
    for (let block = 0, start = 0; block < blocks; start += length(block++)) starts.push(start)
    const place = new Int32Array(data)
    for (let i = 0, dealt = 0; i <= short; i++) {
        for (let block = 0; block < blocks; block++) {
            if (i < length(block)) place[dealt++] = starts[block] + i
        }
    }

    // What each bit of the data means: go through the segments as a reader would.
    const meaning = new Uint8Array(data * 8).fill(Kind.Padding), share = new Float32Array(data * 8)
    const programStart = url.length - programChars
    let bit = 0, char = 0
    for (const segment of qr.segments) {
        const text: string = segment.data
        const header = 4 + Mode.getCharCountIndicator(segment.mode, qr.version)
        meaning.fill(Kind.Header, bit, bit + header)
        bit += header
        // Characters come in groups: pairs in 11 bits (alphanumeric), threes in 10 (numeric), or one to a byte.
        const [group, bits] = segment.mode === Mode.ALPHANUMERIC ? [2, [0, 6, 11]] : segment.mode === Mode.NUMERIC ? [3, [0, 4, 7, 10]] : [1, [0, 8]]
        for (let i = 0; i < text.length; i += group) {
            const chars = Math.min(group, text.length - i), width = bits[chars]
            for (let b = 0; b < width; b++) {
                // (Spread a group's bits evenly over its characters.)
                const at = char + i + b / width * chars
                meaning[bit + b] = at < programStart ? Kind.Address : Kind.Program
                share[bit + b] = (at - programStart) / programChars
            }
            bit += width
        }
        char += text.length
    }

    // Read the bits back off the modules, for the sake of checking all this against the link itself.
    const codewords = new Uint8Array(data)
    for (let at = 0; at < size * size; at++) {
        const n = stream[at]
        if (n < 0) continue
        const codeword = n >> 3
        if (codeword >= total) kind[at] = Kind.Remainder
        else if (codeword >= data) kind[at] = Kind.Correction
        else {
            const index = place[codeword] * 8 + (n & 7)
            kind[at] = meaning[index]
            progress[at] = share[index]
            if (dark[at] ^ mask[at]) codewords[place[codeword]] |= 0x80 >> (n & 7)
        }
    }
    return { size, dark, mask, kind, stream, progress, text: readText(codewords, qr.version) }
}

// Read the text out of a QR code's data codewords (alphanumeric, numeric and byte segments).
function readText(codewords: Uint8Array, version: number) {
    let at = 0
    const take = (bits: number) => {
        let value = 0
        for (let i = 0; i < bits; i++, at++) value = value << 1 | (codewords[at >> 3] >> (7 - (at & 7)) & 1)
        return value
    }
    let text = ""
    while (at + 4 <= codewords.length * 8) {
        const mode = [Mode.NUMERIC, Mode.ALPHANUMERIC, Mode.BYTE].find(mode => mode.bit === peek(codewords, at))
        if (!mode) break
        at += 4
        let left = take(Mode.getCharCountIndicator(mode, version))
        if (mode === Mode.ALPHANUMERIC) {
            for (; left >= 2; left -= 2) {
                const pair = take(11)
                text += ALPHANUMERIC[Math.floor(pair / 45)] + ALPHANUMERIC[pair % 45]
            }
            if (left) text += ALPHANUMERIC[take(6)]
        } else if (mode === Mode.NUMERIC) {
            for (; left >= 3; left -= 3) text += String(take(10)).padStart(3, "0")
            if (left) text += String(take(left === 2 ? 7 : 4)).padStart(left, "0")
        } else {
            for (; left > 0; left--) text += String.fromCharCode(take(8))
        }
    }
    return text
}

function peek(codewords: Uint8Array, at: number) {
    let value = 0
    for (let i = 0; i < 4; i++) value = value << 1 | (codewords[(at + i) >> 3] >> (7 - ((at + i) & 7)) & 1)
    return value
}
