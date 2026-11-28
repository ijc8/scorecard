// Remembers which bytes of memory have been touched since the last `flush()`, which gives them
// as runs: [start, length, start, length, ...]. (A card with a delay line touches tens of
// thousands of bytes between flushes, nearly all of them in a row.)
// Flags live in pages allocated on demand, so this costs little however large (or sparse) memory is.
function makeTouchTracker() {
    const pages = []
    // The pages with anything flagged in them (each page's last element says whether it's listed).
    let dirty = []
    return {
        touch(address, size) {
            // Fast path for hot addresses: if the first byte is already marked, the rest will be too
            // (short of overlapping, differently-aligned accesses, which we can live with missing).
            if (pages[address >>> 12]?.[address & 4095]) return
            for (let a = address; a < address + size; a++) {
                const page = pages[a >>> 12] ??= new Uint8Array(4097)
                if (!page[4096]) {
                    page[4096] = 1
                    dirty.push(a >>> 12)
                }
                page[a & 4095] = 1
            }
        },
        flush() {
            const runs = []
            let start = -1, end = -1
            dirty.sort((a, b) => a - b)
            for (const index of dirty) {
                const page = pages[index]
                for (let i = page.indexOf(1); i >= 0 && i < 4096; i = page.indexOf(1, i + 1)) {
                    page[i] = 0
                    const address = index * 4096 + i
                    if (address === end) {
                        end++
                    } else {
                        if (start >= 0) runs.push(start, end - start)
                        start = address
                        end = address + 1
                    }
                }
                page[4096] = 0
            }
            if (start >= 0) runs.push(start, end - start)
            dirty = []
            return Uint32Array.from(runs)
        },
    }
}

// The same, for a card that keeps its own account of the memory it touches (see `shadowFor` in
// src/wasmTracer.ts): a flag for each byte at `flags` in its memory, and one at `pages` for each
// 4096 bytes with any flags set. Gives the runs of bytes flagged, and clears them.
function flushShadow(memory, shadow, flags, pages) {
    const bytes = new Uint8Array(memory.buffer)
    const dirty = bytes.subarray(pages, pages + shadow.pages)
    const runs = []
    let start = -1, end = -1
    for (let index = dirty.indexOf(1); index >= 0; index = dirty.indexOf(1, index + 1)) {
        dirty[index] = 0
        // (An access that starts in this page may run up to 7 bytes into the next.)
        const base = index * 4096, page = bytes.subarray(flags + base, flags + Math.min(base + 4103, shadow.size))
        for (let from = page.indexOf(1); from >= 0; ) {
            let to = page.indexOf(0, from)
            if (to < 0) to = page.length
            page.fill(0, from, to)
            if (base + from === end) {
                end = base + to
            } else {
                if (start >= 0) runs.push(start, end - start)
                start = base + from
                end = base + to
            }
            from = page.indexOf(1, to)
        }
    }
    if (start >= 0) runs.push(start, end - start)
    return Uint32Array.from(runs)
}

// Gas: how many times round its loops a metered card may go in one call from here (a block of
// sound, or its setup) before it's stopped. Cards use tens of thousands; this is a fraction of a second's work.
const GAS = 20000000

