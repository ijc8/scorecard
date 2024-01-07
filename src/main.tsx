import QRCode from "qrcode"
import { encode, decode } from "./base43Encoder"
import loadWabt from "../wabt"

// document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
//     <div>
//         <h1 id="title">untitled</h1>
//         <textarea style="width: 80em; height: 40em"></textarea><br>
//         <button id="assemble">Assemble!</button><br>
//         <button id="start">Start</button><br>
//         <canvas></canvas><br>
//         <a id="link">Link</a><br>
//         <a id="download" download="a.wasm">Download</a>
//     </div>
// `

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

const context = new AudioContext({ sampleRate: 44100 })
console.log(context.sampleRate)

function generateSeed() {
    return Math.floor(Math.random() * Math.pow(2, 32))
}

function profile(instance: WebAssembly.Instance) {
    if (instance.exports.setup) {
        const seed = generateSeed()
        const setup = instance.exports.setup as ((s: number) => void)
        const start = performance.now()
        setup(seed)
        const end = performance.now()
        console.log("setup:", end - start, "ms")
    }
    const process = instance.exports.process as (() => number)
    const start = performance.now()
    for (let i = 0; i < 44100; i++) {
        process()
    }
    const end = performance.now()
    console.log("process:", end - start, "ms", (end - start) / 1000, "frac", 1000 / (end - start), "mult")
}

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

    document.querySelector<HTMLButtonElement>("#start")!.onclick = () => {
        node.port.postMessage({ cmd: "start", seed: generateSeed() })
    }

    const loadBinary = (buffer: Uint8Array) => {
        console.log("disassembling")
        const disassembled = wabt.readWasm(buffer, { readDebugNames: true })
        disassembled.applyNames()
        const wast = disassembled.toText({ foldExprs: false, inlineExport: true })
        textarea.value = wast

        console.log("binary size", buffer.length)
        const module = new WebAssembly.Module(buffer)
        console.log("loaded wasm", module)
        const instance = new WebAssembly.Instance(module)
        profile(instance)
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
        node.port.postMessage({ cmd: "loadModule", buffer })
        // Generate QR code
        const url = window.location.origin + window.location.pathname + "?s=" + encode(buffer)
        console.log(url)
        console.log("URL length:", url.length)
        console.log("QR version:", QRCode.create(url, { errorCorrectionLevel: "L" }).version)
        QRCode.toCanvas(document.querySelector("canvas")!, url, { errorCorrectionLevel: "L" })
        document.querySelector<HTMLAnchorElement>("#link")!.href = url
        document.querySelector<HTMLAnchorElement>("#download")!.href = window.URL.createObjectURL(new Blob([buffer]))
    }

    const wabt = await loadWabt()

    const assemble = () => {
        console.log("assembling", textarea.value)
        console.log("text size", textarea.value.length)
        // const buffer = compile(textarea.value)
        const result = wabt.parseWat("main.wasm", textarea.value).toBinary({})
        console.log(result.log)
        loadBinary(result.buffer)
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
