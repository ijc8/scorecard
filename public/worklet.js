class CustomProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.port.onmessage = async e => {
            console.log("received", e.data)
            if (e.data.cmd === "loadModule") {
                this.module = new WebAssembly.Module(e.data.buffer)
            } else if (e.data.cmd === "start") {
                this.wasm = await WebAssembly.instantiate(this.module)
                if (this.wasm.exports.setup) {
                    this.wasm.exports.setup(e.data.seed)
                }
            }
        }
    }

    process(inputs, outputs, parameters) {
        if (this.wasm === undefined) return true

        const process = this.wasm.exports.process
        const speakers = outputs[0]

        for (let i = 0; i < speakers[0].length; i++) {
            const x = process()
            for (const channel of speakers) {
                channel[i] = x
            }
        }

        return true
    }
}

registerProcessor("custom-processor", CustomProcessor)