// How long each snatch of a card heard while fast-forwarding is, in samples (60 ms).
const SNATCH = 2646
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
        this.snatch = 0
        // Skipping ahead: samples still to be made (silently) before playing on.
        this.skipping = 0
        this.sincePost = 0
        this.rewrites = new Map()
        this.port.onmessage = async e => {
            if (e.data.cmd === "loadModule") {
                this.binary = e.data.binary
                this.module = new WebAssembly.Module(e.data.binary)
                this.trace = e.data.trace
                this.meter = e.data.meter
            } else if (e.data.cmd === "instrument") {
                // Tracing or metering is turned on or off. A card that's under way carries on as it was.
                this.trace = e.data.trace
                this.meter = e.data.meter
                if (this.wasm) this.carryOver()
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
            } else if (e.data.cmd === "bench") {
                this.bench(e.data.seed, e.data.meter)
            } else if (e.data.cmd === "ping") {
                // (Answered whenever this thread is free: that is, not while a card is stuck.)
                this.port.postMessage({ pong: true })
            }
        }
    }

    // A card rewritten for tracing or metering (by the tracer: instrument.worklet.ts, added to this
    // scope when one of them is first wanted), compiled. The last few are kept.
    rewritten(binary, trace, meter) {
        let hash = 2166136261
        for (const byte of binary) hash = Math.imul(hash ^ byte, 16777619)
        const key = `${trace}${meter}${binary.length}:${hash >>> 0}`
        let made = this.rewrites.get(key)
        if (!made) {
            const { binary: rewrite, ...account } = globalThis.scorecardInstrument(binary, trace, meter)
            made = { ...account, module: new WebAssembly.Module(rewrite) }
            if (this.rewrites.size >= 8) this.rewrites.delete(this.rewrites.keys().next().value)
            this.rewrites.set(key, made)
        }
        return made
    }

    // Gets the loaded card ready to play with this seed. Its setup (short export name "s", or the
    // legacy "setup" of old cards) may return the address in its memory of another card (a 32-bit
    // length, then that many bytes of WebAssembly), to be played in its place; and that one's may
    // do the same. With `meter`, every card along the way is given a gas counter, so that one that
    // never finishes is stopped. With `trace`, the card that plays (whichever that turned out to
    // be) is rewritten to report what it runs and touches, and set up again.
    async make(seed, trace, meter) {
        const able = !!globalThis.scorecardInstrument
        trace = trace && able
        meter = meter && able
        const setupOf = instance => instance.exports.s ?? instance.exports.setup
        const load = (binary, traced) => this.load(binary, traced, meter)
        let card = await load(this.binary, false)
        for (;;) {
            const next = setupOf(card.instance)?.(seed)
            if (typeof next !== "number" || next === 0) break
            const memory = (card.instance.exports.m ?? card.instance.exports.memory).buffer
            const length = new DataView(memory).getUint32(next >>> 0, true)
            card = await load(new Uint8Array(memory.slice((next >>> 0) + 4, (next >>> 0) + 4 + length)), false)
        }
        if (trace) {
            card = await load(card.binary, true)
            setupOf(card.instance)?.(seed)
        }
        return card
    }

    // A card (this binary), instantiated: as it is, or rewritten to be traced or metered. Once the
    // tracer is here to do the rewriting, every card is rewritten, if only to export its state
    // (`carries`), so that it can be carried over into another rewriting later.
    async load(binary, traced, meter) {
            const card = { binary, meter, traced }
            let module = binary === this.binary ? this.module : null
            if (globalThis.scorecardInstrument) {
                const made = this.rewritten(binary, traced, meter)
                module = made.module
                card.map = made.map
                card.shadow = made.shadow
                card.blocks = made.blocks
                card.carries = true
            }
            module ??= new WebAssembly.Module(binary)
            let imports
            if (traced && !card.shadow) {
                // A traced card that can't flag the memory it touches itself calls out instead.
                const reads = card.reads = makeTouchTracker(), writes = card.writes = makeTouchTracker()
                imports = { scorecard: {
                    // These pass the address through, so they can sit in front of each load and store.
                    read(address, offset, size) { reads.touch((address >>> 0) + offset, size); return address },
                    write(address, offset, size) { writes.touch((address >>> 0) + offset, size); return address },
                } }
            }
            card.instance = await WebAssembly.instantiate(module, imports)
            // (A traced card counts the times each block of its code runs in a global of its own.)
            if (traced) card.counters = Array.from({ length: card.blocks }, (_, i) => card.instance.exports["scorecard.block" + i])
            card.gas = meter ? card.instance.exports.gas : null
            if (card.gas) card.gas.value = GAS
            return card
    }

    // The card that's playing goes on as it is, but traced or metered as is now wanted: it's
    // rewritten afresh, and its state (all of its memory, and its globals) is copied across. If
    // that can't be done (the card playing wasn't rewritten to export its state, which is so if the
    // tracer has only just arrived), it starts again instead and is run, unheard, to where it was.
    async carryOver() {
        const able = !!globalThis.scorecardInstrument, old = this.card, seed = this.seed
        const again = () => this.setup(seed, this.pos + this.skipping)
        if (!able || !old?.carries) return again()
        let fresh
        try {
            fresh = await this.load(old.binary, !!this.trace, !!this.meter)
        } catch (error) {
            return again()
        }
        // (Meanwhile another card may have been set up, or this one carried over already.)
        if (this.card !== old) return
        const from = old.instance.exports, to = fresh.instance.exports
        const memory = from["scorecard.memory"], copy = to["scorecard.memory"]
        if (memory && copy) {
            // (Only the card's own memory: a traced card has its account of itself above that.)
            const size = old.shadow?.size ?? memory.buffer.byteLength
            const more = (size - (fresh.shadow?.size ?? copy.buffer.byteLength)) / 65536
            if (more > 0) copy.grow(more)
            new Uint8Array(copy.buffer).set(new Uint8Array(memory.buffer, 0, size))
        }
        for (const name in from) {
            if (name.startsWith("scorecard.global") && to[name]) to[name].value = from[name].value
        }
        this.adopt(fresh)
    }

    // This card (an instance, set up) is the one that plays from here on.
    adopt(card) {
        this.card = card
        this.wasm = card.instance
        this.gas = card.gas
        // (The page is told which card is being traced.)
        if (card.traced) this.port.postMessage({ traced: { binary: card.binary, map: card.map } })
        if (card.traced) this.postTrace()
    }

    // The card can't go on (it ran out of gas, or failed some other way): stop, and say so.
    fail(error) {
        this.card = undefined
        this.wasm = undefined
        this.playing = false
        this.port.postMessage({ failed: String(error?.message ?? error) })
    }

    async setup(seed, skip = 0) {
        // (Asked to play before any card has arrived: it's set up when it's loaded and reset.)
        if (!this.module) return
        this.pos = 0
        this.skipping = 0
        let card
        try {
            card = await this.make(seed, this.trace, this.meter)
        } catch (error) {
            return this.fail(error)
        }
        this.seed = seed
        this.adopt(card)
        // (Only now, so the card being replaced doesn't do the skipping.)
        this.skipping = skip
    }

    // How fast is the loaded card, as scanned or metered? Makes sound (unheard) for about half a
    // second of this thread's time and says how much it made. (Not while playing: this holds everything up.)
    async bench(seed, meter) {
        try {
            const card = await this.make(seed, false, meter)
            const process = card.instance.exports.p ?? card.instance.exports.process
            const start = Date.now()
            let samples = 0, ms = 0
            while (ms < 500) {
                if (card.gas) card.gas.value = GAS
                for (let i = 0; i < 4096; i++) process(0)
                samples += 4096
                ms = Date.now() - start
            }
            this.port.postMessage({ bench: { samples, ms, metered: !!card.gas } })
        } catch (error) {
            this.port.postMessage({ bench: { error: String(error?.message ?? error) } })
        }
    }

    postTrace() {
        // Memory first: the execution counts that follow trigger a redraw.
        const card = this.card, shadow = card.shadow, memory = shadow && card.instance.exports["scorecard.memory"]
        const reads = shadow ? flushShadow(memory, shadow, shadow.read, shadow.readPages) : card.reads.flush()
        const writes = shadow ? flushShadow(memory, shadow, shadow.written, shadow.writtenPages) : card.writes.flush()
        this.port.postMessage({ reads, writes }, [reads.buffer, writes.buffer])
        // How many times each block has run since last time (a sparse array, as long as the last that has).
        const counts = []
        card.counters.forEach((counter, i) => {
            const n = counter.value
            if (n) {
                counts[i] = n
                counter.value = 0
            }
        })
        this.port.postMessage(counts)
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

        // (A metered card gets its allowance for this block. If it runs out, or fails, that's the end of it.)
        if (this.gas) this.gas.value = GAS
        let made = 0
        try {
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
            made = speakers[0].length
            // Fast-forward goes as a CD player searches: a snatch of the card at its own pitch, then
            // a jump over `speed - 1` times as much (in silence), and so on.
            const speed = this.speed
            if (speed === 1) this.snatch = 0
            for (let i = 0; i < speakers[0].length; i++) {
                let x = process(input ? input[i] : 0) * this.volume
                if (speed > 1) {
                    if (this.snatch <= 0) {
                        const jump = SNATCH * (speed - 1)
                        for (let j = 0; j < jump; j++) process(0)
                        made += jump
                        this.snatch = SNATCH
                    }
                    // (Each snatch fades in and out, so that the joins don't click.)
                    x *= Math.min(1, this.snatch / 150, (SNATCH + 1 - this.snatch) / 150)
                    this.snatch--
                }
                for (const channel of speakers) {
                    channel[i] = x
                }
                if (input && Math.abs(input[i]) > this.inputPeak) this.inputPeak = Math.abs(input[i])
            }

        } catch (error) {
            this.fail(error)
            return true
        }

        this.pos += made
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
        if (this.card?.traced) this.postTrace()
    }
}

registerProcessor("custom-processor", CustomProcessor)
