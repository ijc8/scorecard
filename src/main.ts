import { compile } from "watr"

import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <div>
        <textarea style="width: 80em; height: 40em"></textarea><br>
        <button>Assemble!</button>
    </div>
`

const context = new AudioContext()

async function setupAudio() {
    const source = await (await fetch("test.wat")).text()
    console.log("loaded WAT source:", source)
    const textarea = document.querySelector("textarea")!
    textarea.value = source

    if (context.state === "suspended") {
        await new Promise(resolve => {
            document.onclick = () => context.resume().then(resolve)
        })
        document.onclick = null
    }
    await context.audioWorklet.addModule("worklet.js")
    const node = new AudioWorkletNode(context, "custom-processor")
    node.connect(context.destination)

    const assemble = () => {
        console.log("assembling", textarea.value)
        const buffer = compile(textarea.value)
        console.log("binary size", buffer.length)
        const module = new WebAssembly.Module(buffer)
        // const module = await WebAssembly.compileStreaming(fetch("test.wasm"))
        console.log("loaded wasm", module)
        node.port.postMessage(module)
    }
    document.querySelector("button")!.onclick = assemble
    assemble()
}

setupAudio()
