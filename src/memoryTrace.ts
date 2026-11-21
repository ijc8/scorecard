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
const BLOCK = 16       // regions are tracked in blocks of this many bytes...
const MERGE_GAP = 256  // ...and merged when they're this close together

export class MemoryTrace {
    // Byte address -> heat (1 = touched in the latest update, fading after that)
    reads = new Map<number, number>()
    writes = new Map<number, number>()
    // Sorted, non-overlapping [start, end) extents of memory touched so far, outside of the data segments.
    // (Data segments are part of the card itself, so they're drawn there instead.)
    regions: [number, number][] = []

    constructor(public data: DataSegment[]) {}

    update(reads: Uint32Array, writes: Uint32Array) {
        for (const [heat, fresh] of [[this.reads, reads], [this.writes, writes]] as const) {
            for (const [address, value] of heat) {
                if (value < 0.05) heat.delete(address)
                else heat.set(address, value * DECAY)
            }
            for (const address of fresh) {
                heat.set(address, 1)
                this.include(address)
            }
        }
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

    private include(address: number) {
        let i = this.find(address)
        if (i >= 0 || this.inData(address)) return
        i = -i - 1
        const start = address - address % BLOCK
        this.regions.splice(i, 0, [start, start + BLOCK])
        // Merge with neighbors that are close enough.
        if (i > 0 && start - this.regions[i - 1][1] <= MERGE_GAP) {
            this.regions[i - 1][1] = start + BLOCK
            this.regions.splice(i--, 1)
        }
        if (i + 1 < this.regions.length && this.regions[i + 1][0] - this.regions[i][1] <= MERGE_GAP) {
            this.regions[i][1] = this.regions[i + 1][1]
            this.regions.splice(i + 1, 1)
        }
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
        for (const [heat, out] of [[this.reads, result.reads], [this.writes, result.writes]] as const) {
            for (const [address, value] of heat) {
                const i = this.find(address)
                if (i < 0) continue
                const cell = starts[i] + Math.floor((address - this.regions[i][0]) / bytesPerCell)
                if (cell < cells && value > out[cell]) out[cell] = value
            }
        }
        return result
    }
}
