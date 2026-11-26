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
        this.port.onmessage = async e => {
            if (e.data.cmd === "loadModule") {
                this.module = new WebAssembly.Module(e.data.binary)
                this.trace = e.data.trace
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
            }
        }
    }

    async setup(seed, skip = 0) {
        this.pos = 0
        this.skipping = 0
        // Instantiate WebAssembly module.
        if (this.trace) {
            const traceLogs = []
            this.traceLogs = traceLogs
            this.wasm = await WebAssembly.instantiate(this.module, {
                scorecard: { log(i) { traceLogs[i] = (traceLogs[i] ?? 0) + 1 } }
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

        if (this.trace) {
            this.port.postMessage(this.traceLogs)
            this.traceLogs.length = 0
        }
        // (Only now, so the card being replaced doesn't do the skipping.)
        this.skipping = skip
    }

    process(inputs, outputs, parameters) {
        if (this.wasm === undefined) return true

        // Support new, short export name ("p") or legacy name ("process") for old cards.
        const process = this.wasm.exports.p ?? this.wasm.exports.process
        const speakers = outputs[0]

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
        let made = speakers[0].length
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
