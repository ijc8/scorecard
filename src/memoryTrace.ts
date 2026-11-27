// Bookkeeping for the memory side of the execution trace: which bytes were recently read or
// written, and how to lay out the touched parts of memory in a fixed number of cells.

export interface DataSegment {
    address: number // where the segment lives in memory
    offset: number  // where its bytes live in the binary
    length: number
}

// Find the active data segments: the parts of the binary that are also (initial) memory contents.
export function findDataSegments(binary: Uint8Array) {
    const segments: DataSegment[] = []
    let pos = 8 // skip magic & version
    const leb = () => {
        // (Sign-extension doesn't matter here: addresses and lengths in a card are small and positive.)
        let result = 0, shift = 0, byte
        do {
            byte = binary[pos++]
            result |= (byte & 0x7f) << shift
            shift += 7
        } while (byte & 0x80)
        return result
    }
    while (pos < binary.length) {
        const id = binary[pos++]
        const size = leb()
        if (id !== 11) {
            pos += size
            continue
        }
        const count = leb()
        for (let i = 0; i < count; i++) {
            const flags = leb()
            if (flags === 1) { // passive: not placed in memory at startup
                pos += leb()
                continue
            }
            if (flags === 2) leb() // explicit memory index
            if (binary[pos++] !== 0x41) break // only `i32.const` offsets are understood
            const address = leb()
            pos++ // `end`
            const length = leb()
            segments.push({ address, offset: pos, length })
            pos += length
        }
        break
    }
    return segments
}

const DECAY = 0.6      // per update, matching the execution heatmap
const LASTING = 8      // updates after which a touch has faded away (0.6^8 is under 2%)
const BLOCK = 16       // regions are tracked in blocks of this many bytes...
const MERGE_GAP = 256  // ...and merged when they're this close together

type Kind = "reads" | "writes"
const KINDS: Kind[] = ["reads", "writes"]

// What the worklet reports of memory, each update, is runs of bytes touched: [start, length, ...].
// A card with a delay line touches tens of thousands of bytes a second, so nothing here is kept
// or done per byte, except within the data segments (which are small: they're part of the card).
export class MemoryTrace {
    // How many updates there have been.
    private tick = 0
    // For each data segment, the update at which each of its bytes was last read and written (0: never).
    private last: { reads: Uint32Array, writes: Uint32Array }[]
    // The runs touched in the last few updates, oldest first.
    private recent: { reads: { tick: number, runs: Uint32Array }[], writes: { tick: number, runs: Uint32Array }[] } = { reads: [], writes: [] }
    // Sorted, non-overlapping [start, end) extents of memory touched so far, outside of the data segments.
    // (Data segments are part of the card itself, so they're drawn there instead.)
    regions: [number, number][] = []

    constructor(public data: DataSegment[]) {
        this.last = data.map(segment => ({ reads: new Uint32Array(segment.length), writes: new Uint32Array(segment.length) }))
    }

    update(reads: Uint32Array, writes: Uint32Array) {
        this.tick++
        for (const [kind, runs] of [["reads", reads], ["writes", writes]] as const) {
            const recent = this.recent[kind]
            while (recent.length && this.tick - recent[0].tick >= LASTING) recent.shift()
            if (runs.length) recent.push({ tick: this.tick, runs })
            for (let i = 0; i < runs.length; i += 2) this.touch(kind, runs[i], runs[i] + runs[i + 1])
        }
    }

    // Bytes from `start` up to `end` were touched: note it in the data segments they fall in, and
    // count what's left of them among the regions.
    private touch(kind: Kind, start: number, end: number) {
        let from = start
        // (Data segments come in order of address.)
        this.data.forEach((segment, index) => {
            const a = Math.max(start, segment.address), b = Math.min(end, segment.address + segment.length)
            if (a >= b) return
            this.last[index][kind].fill(this.tick, a - segment.address, b - segment.address)
            if (from < a) this.include(from, a)
            from = Math.max(from, b)
        })
        if (from < end) this.include(from, end)
    }

    // How lately a byte of a data segment has been read or written: 1 in the latest update, fading after that.
    heat(kind: Kind, segment: DataSegment, byte: number) {
        const last = this.last[this.data.indexOf(segment)]?.[kind][byte]
        return last && this.tick - last < LASTING ? DECAY ** (this.tick - last) : 0
    }

    inData(address: number) {
        return this.data.find(s => address >= s.address && address < s.address + s.length)
    }

    // Index of the region containing `address`, or of the first region after it (negated, minus one) if none does.
    private find(address: number) {
        let low = 0, high = this.regions.length
        while (low < high) {
            const mid = (low + high) >> 1
            if (this.regions[mid][1] <= address) low = mid + 1
            else high = mid
        }
        return low < this.regions.length && this.regions[low][0] <= address ? low : -low - 1
    }

    // Make the regions cover `start` up to `end`, merging with neighbours that are close enough.
    private include(start: number, end: number) {
        const at = this.find(start)
        // (Nearly always: it's somewhere that has been touched before.)
        if (at >= 0 && this.regions[at][1] >= end) return
        start -= start % BLOCK
        end += (BLOCK - end % BLOCK) % BLOCK
        // The regions from `first` up to `beyond` are within reach, and become one with this.
        let first = at >= 0 ? at : -at - 1
        while (first > 0 && start - this.regions[first - 1][1] <= MERGE_GAP) first--
        let beyond = first
        while (beyond < this.regions.length && this.regions[beyond][0] - end <= MERGE_GAP) beyond++
        if (beyond > first) {
            start = Math.min(start, this.regions[first][0])
            end = Math.max(end, this.regions[beyond - 1][1])
        }
        this.regions.splice(first, beyond - first, [start, end])
    }

    // Squeeze the touched regions into (at most) `cells` cells, with a gap between regions.
    // Returns per-cell heat for reads and writes, and which cells correspond to memory at all.
    layout(cells: number) {
        const GAP = 2
        const total = this.regions.reduce((sum, [start, end]) => sum + end - start, 0)
        const room = Math.max(cells - GAP * this.regions.length, 1)
        const bytesPerCell = Math.max(1, Math.ceil(total / room))
        const starts: number[] = []
        const mapped = new Uint8Array(cells)
        let cell = 0
        for (const [start, end] of this.regions) {
            starts.push(cell)
            const length = Math.ceil((end - start) / bytesPerCell)
            mapped.fill(1, cell, cell + length)
            cell += length + GAP
        }
        const result = { reads: new Float32Array(cells), writes: new Float32Array(cells), mapped, bytesPerCell }
        for (const kind of KINDS) {
            const out = result[kind]
            // (Oldest first, so that the latest touch of a cell is the one that shows.)
            for (const { tick, runs } of this.recent[kind]) {
                const value = DECAY ** (this.tick - tick)
                for (let i = 0; i < runs.length; i += 2) {
                    // A run lies in one region, unless part of it is in a data segment: then in those either side.
                    let from = runs[i]
                    const end = from + runs[i + 1]
                    while (from < end) {
                        let r = this.find(from)
                        if (r < 0) {
                            r = -r - 1
                            if (r >= this.regions.length || this.regions[r][0] >= end) break
                            from = this.regions[r][0]
                        }
                        const [start, stop] = this.regions[r]
                        const a = starts[r] + Math.floor((from - start) / bytesPerCell)
                        const b = starts[r] + Math.floor((Math.min(end, stop) - 1 - start) / bytesPerCell)
                        for (let c = a; c <= b && c < cells; c++) out[c] = value
                        from = stop
                    }
                }
            }
        }
        return result
    }
}
