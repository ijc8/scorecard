class CustomProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.playing = false
        this.pos = 0
        this.port.onmessage = async e => {
            console.log("received", e.data)
            if (e.data.cmd === "loadModule") {
                this.module = new WebAssembly.Module(e.data.buffer)
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
        this.wasm = await WebAssembly.instantiate(this.module)
        if (this.wasm.exports.setup) {
            this.wasm.exports.setup(seed)
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
        if (this.pos % 1024) {
            this.port.postMessage(this.pos)
        }

        return true
    }
}

registerProcessor("custom-processor", CustomProcessor)
