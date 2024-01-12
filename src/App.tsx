import { useEffect, useRef, useState } from 'react'
import './App.css'
import QRCode from "qrcode"
import { encodeBlob, decodeBlob, encode, decode } from "./base43Encoder"
import loadWabt from "../wabt"
import Play from "pixelarticons/svg/play.svg?react"
import Pause from "pixelarticons/svg/pause.svg?react"
import Prev from "pixelarticons/svg/prev.svg?react"
import Clock from "pixelarticons/svg/clock.svg?react"
import Dice from "pixelarticons/svg/dice.svg?react"
import CloseBox from "pixelarticons/svg/close-box.svg?react"
import Downasaur from "pixelarticons/svg/downasaur.svg?react"
import Flatten from "pixelarticons/svg/flatten.svg?react"
// Alternative icons for "TOO BIG":
// import Alert from "pixelarticons/svg/alert.svg?react"
// import Loader from "pixelarticons/svg/loader.svg?react"
import Subscriptions from "pixelarticons/svg/subscriptions.svg?react"
import { Html5QrcodePlugin } from "./Html5QrcodePlugin"


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

function SeedInput({ seed, setSeed }) {
    const [contents, setContents] = useState("")
    useEffect(() => {
        setContents(formatSeed(seed))
    }, [seed])

    const submit = () => {
        if (/^[0-9A-Fa-f]+$/.test(contents) && contents.length <= 8) {
            setSeed(parseInt(contents, 16))
        } else {
            setContents(formatSeed(seed))
        }
    }

    return <input type="text" value={contents} style={{
            border: "none",
            display: "inline-block",
            fontFamily: "inherit",
            fontSize: "inherit",
            padding: "none",
            width: "4.6em",
            verticalAlign: "middle",
            textAlign: "left",
        }} 
        onChange={e => setContents(e.target.value)}
        onKeyUp={e => {
            if (e.key === "Enter") {
                submit()
                ;(e.target as HTMLElement).blur()
            }
        }}
        onBlur={submit}
    />
}

function Listen({ qrCanvas, title, size, seed, setSeed, seedLock, setSeedLock, state, setState, time, reset, error }) {
    const bigIconStyle = { height: "48px", verticalAlign: "middle" }
    const smallIconStyle = { height: "24px", verticalAlign: "middle" }
    const DiceIcon = seedLock ? CloseBox : Dice
    return <>
        <div style={{ position: "relative" }}>
            {error && <div style={{ position: "absolute", padding: "0 20px", fontSize: "48px", height: "100%", width: "100%" }}>
                <div style={{ border: "16px solid black", height: "100%", lineHeight: 1, display: "flex", flexDirection: "column", justifyContent: "space-evenly" }}>
                    <div><span style={{ fontSize: "96px", verticalAlign: "top" }}>TOO BIG</span> <Subscriptions style={{ height: "96px" }} /><br/></div>
                    <div><span style={{ fontSize: "56px", verticalAlign: "top" }}>Can't encode!</span> <Downasaur style={{ height: "56px" }} /></div>
                    <div><span style={{ fontSize: "52px", verticalAlign: "top" }}>Shrink binary.</span> <Flatten style={{ height: "56px" }} /></div>
                </div>
                </div>}
            <canvas ref={qrCanvas} style={{ imageRendering: "pixelated", padding: "0 20px", visibility: error ? "hidden" : "inherit", width: "100%" }} width="1" height="1"></canvas>
        </div>
        <h2 style={{ userSelect: "none" }}>{title} | {size} bytes {/* TODO: add link and perhaps download buttons with icons */}</h2>
        <div className="play-controls" style={{ display: "flex", textAlign: "left", justifyContent: "center", alignItems: "center", marginBottom: "1em", fontSize: "24px" }}>
            <div style={{ userSelect: "none" }}><Clock style={smallIconStyle} /> <span style={{ verticalAlign: "middle", display: "inline-block", width: "2.3em" }}>{formatTime(time)}</span></div>
            <button onClick={reset}><Prev style={bigIconStyle} /></button>
            <button id="start" onClick={() => setState(state === "playing" ? "paused" : "playing")}>{state === "playing" ? <Pause style={bigIconStyle} /> : <Play style={bigIconStyle} />}</button>
            {/* TODO: allow user to specify seed, possibly share somehow */}
            <span>
                <button><DiceIcon style={smallIconStyle} onClick={() => setSeedLock(!seedLock)} /></button>
                <span style={{ userSelect: "none" }}>{" "}</span>
                <SeedInput {...{seed, setSeed}} />
            </span>
        </div>
    </>
}

function Scan({ onScan }) {
    const qrCodeSuccessCallback = (data: string) => {
        console.log("scanned", data)
        if (!onScan(data)) {
            console.log("not a valid scorecard URL") // TODO: show error somewhere
        }
    }
    // TODO: make UI size/position more consistent
    // TODO: stop scanning upon tab switch
    return <Html5QrcodePlugin
        fps={10}
        qrbox={250}
        disableFlip={false}
        qrCodeSuccessCallback={qrCodeSuccessCallback}
    />
}

