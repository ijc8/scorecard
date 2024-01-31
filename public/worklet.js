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
        if (this.trace) {
            const traceLogs = []
            this.traceLogs = traceLogs
            this.wasm = await WebAssembly.instantiate(this.module, {
                scorecard: { log(i) { traceLogs[i] = (traceLogs[i] ?? 0) + 1 } }
            })
            if (this.wasm.exports.setup) {
                this.wasm.exports.setup(seed)
                this.port.postMessage(traceLogs)
                traceLogs.length = 0
            }
        } else {
            this.traceLogs = null
            this.wasm = await WebAssembly.instantiate(this.module)
            if (this.wasm.exports.setup) {
                this.wasm.exports.setup(seed)
            }
        }
    }

    process(inputs, outputs, parameters) {
        if (this.wasm === undefined || !this.playing) return true

        const process = this.wasm.exports.process
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
            if (this.traceLogs) {
                this.port.postMessage(this.traceLogs)
                this.traceLogs.length = 0
            }
        }

        return true
    }
}

registerProcessor("custom-processor", CustomProcessor)
