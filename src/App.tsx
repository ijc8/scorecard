import { useEffect, useRef, useState } from 'react'
import './App.css'
import QRCode from "qrcode"
import { encode, decode } from "./base43Encoder"
import loadWabt from "../wabt"

function generateSeed() {
    return Math.floor(Math.random() * Math.pow(2, 32))
}

const context = new AudioContext({ sampleRate: 44100 })
console.log(context.sampleRate)

await context.audioWorklet.addModule("worklet.js")
console.log("added module")
const node = new AudioWorkletNode(context, "custom-processor")
node.connect(context.destination)
console.log("created and connected node")

// For iOS screen-lock, (TODO: Consider NoSleep.js.)
context.onstatechange = () => {
    if (context.state === "suspended") {
        context.resume()
    }
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

const wabt = await loadWabt()

function App() {
    const [title, setTitle] = useState("untitled")
    const [size, setSize] = useState(0)
    const [seed, setSeed] = useState("")
    const [wat, setWAT] = useState("")
    const [link, setLink] = useState("")
    const [download, setDownload] = useState("")
    const qrCanvas = useRef<HTMLCanvasElement>(null)

    const assemble = () => {
        console.log("assembling", wat)
        console.log("text size", wat.length)
        // const buffer = compile(textarea.value)
        const result = wabt.parseWat("main.wasm", wat).toBinary({})
        console.log(result.log)
        loadBinary(result.buffer)
    }

    const loadBinary = (buffer: Uint8Array) => {
        console.log("disassembling")
        const disassembled = wabt.readWasm(buffer, { readDebugNames: true })
        disassembled.applyNames()
        setWAT(disassembled.toText({ foldExprs: false, inlineExport: true }))

        setSize(buffer.length)
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
            setTitle(title)
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
        QRCode.toCanvas(qrCanvas.current, url, { errorCorrectionLevel: "L" })
        // TODO: update URL in address bar as well?
        setLink(url)
        setDownload(window.URL.createObjectURL(new Blob([buffer])))
    }

    const start = () => {
        if (context.state === "suspended") context.resume()
        const seed = generateSeed()
        node.port.postMessage({ cmd: "start", seed })
        setSeed(seed + "") // TODO: show in nicer form (hex? b64? tiny QR code??)
    }

    const onDrop = async (e: DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer!.files[0]
        const arrayBuffer = await file.arrayBuffer()
        loadBinary(new Uint8Array(arrayBuffer))
        return false
    }

    useEffect(() => {
        const encoded = new URLSearchParams(window.location.search).get("s")
        if (encoded) {
            const buffer = decode(encoded.replace(/ /g, "+"))
            loadBinary(buffer)
        }
    }, [])

    useEffect(() => {
        document.addEventListener("drop", onDrop)
        return () => document.removeEventListener("drop", onDrop)
    }, [])

    // TODO: "load example" link
    // useEffect(() => {
    //     (async () => {
    //         const source = await (await fetch("test.wat")).text()
    //         console.log("loaded WAT source:", source)
    //         setWAT(source)
    //     })();
    // } , [])

    // TODO: show welcome info if there's no QR code in the URL
    return <div>
        <h1>SCORECARD</h1> {/* TODO: cool QRish logo */}
        <canvas ref={qrCanvas}></canvas><br /> {/* probably want this to be a constant size regardless of QR code version, for mobile UI */}
        <h2>{title} | {size} bytes</h2>
        <button id="start" onClick={start}>Start</button><br />
        <input type="text" value={seed} readOnly={true} /><br />{/* TODO: allow user to specify seed, possibly share somehow */}
        <textarea style={{ width: "40em", height: "40em" }} value={wat} onChange={e => setWAT(e.target.value)}></textarea><br />
        <button id="assemble" onClick={assemble}>Assemble!</button><br />
        <a href={link}>Link</a><br />
        <a download="a.wasm" href={download}>Download</a>
    </div>
}

export default App
