class CustomProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.port.onmessage = async e => {
            this.wasm = await WebAssembly.instantiate(e.data)
        }
    }

    process(inputs, outputs, parameters) {
        if (this.wasm === undefined) return true

        const process = this.wasm.exports.process
        const speakers = outputs[0]

        let t = 0
        for (let i = 0; i < speakers[0].length; i++) {
            const x = process(t)
            t += 1/128
            for (const channel of speakers) {
                channel[i] = x
            }
        }

        return true
    }
}

registerProcessor("custom-processor", CustomProcessor)
