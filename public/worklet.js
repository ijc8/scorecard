// Remembers which bytes of memory have been touched since the last `flush()`.
// Flags live in pages allocated on demand, so this costs little however large (or sparse) memory is.
function makeTouchTracker() {
    const pages = []
    let touched = new Uint32Array(1 << 12)
    let count = 0
    return {
        touch(address, size) {
            // Fast path for hot addresses: if the first byte is already marked, the rest will be too
            // (short of overlapping, differently-aligned accesses, which we can live with missing).
            if (pages[address >>> 12]?.[address & 4095]) return
            for (let a = address; a < address + size; a++) {
                const page = pages[a >>> 12] ??= new Uint8Array(4096)
                if (page[a & 4095]) continue
                page[a & 4095] = 1
                if (count === touched.length) {
                    const bigger = new Uint32Array(count * 2)
                    bigger.set(touched)
                    touched = bigger
                }
                touched[count++] = a
            }
        },
        flush() {
            const out = touched.slice(0, count)
            for (const a of out) pages[a >>> 12][a & 4095] = 0
            count = 0
            return out
        },
    }
}

class CustomProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.playing = false
        this.pos = 0
        this.port.onmessage = async e => {
            if (e.data.cmd === "loadModule") {
                this.module = new WebAssembly.Module(e.data.binary)
                this.trace = e.data.trace
            } else if (e.data.cmd === "reset") {
                this.setup(e.data.seed)
            } else if (e.data.cmd === "play") {
                if (!this.wasm) this.setup(e.data.seed)
                this.playing = true
            } else if (e.data.cmd === "pause") {
                this.playing = false
            }
        }
    }

    async setup(seed) {
        this.pos = 0
        // Instantiate WebAssembly module.
        if (this.trace) {
            const traceLogs = []
            this.traceLogs = traceLogs
            const reads = this.reads = makeTouchTracker()
            const writes = this.writes = makeTouchTracker()
            this.wasm = await WebAssembly.instantiate(this.module, {
                scorecard: {
                    log(i) { traceLogs[i] = (traceLogs[i] ?? 0) + 1 },
                    // These pass the address through, so they can sit in front of each load and store.
                    read(address, offset, size) { reads.touch((address >>> 0) + offset, size); return address },
                    write(address, offset, size) { writes.touch((address >>> 0) + offset, size); return address },
                }
            })
        } else {
            this.traceLogs = null
            this.wasm = await WebAssembly.instantiate(this.module)
        }

        // Support new, short export name ("s") or legacy name ("setup") for old cards.
        const setup = this.wasm.exports.s ?? this.wasm.exports.setup
        if (setup) {
            setup(seed)
        }

        if (this.trace) this.postTrace()
    }

    postTrace() {
        // Memory first: the execution counts that follow trigger a redraw.
        const reads = this.reads.flush(), writes = this.writes.flush()
        this.port.postMessage({ reads, writes }, [reads.buffer, writes.buffer])
        this.port.postMessage(this.traceLogs)
        this.traceLogs.length = 0
    }

    process(inputs, outputs, parameters) {
        if (this.wasm === undefined || !this.playing) return true

        // Support new, short export name ("p") or legacy name ("process") for old cards.
        const process = this.wasm.exports.p ?? this.wasm.exports.process
        const speakers = outputs[0]

        for (let i = 0; i < speakers[0].length; i++) {
            const x = process()
            for (const channel of speakers) {
                channel[i] = x
            }
        }

        this.pos += 128
        if (this.pos % 1024 === 0) {
            this.port.postMessage(this.pos)
            if (this.traceLogs) this.postTrace()
        }

        return true
    }
}

registerProcessor("custom-processor", CustomProcessor)
