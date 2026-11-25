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

// How much faster than real time skipping ahead goes, at most.
const SKIP_RATE = 64

class CustomProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.playing = false
        this.pos = 0
        this.volume = 1
        this.inputPeak = 0
        // Fast-forward: this many samples are made for every one played (and averaged).
        this.speed = 1
        // Skipping ahead: samples still to be made (silently) before playing on.
        this.skipping = 0
        this.sincePost = 0
        this.port.onmessage = async e => {
            if (e.data.cmd === "loadModule") {
                this.binary = e.data.binary
                this.module = new WebAssembly.Module(e.data.binary)
                this.trace = e.data.trace
            } else if (e.data.cmd === "reset") {
                // (`resume`: start again, but get back to where the card had got to.)
                this.setup(e.data.seed, e.data.resume ? this.pos + this.skipping : e.data.skip)
            } else if (e.data.cmd === "skip") {
                this.skipping += e.data.samples
            } else if (e.data.cmd === "speed") {
                this.speed = e.data.value
            } else if (e.data.cmd === "play") {
                if (!this.wasm) this.setup(e.data.seed)
                this.playing = true
            } else if (e.data.cmd === "pause") {
                this.playing = false
            } else if (e.data.cmd === "volume") {
                this.volume = e.data.value
            } else if (e.data.cmd === "ping") {
                // (Answered whenever this thread is free: that is, not while a card is stuck.)
                this.port.postMessage({ pong: true })
            }
        }
    }

    async setup(seed, skip = 0) {
        this.pos = 0
        this.skipping = 0
        // Set the card up (short export name "s", or the legacy "setup" of old cards). Its setup may
        // return the address in its memory of another card (a 32-bit length, then that many bytes of
        // WebAssembly), to be played in its place; and that one's may do the same.
        const setupOf = instance => instance.exports.s ?? instance.exports.setup
        let instance = await WebAssembly.instantiate(this.module)
        let binary = this.binary
        for (;;) {
            const next = setupOf(instance)?.(seed)
            if (typeof next !== "number" || next === 0) break
            const memory = (instance.exports.m ?? instance.exports.memory).buffer
            const length = new DataView(memory).getUint32(next >>> 0, true)
            binary = new Uint8Array(memory.slice((next >>> 0) + 4, (next >>> 0) + 4 + length))
            instance = await WebAssembly.instantiate(new WebAssembly.Module(binary))
        }

        // Tracing: the card that plays (whichever that turned out to be) is rewritten to report
        // what it runs and touches, by the tracer (instrument.worklet.ts, added to this scope when
        // tracing is first wanted), and set up again. The page is told which card it is.
        const instrument = this.trace && globalThis.scorecardInstrument
        if (instrument) {
            let key = binary.length + ":", hash = 2166136261
            for (const byte of binary) hash = Math.imul(hash ^ byte, 16777619)
            key += hash >>> 0
            if (this.traced?.key !== key) {
                const { binary: rewritten, map } = instrument(binary)
                this.traced = { key, map, module: new WebAssembly.Module(rewritten) }
            }
            const traceLogs = []
            const reads = makeTouchTracker(), writes = makeTouchTracker()
            instance = await WebAssembly.instantiate(this.traced.module, {
                scorecard: {
                    log(i) { traceLogs[i] = (traceLogs[i] ?? 0) + 1 },
                    // These pass the address through, so they can sit in front of each load and store.
                    read(address, offset, size) { reads.touch((address >>> 0) + offset, size); return address },
                    write(address, offset, size) { writes.touch((address >>> 0) + offset, size); return address },
                }
            })
            setupOf(instance)?.(seed)
            this.traceLogs = traceLogs
            this.reads = reads
            this.writes = writes
            this.port.postMessage({ traced: { binary, map: this.traced.map } })
        } else {
            this.traceLogs = null
        }
        this.wasm = instance

        if (this.traceLogs) this.postTrace()
        // (Only now, so the card being replaced doesn't do the skipping.)
        this.skipping = skip
    }

    postTrace() {
        // Memory first: the execution counts that follow trigger a redraw.
        const reads = this.reads.flush(), writes = this.writes.flush()
        this.port.postMessage({ reads, writes }, [reads.buffer, writes.buffer])
        this.port.postMessage(this.traceLogs)
        this.traceLogs.length = 0
    }

    process(inputs, outputs, parameters) {
        if (this.wasm === undefined) return true

        // Support new, short export name ("p") or legacy name ("process") for old cards.
        const process = this.wasm.exports.p ?? this.wasm.exports.process
        if (!process) return true
        const speakers = outputs[0]
        // Incoming sound (the microphone), for cards whose process function takes a sample in.
        // It's only connected for those; other cards just ignore the argument.
        const input = inputs[0]?.[0]

        if (this.skipping > 0) {
            // Get ahead as fast as we reasonably can (in silence), a bounded amount per call so
            // as not to hold up the audio thread for long: SKIP_RATE times real time.
            const n = Math.min(this.skipping, 128 * SKIP_RATE)
            for (let i = 0; i < n; i++) process(0)
            this.skipping -= n
            this.pos += n
            this.postPosition()
            return true
        }

        if (!this.playing) return true
        const speed = this.speed
        for (let i = 0; i < speakers[0].length; i++) {
            let x = 0
            for (let j = 0; j < speed; j++) x += process(input ? input[i] : 0)
            x *= this.volume / speed
            for (const channel of speakers) {
                channel[i] = x
            }
            if (input && Math.abs(input[i]) > this.inputPeak) this.inputPeak = Math.abs(input[i])
        }

        this.pos += 128 * speed
        this.sincePost += 128
        if (this.sincePost >= 1024) {
            this.sincePost = 0
            if (input) this.port.postMessage({ inputPeak: this.inputPeak })
            this.inputPeak = 0
            this.postPosition()
        }

        return true
    }

    postPosition() {
        this.port.postMessage(this.pos)
        if (this.traceLogs) this.postTrace()
    }
}

registerProcessor("custom-processor", CustomProcessor)
