import { compile } from "watr"
import QRCode from "qrcode"
import { encode, decode } from "./base43Encoder"

import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <div>
        <h1 id="title">untitled</h1>
        <textarea style="width: 80em; height: 40em"></textarea><br>
        <button id="assemble">Assemble!</button><br>
        <button id="reset">Reset</button><br>
        <canvas></canvas><br>
        <a id="link">Link</a><br>
        <a id="download" download="a.wasm">Download</a>
    </div>
`

const context = new AudioContext()

async function setupAudio() {
    const encoded = new URLSearchParams(window.location.search).get("s")?.replace(/ /g, "+")
    const source = await (await fetch("test.wat")).text()
    console.log("loaded WAT source:", source)
    const textarea = document.querySelector("textarea")!
    textarea.value = source

    // For iOS screen-lock, (TODO: Consider NoSleep.js.)
    context.onstatechange = () => {
        if (context.state === "suspended") {
            context.resume()
        }
    }

    if (context.state === "suspended") {
        await new Promise(resolve => {
            document.onclick = () => context.resume().then(resolve)
        })
        document.onclick = null
    }
    await context.audioWorklet.addModule("worklet.js")
    const node = new AudioWorkletNode(context, "custom-processor")
    node.connect(context.destination)

    document.querySelector<HTMLButtonElement>("#reset")!.onclick = () => {
        node.port.postMessage("reset")
    }

    const loadBinary = (buffer: Uint8Array) => {
        console.log("binary size", buffer.length)
        const module = new WebAssembly.Module(buffer)
        console.log("loaded wasm", module)
        const instance = new WebAssembly.Instance(module)
        const start = performance.now()
        for (let i = 0; i < 44100; i++) {
            (instance.exports.process as any)()
        }
        const end = performance.now()
        console.log("ms", end - start, "frac", (end - start) / 1000, "mult", 1000 / (end - start))
        // Load program title
        if (instance.exports.title) {
            const startPtr: number = (instance.exports.title as WebAssembly.Global).value
            const mem = (instance.exports.memory as WebAssembly.Memory).buffer
            const heap = new Uint8Array(mem)
            let endPtr = startPtr;
            while (heap[endPtr] != 0 && endPtr < heap.length) endPtr++
            const title = (new TextDecoder()).decode(new Uint8Array(mem, startPtr, endPtr - startPtr))
            console.log(title)
            document.querySelector("#title")!.textContent = title
        }
        // Send to AudioWorklet
        // Doesn't work in iOS Safari...
        // node.port.postMessage(module)
        node.port.postMessage(buffer)
        // Generate QR code
        const url = window.location.origin + window.location.pathname + "?s=" + encode(buffer)
        console.log(url)
        console.log("URL length:", url.length)
        console.log("QR version:", QRCode.create(url, { errorCorrectionLevel: "L" }).version)
        QRCode.toCanvas(document.querySelector("canvas")!, url, { errorCorrectionLevel: "L" })
        document.querySelector<HTMLAnchorElement>("#link")!.href = url
        document.querySelector<HTMLAnchorElement>("#download")!.href = window.URL.createObjectURL(new Blob([buffer]))
    }

    const assemble = () => {
        console.log("assembling", textarea.value)
        console.log("text size", textarea.value.length)
        const buffer = compile(textarea.value)
        loadBinary(buffer)
    }
    document.querySelector<HTMLButtonElement>("#assemble")!.onclick = assemble

    document.ondrop = async e => {
        e.preventDefault()
        const file = e.dataTransfer!.files[0]
        const arrayBuffer = await file.arrayBuffer()
        loadBinary(new Uint8Array(arrayBuffer))
        return false
    }

    if (encoded) {
        const buffer = decode(encoded)
        loadBinary(buffer)
    } else {
        assemble()
    }
}

setupAudio()