function About() {
    return <div style={{ fontSize: "18px", textAlign: "left", padding: "0 32px" }}>
            <span style={{ fontSize: "20px" }}><img src="logo.png" height="16" style={{ paddingRight: "0.12em" }} /> is a player for "score cards": QR codes containing tiny generative music programs.</span> A score card looks like this:
            <p>TODO embed demos</p>
            Each QR code contains a valid URL (linking to this web app, the score card player) and an entire audio-generating WebAssembly program. Because the QR code contains the piece itself, even if the link breaks, the code can still be read and played back by an instance of the ScoreCard player hosted somewhere else, or by a player that runs outside of the browser.
            <p>This also implies that piece must fit in a QR code, implying an max executable size of just 2,953 bytes (more like 2,900 bytes after encoding it in a URL).</p>
            <p>To get started, <a href="#TODO" style={{ textDecoration: "underline" }}>Scan</a> a score card or <a href="#TODO" style={{ textDecoration: "underline" }}>Create</a> one.</p>
            <p>Happy hacking & joyful jamming!<br/>- ijc</p>
    </div>
}

function Create({ assemble, wat, setWAT }) {
    return <>
        <textarea style={{ width: "40em", height: "40em", maxWidth: "100%" }} value={wat} onChange={e => setWAT(e.target.value)}></textarea><br />
        <button id="assemble" onClick={assemble}>Assemble!</button><br />
    </>
}

const NO_TITLE = "untitled"

function App() {
    const [title, setTitle] = useState(NO_TITLE)
    const [size, setSize] = useState(0)
    const [seed, setSeed] = useState(0)
    const [seedLock, setSeedLock] = useState(false)
    const [wat, setWAT] = useState("")
    const [link, setLink] = useState("")
    const [download, setDownload] = useState("")
    const [state, _setState] = useState("stopped")
    const [time, setTime] = useState(0)
    const [error, setError] = useState(false)
    const encoded = new URLSearchParams(window.location.search).get("c")
    const [tab, setTab] = useState(encoded ? 1 : 3)
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
            console.log("Loaded title", title, "from", startPtr, "to", endPtr)
            setTitle(title)
        } else {
            setTitle(NO_TITLE)
        }
        // Send to AudioWorklet
        // Doesn't work in iOS Safari...
        // node.port.postMessage(module)
        node.port.postMessage({ cmd: "loadModule", buffer })
        // Generate QR code
        const prefix = window.location.origin + window.location.pathname
        const seedParam = seedLock ? `s=${encode(BigInt(seed))}&` : ""
        console.log(seedLock, seedParam)
        const url = `${prefix}?${seedParam}c=${encodeBlob(buffer)}`
        console.log(url)
        console.log("URL length:", url.length)
        const canvas = qrCanvas.current!
        // Workaround: don't let `QRCode.toCanvas` mangle our styles.
        const style = canvas.style.cssText
        try {
            console.log("QR version:", QRCode.create(url, { errorCorrectionLevel: "L" }).version)
            QRCode.toCanvas(canvas, url, { errorCorrectionLevel: "L", scale: 1, margin: 0 })
            setError(false)
        } catch {
            setError(true)
        }
        canvas.style.cssText = style
        window.history.pushState(null, "", url)
        setLink(url)
        setDownload(window.URL.createObjectURL(new Blob([buffer])))
        setTab(0)
    }

    const reset = () => {
        let _seed = seed
        if (!seedLock) {
            _seed = generateSeed()
            setSeed(_seed)
        }
        setTime(0)
        node.port.postMessage({ cmd: "reset", seed: _seed })
    }

    const setState = (_state: "playing" | "paused") => {
        console.log("hey", _state)
        if (_state === "playing") {
            if (context.state === "suspended") context.resume()
            let _seed = seed
            if (state === "stopped" && !seedLock) {
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

    const onScan = (data: string) => {
        // Return value indicates whether the string contains a valid ScoreCard URL.
        // TODO: More validity checks (does the param contain valid base43? do the bytes contain valid wasm?)
        let url
        try {
            url = new URL(data)
        } catch {
            return false
        }
        const encodedBlob = url.searchParams.get("c")
        if (!encodedBlob) return false

        const encodedSeed = url.searchParams.get("s")
        if (encodedSeed) {
            setSeed(Number(decode(encodedSeed)))
            setSeedLock(true)
        }
        if (encodedBlob) {
            const buffer = decodeBlob(encodedBlob.replace(/ /g, "+"))
            loadBinary(buffer)
            return true
        }
        return false
    }

    useEffect(() => {
        onScan(window.location.href)
    }, [])

    useEffect(() => {
        document.addEventListener("drop", onDrop)
        return () => document.removeEventListener("drop", onDrop)
    }, [onDrop])

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
        { name: "Listen", component: <Listen {...{qrCanvas, title, size, seed, setSeed, seedLock, setSeedLock, state, setState, time, reset, error}} /> },
        { name: "Scan", component: <Scan {...{onScan}} /> },
        { name: "Create", component: <Create {...{assemble, wat, setWAT}} /> },
        { name: "About", component: <About /> },
    ]

    // TODO: show welcome info if there's no QR code in the URL
    return <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", maxWidth: "520px", margin: "auto", backgroundColor: "white", borderTop: "1px solid black" }}>
        <div style={{ borderLeft: "1px solid black", borderRight: "1px solid black", margin: "0 -1px" }}>
            <h1 style={{ margin: "24px 20px" }}><a href="/"><img src="logo.png" style={{ imageRendering: "pixelated", width: "100%" }} /></a></h1>
            <div style={{ display: "flex" }}>
                {tabs.map(({ component }, index) =>
                    <div style={{ display: "flex", flexDirection: "column", visibility: index === tab ? "visible" : "hidden", width: "100%", marginRight: "-100%" }}>{component}</div>
                )}
            </div>
        </div>
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
