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
        // Fast-forward: the card is run this many times faster than it's heard.
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
                // (`skip`: start again, then get this many samples in before being heard.)
                this.setup(e.data.seed, e.data.skip)
            } else if (e.data.cmd === "skip") {
                this.skipping += e.data.samples
            } else if (e.data.cmd === "speed") {
                this.speed = e.data.value
            } else if (e.data.cmd === "play") {
                if (!this.wasm) this.setup(e.data.seed)
                this.playing = true
            } else if (e.data.cmd === "pause") {
                this.playing = false
            } else if (e.data.cmd === "ping") {
                // (Answered whenever this thread is free: that is, not while a card is stuck.)
                this.port.postMessage({ pong: true })
            }
        }
    }

    // The loaded card rewritten for tracing or metering (by the tracer: src/instrument.worklet.ts,
    // added to this scope when one of them is first wanted), compiled. The last few are kept.
    rewritten(binary, trace, meter) {
        let hash = 2166136261
        for (const byte of binary) hash = Math.imul(hash ^ byte, 16777619)
        const key = `${trace}${meter}${binary.length}:${hash >>> 0}`
        let made = this.rewrites.get(key)
        if (!made) {
            const { binary: rewrite, map } = globalThis.scorecardInstrument(binary, trace, meter)
            made = { map, module: new WebAssembly.Module(rewrite) }
            if (this.rewrites.size >= 8) this.rewrites.delete(this.rewrites.keys().next().value)
            this.rewrites.set(key, made)
        }
        return made
    }

    // The loaded card, instantiated: as it is, or rewritten. With `meter` it has a gas counter, so
    // that if it never finishes it is stopped; with `trace` it reports what it runs. Once the
    // tracer is here to do the rewriting, every card is rewritten, if only to export its state
    // (`carries`), so that it can be carried over into another rewriting later.
    async load(trace, meter) {
        const able = !!globalThis.scorecardInstrument
        trace = trace && able
        meter = meter && able
        const card = { binary: this.binary }
        let module = this.module
        if (able) {
            try {
                const made = this.rewritten(this.binary, trace, meter)
                module = made.module
                card.map = made.map
                card.carries = true
            } catch (error) {
                // A card the rewriter can't manage is still a card: unless it was to be traced
                // (which takes rewriting), it plays as it is, unguarded.
                if (trace) throw error
                meter = false
            }
        }
        let imports
        if (trace) {
            const traceLogs = card.traceLogs = []
            imports = { scorecard: { log(i) { traceLogs[i] = (traceLogs[i] ?? 0) + 1 } } }
        }
        card.instance = await WebAssembly.instantiate(module, imports)
        card.gas = meter ? card.instance.exports.gas : null
        // (A metered card gets an allowance for its setup, as for each block of sound.)
        if (card.gas) card.gas.value = GAS
        return card
    }

    // The card that's playing goes on as it is, but traced or metered as is now wanted: it's
    // rewritten afresh, and its state (all of its memory, and its globals) is copied across. If
    // that can't be done (the card playing wasn't rewritten to export its state, which is so if
    // the tracer couldn't be fetched), it starts again instead and is run, unheard, to where it was.
    async carryOver() {
        const able = !!globalThis.scorecardInstrument, old = this.card, seed = this.seed
        const again = () => this.setup(seed, this.pos + this.skipping)
        if (!able || !old?.carries || old.binary !== this.binary) return again()
        let fresh
        try {
            fresh = await this.load(!!this.trace, !!this.meter)
        } catch (error) {
            return again()
        }
        // (Meanwhile another card may have been set up, or this one carried over already.)
        if (this.card !== old || !fresh.carries) return this.card === old ? again() : undefined
        const from = old.instance.exports, to = fresh.instance.exports
        const memory = from["scorecard.memory"], copy = to["scorecard.memory"]
        if (memory && copy) {
            const more = (memory.buffer.byteLength - copy.buffer.byteLength) / 65536
            if (more > 0) copy.grow(more)
            new Uint8Array(copy.buffer).set(new Uint8Array(memory.buffer))
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
        this.traceLogs = card.traceLogs ?? null
        if (this.traceLogs) {
            // (The page is told which card is being traced, and what its counters count.)
            this.port.postMessage({ traced: { binary: card.binary, map: card.map } })
            this.port.postMessage(this.traceLogs)
            this.traceLogs.length = 0
        }
    }

    // The card can't go on (it ran out of gas, or failed some other way): stop, and say so.
    fail(error) {
        this.card = undefined
        this.wasm = undefined
        this.gas = null
        this.traceLogs = null
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
            card = await this.load(this.trace, this.meter)
            // Support new, short export name ("s") or legacy name ("setup") for old cards.
            const setup = card.instance.exports.s ?? card.instance.exports.setup
            if (setup) {
                setup(seed)
            }
        } catch (error) {
            return this.fail(error)
        }
        this.seed = seed
        this.adopt(card)
        // (Only now, so the card being replaced doesn't do the skipping.)
        this.skipping = skip
    }

    process(inputs, outputs, parameters) {
        if (this.wasm === undefined) return true

        // Support new, short export name ("p") or legacy name ("process") for old cards.
        const process = this.wasm.exports.p ?? this.wasm.exports.process
        const speakers = outputs[0]

        // (A metered card gets its allowance for this block. If it runs out, or fails, that's the end of it.)
        if (this.gas) this.gas.value = GAS
        let made = 0
        try {
            if (this.skipping > 0) {
                // Get ahead as fast as we reasonably can (in silence), a bounded amount per call so
                // as not to hold up the audio thread for long: SKIP_RATE times real time.
                const n = Math.min(this.skipping, 128 * SKIP_RATE)
                for (let i = 0; i < n; i++) process()
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
                let x = process()
                if (speed > 1) {
                    if (this.snatch <= 0) {
                        const jump = SNATCH * (speed - 1)
                        for (let j = 0; j < jump; j++) process()
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
            }
        } catch (error) {
            this.fail(error)
            return true
        }

        this.pos += made
        this.sincePost += 128
        if (this.sincePost >= 1024) {
            this.sincePost = 0
            this.postPosition()
        }

        return true
    }

    postPosition() {
        this.port.postMessage(this.pos)
        if (this.traceLogs) {
            this.port.postMessage(this.traceLogs)
            this.traceLogs.length = 0
        }
    }
}

registerProcessor("custom-processor", CustomProcessor)
