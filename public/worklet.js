class CustomProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.port.onmessage = async e => {
            console.log("received", e.data)
            if (e.data === "reset") {
                if (this.module) {
                    this.wasm = await WebAssembly.instantiate(this.module)
                }
            } else {
                const module = new WebAssembly.Module(e.data)
                console.log(WebAssembly.Module.exports(module))
                console.log(WebAssembly.Module.imports(module))
                this.module = module
                this.wasm = await WebAssembly.instantiate(module)
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
