import { useEffect, useRef, useState } from 'react'
import './App.css'
import QRCode from "qrcode"
import { encode, decode } from "./base43Encoder"
import loadWabt from "../wabt"
import Play from "pixelarticons/svg/play.svg?react"
import Pause from "pixelarticons/svg/pause.svg?react"
import Prev from "pixelarticons/svg/prev.svg?react"
import Clock from "pixelarticons/svg/clock.svg?react"
import Dice from "pixelarticons/svg/dice.svg?react"

function generateSeed() {
    return Math.floor(Math.random() * Math.pow(2, 32))
}

function formatSeed(seed: number) {
    return seed.toString(16).padStart(8, "0")
}

function formatTime(seconds: number) {
    seconds = Math.floor(seconds)
    let minutes = Math.floor(seconds / 60)
    seconds -= minutes * 60
    const hours = Math.floor(minutes / 60)
    if (hours === 0) {
        return `${minutes}:${seconds.toString().padStart(2, "0")}`
    }
    minutes -= hours * 60
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
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

function Listen({ qrCanvas, title, size, seed, state, setState, time, reset }) {
    const bigIconStyle = { height: "48px", verticalAlign: "middle" }
    const smallIconStyle = { height: "24px", verticalAlign: "middle" }
    return <>
        <canvas ref={qrCanvas} style={{ imageRendering: "pixelated", padding: "0 20px" }}></canvas><br /> {/* probably want this to be a constant size regardless of QR code version, for mobile UI */}
        <h2 style={{ fontFamily: "sysfont" }}>{title} | {size} bytes</h2>
        <div className="play-controls" style={{ display: "flex", textAlign: "left", justifyContent: "center", alignItems: "center", marginBottom: "1em", fontSize: "24px" }}>
            <div><Clock style={smallIconStyle} /> <span style={{ verticalAlign: "middle", display: "inline-block", width: "2.3em" }}>{formatTime(time)}</span></div>
            <button onClick={reset}><Prev style={bigIconStyle} /></button>
            <button id="start" onClick={() => setState(state === "playing" ? "paused" : "playing")}>{state === "playing" ? <Pause style={bigIconStyle} /> : <Play style={bigIconStyle} />}</button>
            {/* TODO: allow user to specify seed, possibly share somehow */}
            <span><Dice style={smallIconStyle} /> <span style={{ verticalAlign: "middle", textAlign: "left", display: "inline-block", width: "4.6em" }}>{formatSeed(seed)}</span></span>
        </div>
    </>
}
const Scan = () => "TODO"
const About = () => "It's ScoreCard! (TODO)"

function Create({ assemble, wat, setWAT }) {
    return <>
        <textarea style={{ width: "40em", height: "40em", maxWidth: "100%" }} value={wat} onChange={e => setWAT(e.target.value)}></textarea><br />
        <button id="assemble" onClick={assemble}>Assemble!</button><br />
    </>
}

function App() {
    const [title, setTitle] = useState("untitled")
    const [size, setSize] = useState(0)
    const [seed, setSeed] = useState(0)
    const [wat, setWAT] = useState("")
    const [link, setLink] = useState("")
    const [download, setDownload] = useState("")
    const [state, _setState] = useState("stopped")
    const [time, setTime] = useState(0)
    const encoded = new URLSearchParams(window.location.search).get("c")
    const [tab, setTab] = useState(encoded ? 0 : 3)
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
        // Workaround: don't let `QRCode.toCanvas` mangle our styles.
        const style = qrCanvas.current!.style.cssText
        QRCode.toCanvas(qrCanvas.current, url, { errorCorrectionLevel: "L", scale: 1, margin: 0 })
        qrCanvas.current!.style.cssText = style
        window.history.pushState(null, "", url)
        setLink(url)
        setDownload(window.URL.createObjectURL(new Blob([buffer])))
        setTab(0)
    }

    const reset = () => {
        node.port.postMessage({ cmd: "reset", seed })
    }

    const setState = (_state: "playing" | "paused") => {
        console.log("hey", _state)
        if (_state === "playing") {
            if (context.state === "suspended") context.resume()
            let _seed = seed
            if (state === "stopped") {
                _seed = generateSeed()
                setSeed(_seed)
            }
            node.port.postMessage({ cmd: "play", seed: _seed })
        } else if (_state === "paused") {
            node.port.postMessage({ cmd: "pause" })
        }
        _setState(_state)
    }

    const onDrop = async (e: DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer!.files[0]
        const arrayBuffer = await file.arrayBuffer()
        loadBinary(new Uint8Array(arrayBuffer))
        return false
    }

    useEffect(() => {
        if (encoded) {
            const buffer = decode(encoded.replace(/ /g, "+"))
            loadBinary(buffer)
        }
    }, [])

    useEffect(() => {
        document.addEventListener("drop", onDrop)
        return () => document.removeEventListener("drop", onDrop)
    }, [])

    useEffect(() => {
        node.port.onmessage = e => setTime(e.data / 44100)
        return () => { node.port.onmessage = () => {} }
    }, [])

    // TODO: "load example" link
    // useEffect(() => {
    //     (async () => {
    //         const source = await (await fetch("test.wat")).text()
    //         console.log("loaded WAT source:", source)
    //         setWAT(source)
    //     })();
    // } , [])

    const tabs = [
        { name: "Listen", component: <Listen {...{qrCanvas, title, size, seed, state, setState, time, reset}} /> },
        { name: "Scan", component: <Scan /> },
        { name: "Create", component: <Create {...{assemble, wat, setWAT}} /> },
        { name: "About", component: <About /> },
    ]

    // TODO: show welcome info if there's no QR code in the URL
    return <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", maxWidth: "520px", margin: "auto", backgroundColor: "white", borderTop: "1px solid black" }}>
        {/* <h1><a href="/" style={{ color: "black", fontFamily: "sysfont" }}>ScoreCard</a></h1> TODO: cool QRish logo */}
        <div style={{ borderLeft: "1px solid black", borderRight: "1px solid black", margin: "0 -1px" }}>
            <h1 style={{ margin: "24px 20px" }}><a href="/"><img src="logo.png" style={{ imageRendering: "pixelated", width: "100%" }} /></a></h1>
            <div style={{ display: "flex" }}>
                {tabs.map(({ component }, index) =>
                    <div style={{ display: "flex", flexDirection: "column", visibility: index === tab ? "visible" : "hidden", width: "100%", marginRight: "-100%" }}>{component}</div>
                )}
            </div>
        </div>
        {/* {tabs[tab].component} */}
        <div className="tabs" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ borderTop: "1px solid black", flexGrow: "1", alignSelf: "stretch" }}></div>
            {tabs.map(({ name }, index) =>
                <button className={index === tab ? "active" : ""} onClick={() => setTab(index)}>{name}</button>
            )}
            <div style={{ borderTop: "1px solid black", flexGrow: "1", alignSelf: "stretch" }}></div>
        </div>
        {/* <a href={link}>Link</a><br /> */}
        {/* <a download="a.wasm" href={download}>Download</a> */}
    </div>
}

export default App
