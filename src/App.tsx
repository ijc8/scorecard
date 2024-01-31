import { RefObject, memo, useEffect, useRef, useState } from 'react'
import './App.css'
import QRCode from "qrcode"
import { encodeBlob, decodeBlob, encode, decode } from "./base43Encoder"
import Play from "pixelarticons/svg/play.svg?react"
import Pause from "pixelarticons/svg/pause.svg?react"
import Prev from "pixelarticons/svg/prev.svg?react"
import Clock from "pixelarticons/svg/clock.svg?react"
import Dice from "pixelarticons/svg/dice.svg?react"
import CloseBox from "pixelarticons/svg/close-box.svg?react"
import Downasaur from "pixelarticons/svg/downasaur.svg?react"
import Flatten from "pixelarticons/svg/flatten.svg?react"
// Alternative icon for "TOO BIG":
// import Loader from "pixelarticons/svg/loader.svg?react"
import Alert from "pixelarticons/svg/alert.svg?react"
import Subscriptions from "pixelarticons/svg/subscriptions.svg?react"
import Camera from "pixelarticons/svg/camera.svg?react"
import EditBox from "pixelarticons/svg/edit-box.svg?react"
import DragAndDrop from "pixelarticons/svg/drag-and-drop.svg?react"
import Bullseye from "pixelarticons/svg/bullseye.svg?react"
import BullseyeArrow from "pixelarticons/svg/bullseye-arrow.svg?react"
import { Html5QrcodePlugin } from "./Html5QrcodePlugin"
import logoUrl from "./assets/logo.png"
import exampleCardUrl from "./assets/example-card.png"
import { TraceMap, instrumentWasm } from "./wasmTracer"
import { getWabt } from './lazyWabt'

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

const nodePromise = context.audioWorklet.addModule("worklet.js").then(() => {
    console.log("added module")
    const node = new AudioWorkletNode(context, "custom-processor")
    node.connect(context.destination)
    console.log("created and connected node")
    return node
})

async function sendToWorklet(message: any) {
    const node = await nodePromise
    node.port.postMessage(message)
}

// For iOS screen-lock:
context.onstatechange = () => {
    if (context.state === "suspended") {
        context.resume()
    }
}

// https://stackoverflow.com/questions/9038625/detect-if-device-is-ios
function iOS() {
    return [
        'iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod'
    ].includes(navigator.platform)
        // iPad on iOS 13 detection
        || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
}

// For iOS quirk in which Web Audio is treated like a ringer while audio tags are treated like media:
// (See https://stackoverflow.com/questions/21122418/ios-webaudio-only-works-on-headphones/46839941#46839941)
function unmute() {
    if (!iOS()) return
    const silenceDataURL = "data:audio/mp3;base64,//MkxAAHiAICWABElBeKPL/RANb2w+yiT1g/gTok//lP/W/l3h8QO/OCdCqCW2Cw//MkxAQHkAIWUAhEmAQXWUOFW2dxPu//9mr60ElY5sseQ+xxesmHKtZr7bsqqX2L//MkxAgFwAYiQAhEAC2hq22d3///9FTV6tA36JdgBJoOGgc+7qvqej5Zu7/7uI9l//MkxBQHAAYi8AhEAO193vt9KGOq+6qcT7hhfN5FTInmwk8RkqKImTM55pRQHQSq//MkxBsGkgoIAABHhTACIJLf99nVI///yuW1uBqWfEu7CgNPWGpUadBmZ////4sL//MkxCMHMAH9iABEmAsKioqKigsLCwtVTEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVV//MkxCkECAUYCAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV"
    const tag = document.createElement("audio")
    tag.controls = false
    tag.preload = "auto"
    tag.loop = true
    tag.src = silenceDataURL
    tag.play()
}

// function profile(instance: WebAssembly.Instance) {
//     if (instance.exports.setup) {
//         const seed = generateSeed()
//         const setup = instance.exports.setup as ((s: number) => void)
//         const start = performance.now()
//         setup(seed)
//         const end = performance.now()
//         console.log("setup:", end - start, "ms")
//     }
//     const process = instance.exports.process as (() => number)
//     const start = performance.now()
//     for (let i = 0; i < 44100; i++) {
//         process()
//     }
//     const end = performance.now()
//     console.log("process:", end - start, "ms", (end - start) / 1000, "frac", 1000 / (end - start), "mult")
// }

function SeedInput({ seed, setSeed }: any) {
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

// TODO: Specify types
function Listen({ qrCanvas, title, size, seed, setSeed, seedLock, setSeedLock, state, setState, time, reset, error, buffer: binary, tracing, setTracing }: {
    qrCanvas: RefObject<HTMLCanvasElement>, title: string, size: number, seed: number, setSeed: (s: number) => void, seedLock: boolean,
    setSeedLock: (l: boolean) => void, state: any, setState: any, time: number, reset: any, error: any, buffer: Uint8Array | null,
    tracing: boolean, setTracing: (t: boolean) => void,
}) {
    const bigIconStyle = { height: "10cqw", verticalAlign: "middle" }
    const smallIconStyle = { height: "5cqw", flexShrink: 0, verticalAlign: "middle" }
    const inlineIconStyle = { height: "11cqh", verticalAlign: "bottom" }
    const DiceIcon = seedLock ? CloseBox : Dice
    const showMessage = error || (size === 0)
    // Hacking around unwanted input latency and duplicate events... ugh.
    // We take some pains here so that reset and play/pause respond as quickly as possible,
    // so that a score card can be started in sync with others or "played" rhythmically.
    const events = useRef<any>({})
    const touchStartReset = () => {
        events.current.reset = true
        reset()
    }
    const mouseReset = () => {
        if (events.current.reset) return
        reset()
    }
    const touchStartToggle = () => {
        if (context.state === "suspended") {
            // Hack within a hack... the first time play is pressed, we need to handle it in
            // `onMouseDown` so that we can resume the AudioContext successfully.
            // (Apparently touchstart isn't good enough?)
            return
        }
        events.current.toggle = true
        togglePlay()
    }
    const mouseToggle = () => {
        if (events.current.toggle) return
        togglePlay()
    }

    // Determine initial playback delay:
    // if (t === 0 && state === "playing") {
    //     t = performance.now()
    // } else if (s === 0 && time > 1) {
    //     s = performance.now()
    //     console.log((s - t) / 1000)
    // }

    const traceCanvas = useRef<HTMLCanvasElement | null>(null)
    const draw = () => {
        if (trace && !tracing) trace.logs.length = 0
        if (!tracing || !traceCanvas.current || !binary) return
        const canvas = traceCanvas.current
        const context = canvas.getContext("2d")!
        // Arrange bits in a square
        const size = Math.ceil(Math.sqrt(binary.length * 8))
        canvas.width = size
        canvas.height = size
        const image = new ImageData(canvas.width, canvas.height)
        for (let i = 0; i < size * size; i++) {
            if (i < binary.length * 8) {
                const byte = Math.floor(i / 8)
                const bit = i % 8
                if ((binary[byte] >> bit) & 1) {
                    image.data[i*4] = 204
                    image.data[i*4+1] = 204
                    image.data[i*4+2] = 255
                    image.data[i*4+3] = 255
                }
            }
            // Byte version (one pixel per byte, instead of per bit):
            // if (i < buffer.length) {
            //     // image.data[i*4] = 204
            //     // image.data[i*4+1] = 204
            //     // image.data[i*4+2] = 255
            //     image.data[i*4+3] = buffer[i]
            // }
        }
        context.putImageData(image, 0, 0)
        if (trace && state === "playing") {
            const max = Math.max(...Object.values(trace.logs))
            trace.logs.forEach((count, id) => {
                const startByte = trace!.map[id].start.offset
                const endByte = trace!.map[id].end.offset
                for (let i = startByte * 8; i < endByte * 8; i++) {
                    // TODO: fewer calls to `fillRect`
                    const x = i % canvas.width
                    const y = Math.floor(i / canvas.width)
                    context.fillStyle = `rgba(0 255 0 / ${count / max * 40}%)`
                    context.fillRect(x, y, 1, 1)
                }
            })
        }
    }

    handleTraceLogs = (traceLogs: number[]) => {
        if (trace === null || !trace.map[traceLogs.length - 1]) return
        const oldTraceLogs = trace.logs
        trace.logs = traceLogs
        // We use `forEach` because it skips empty slots, unlike other methods.
        oldTraceLogs.forEach((count, id) => {
            trace!.logs[id] = Math.max(trace!.logs[id] ?? 0, count * 0.6)
        })
        // TODO: Highlight lines of WAT in Create tab.
        // trace.logs.forEach((count, id) => {
        //     for (let line = trace!.map[id].start.line; line < trace!.map[id].end.line; line++) {
        //         newCounts[line] = count
        //     }
        // })
        draw()
    }

    useEffect(draw, [tracing, binary])

    const togglePlay = () => { setState(state === "playing" ? "paused" : "playing") }
    const TraceIcon = tracing ? BullseyeArrow : Bullseye
    return <div>
        <div style={{ position: "relative" }}>
            {showMessage && <div style={{ position: "absolute", fontSize: "48px", height: "100%", width: "100%", userSelect: "none" }}>
                <div style={{ border: "16px solid black", height: "100%", containerType: "size", lineHeight: 1, display: "flex", flexDirection: "column", justifyContent: "space-evenly" }}>
                    {error ? <>
                        <div><span style={{ fontSize: "21cqh", verticalAlign: "top" }}>TOO BIG</span> <Subscriptions style={{ height: "21cqh" }} /></div>
                        <div><span style={{ fontSize: "12.5cqh", verticalAlign: "top" }}>Can't encode!</span> <Downasaur style={{ height: "12.5cqh" }} /></div>
                        <div><span style={{ fontSize: "11.8cqh", verticalAlign: "top" }}>Shrink binary.</span> <Flatten style={{ height: "12.5cqh" }} /></div>
                    </> : <>
                        <div><span style={{ fontSize: "23cqh" }}>No card!</span></div>
                        <div><span style={{ fontSize: "11cqh" }}>Scan <Camera style={inlineIconStyle} />, create <EditBox style={inlineIconStyle} />, or drag & drop <DragAndDrop style={inlineIconStyle} />.</span></div>
                    </>}
                </div>
            </div>}
            <canvas ref={qrCanvas} style={{ imageRendering: "pixelated", display: tracing ? "none" : "block", visibility: showMessage ? "hidden" : "inherit", width: "100%" }} width="1" height="1"></canvas>
            <canvas ref={traceCanvas} style={{ imageRendering: "pixelated", display: tracing ? "block" : "none", visibility: showMessage ? "hidden" : "inherit", width: "100%" }} width="1" height="1"></canvas>
        </div>
        <h2 style={{ userSelect: "none", margin: "20px", fontSize: "6cqw" }}>{title} | {size} bytes {/* TODO: add link and perhaps download buttons with icons */}</h2>
        <div className="play-controls" style={{ display: "flex", textAlign: "left", justifyContent: "center", alignItems: "center", fontSize: "5cqw" }}>
            <div style={{ userSelect: "none", display: "flex", alignItems: "center", width: "4em", justifyContent: "right" }}>
                <Clock style={smallIconStyle} />
                &nbsp;
                <span style={{ verticalAlign: "middle", display: "inline-block" }}>{formatTime(time)}</span>
            </div>
            <button onTouchStart={touchStartReset} onMouseDown={mouseReset} onMouseUp={() => { events.current.reset = false }} style={{ touchAction: "manipulation" }}><Prev style={bigIconStyle} /></button>
            <button id="start" onTouchStart={touchStartToggle} onMouseDown={mouseToggle} onMouseUp={() => { events.current.toggle = false }}>{state === "playing" ? <Pause style={bigIconStyle} /> : <Play style={bigIconStyle} />}</button>
            <div style={{ display: "flex", alignItems: "center", userSelect: "none" }}>
                <button style={{ fontSize: 0 }}><DiceIcon style={smallIconStyle} onClick={() => setSeedLock(!seedLock)} /></button>
                &nbsp;
                <SeedInput {...{ seed, setSeed }} />
            </div>
            <button style={{ fontSize: 0, marginRight: "-5cqw" }} onClick={() => setTracing(!tracing)}>
                <TraceIcon style={{ ...smallIconStyle }} />
            </button>
        </div>
    </div>
}

function Scan({ onScan, tab }: any) {
    const [error, setError] = useState("")
    const qrCodeSuccessCallback = (data: string) => {
        if (!onScan(data)) {
            setError("Invalid ScoreCard")
        }
    }
    useEffect(() => {
        if (tab !== 1) {
            // Reset error message on tab switch
            setError("")
        }
    }, [tab])
    return tab === 1 && <>
        <Html5QrcodePlugin
            fps={10}
            qrbox={250}
            disableFlip={false}
            qrCodeSuccessCallback={qrCodeSuccessCallback}
        />
        <div style={{ fontSize: "6cqw", display: "flex", justifyContent: "center", alignItems: "center" }}>
            {error && <Alert style={{ height: "6cqw" }} />}
            &nbsp;
            {error}
        </div>
    </>
}

const About = memo(function About({ setTab }: any) {
    // TODO: Make this text fill the card on both desktop and mobile...
    return <div id="about" style={{ textAlign: "left", padding: "0 12px", containerType: "size", height: "100%" }}>
        <div style={{ fontSize: "4cqw" }}>
            <span style={{ fontSize: "1.1em" }}>ScoreCard is a player for "score cards": QR codes containing tiny generative music programs.</span> A score card looks like this:
            <img src={exampleCardUrl} style={{ display: "block", margin: "auto", padding: "12px" }} />
            Each QR code contains a valid URL (linking to this web app, the score card player) and an entire audio-generating <a href="https://webassembly.org/">WebAssembly</a> program. Because the QR code contains the piece itself, even if the link breaks, the code can still be read and played back by an instance of the ScoreCard player hosted somewhere else, or by a player that runs outside of the browser.
            <p>This also implies that piece must fit in a QR code, implying an max executable size of just 2,953 bytes (more like 2,900 bytes after encoding it in a URL).</p>
            <p>To get started, <a href="#" onClick={() => setTab(1)} style={{ textDecoration: "underline" }}>Scan</a> a score card or <a href="#" onClick={() => setTab(2)} style={{ textDecoration: "underline" }}>Create</a> one. For more information, check out the <a href="https://github.com/ijc8/scorecard" style={{ textDecoration: "underline" }}>README</a>.</p>
            <p style={{ marginBottom: 0 }}>Happy hacking & joyful jamming!<br />- ijc</p>
        </div>
    </div>
})

function Create({ binary, loadBinary, wat, setWAT, tab }: {
    binary: Uint8Array | null, loadBinary: (b: Uint8Array) => void, wat: string, setWAT: (w: string) => void, tab: number
}) {
    const oldBinary = useRef(binary)
    useEffect(() => {
        if (tab !== 2 || !binary || binary === oldBinary.current) return
        oldBinary.current = binary
        console.log("disassembling")
        getWabt().then(wabt => {
            const disassembled = wabt.readWasm(binary, { readDebugNames: true })
            disassembled.applyNames()
            setWAT(disassembled.toText({ foldExprs: false, inlineExport: true }))
        })
    }, [binary, tab])

    const assemble = async () => {
        console.log("assembling", wat)
        console.log("text size", wat.length)
        const wabt = await getWabt()
        // TODO: Show errors.
        const result = wabt.parseWat("main.wasm", wat).toBinary({})
        console.log(result.log)
        loadBinary(result.buffer)
    }

    return <>
        <textarea style={{ width: "100%", flexGrow: "1" }} value={wat} onChange={e => setWAT(e.target.value)}></textarea><br />
        <button id="assemble" onClick={assemble}>Assemble!</button><br />
    </>
}

const NO_TITLE = "untitled"

interface TraceData {
    binary: Uint8Array
    map: TraceMap
    logs: number[]
}
let trace: TraceData | null = null

let handleTraceLogs: undefined | ((l: number[]) => void)

// TODO: Integrate this view into the Create tab (and consider renaming the tab; maybe "Hack"?).
// const Debug = memo(function Debug({ wat }: { wat: string }) {
//     const [counts, setCounts] = useState<{ [key: number]: number }>({})
//     const lines = useMemo(() => wat?.split("\n"), [wat])
//     const max = Math.max(...Object.values(counts))
//     return <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
//         <div style={{ containerType: "size", flexGrow: 1, marginBottom: "20px" }}>
//             <div style={{ textAlign: "left", width: "100%", height: "600px", whiteSpace: "pre", lineHeight: 1, fontSize: `${98 / (lines?.length ?? 1)}cqh`, display: "flex", flexFlow: "column wrap" }}>
//                 {lines && lines.map((line, index) => {
//                     const percentage = (counts[index] ?? 0) / max * 20
//                     return <div key={index} style={{ position: "relative" }}>
//                         <div style={{ position: "absolute", top: "1px", bottom: "1px", minHeight: "1px", left: `calc(-20px - ${percentage}%)`, right: "calc(20px + 100%)", backgroundColor: "#55b" }}></div>
//                         {line}
//                     </div>
//                 })}
//             </div>
//         </div>
//     </div>
// })

function App() {
    const [title, setTitle] = useState(NO_TITLE)
    const [size, setSize] = useState(0)
    const [seed, setSeed] = useState(0)
    const [seedLock, setSeedLock] = useState(false)
    const [binary, setBinary] = useState<Uint8Array | null>(null)
    const [wat, setWAT] = useState("")
    // const [link, setLink] = useState("")
    // const [download, setDownload] = useState("")
    const [state, _setState] = useState("stopped")
    const [time, setTime] = useState(0)
    const [error, setError] = useState(false)
    const encoded = new URLSearchParams(window.location.search).get("c")
    const [tab, setTab] = useState(encoded ? 0 : 3) // TODO: use an enum
    const [dragging, setDragging] = useState(false)
    const qrCanvas = useRef<HTMLCanvasElement>(null)
    const [tracing, _setTracing] = useState(false)

    const setupTracing = async (originalBinary: Uint8Array) => {
        // Instrument Wasm for execution tracing.
        const { binary, map } = await instrumentWasm(originalBinary)
        // TODO: set fixed WAT for tracing (line highlighting) in Create tab
        trace = { binary, map, logs: [] }
    }

    const loadBinary = async (binary: Uint8Array) => {
        const module = new WebAssembly.Module(binary)
        setSize(binary.length)
        console.log("loaded wasm", module)
        const instance = new WebAssembly.Instance(module)
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
        // NOTE: We send the binary here because sending the WebAssembly.Module doesn't work in iOS Safari...
        if (tracing) {
            await setupTracing(binary)
            sendToWorklet({ cmd: "loadModule", binary: trace!.binary, trace: true })
        } else {
            trace = null
            sendToWorklet({ cmd: "loadModule", binary })
        }
        setBinary(binary)
        reset()
    }
    const loadBinaryRef = useRef(loadBinary)
    loadBinaryRef.current = loadBinary

    const qrContents = useRef<any[]>([])
    useEffect(() => {
        if (!binary) return // Nothing to encode.
        const newQrContents = seedLock ? [binary, seed] : [binary]
        if (qrContents.current.length === newQrContents.length && qrContents.current.every((x, i) => x === newQrContents[i])) {
            // Nothing to do, previously-generated QR code is still correct.
            return
        }
        // Generate QR code
        const prefix = window.location.origin + window.location.pathname.replace(/\/$/, "") // trim trailing slash
        const seedParam = seedLock ? `s=${encode(BigInt(seed))}&` : ""
        console.log(seedLock, seedParam)
        const url = `${prefix}?${seedParam}c=${encodeBlob(binary)}`
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
        // setLink(url)
        // setDownload(window.URL.createObjectURL(new Blob([buffer])))
        setTab(0)
        qrContents.current = seedLock ? [binary, seed] : [binary]
    }, [binary, seed, seedLock])

    const reset = () => {
        let _seed = seed
        if (!seedLock) {
            _seed = generateSeed()
            setSeed(_seed)
        }
        setTime(0)
        sendToWorklet({ cmd: "reset", seed: _seed })
    }

    const setState = (_state: "playing" | "paused") => {
        if (_state === "playing") {
            if (context.state === "suspended") {
                unmute() // for iOS
                context.resume()
            }
            let _seed = seed
            if (state === "stopped" && !seedLock) {
                _seed = generateSeed()
                setSeed(_seed)
            }
            sendToWorklet({ cmd: "play", seed: _seed })
        } else if (_state === "paused") {
            sendToWorklet({ cmd: "pause" })
        }
        _setState(_state)
    }

    const setTracing = async (tracing: boolean) => {
        _setTracing(tracing)
        if (!binary) return
        if (tracing) {
            if (!trace) {
                await setupTracing(binary)
            }
            sendToWorklet({ cmd: "loadModule", binary: trace!.binary, trace: true })
        } else {
            sendToWorklet({ cmd: "loadModule", binary })
        }
        if (state !== "playing") reset()
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
            setSeed(Number(decode(encodedSeed.replace(/ /g, "+"))))
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
        // Support drag-and-dropping .wasm files.
        let target: EventTarget | null = null

        const drop = async (e: DragEvent) => {
            e.preventDefault()
            target = null
            setDragging(false)

            const file = e.dataTransfer!.files[0]
            const arrayBuffer = await file.arrayBuffer()
            loadBinaryRef.current(new Uint8Array(arrayBuffer))
            return false
        }
        const dragover = (e: DragEvent) => e.preventDefault()
        const dragenter = (e: DragEvent) => {
            target = e.target
            setDragging(true)
        }
        const dragleave = (e: DragEvent) => {
            if (target === e.target) {
                target = null
                setDragging(false)
            }
        }
        const handlers = { drop, dragover, dragenter, dragleave }
        for (const [event, handler] of Object.entries(handlers)) {
            document.addEventListener(event, handler as any)
        }
        return () => {
            for (const [event, handler] of Object.entries(handlers)) {
                document.removeEventListener(event, handler as any)
            }
        }
    }, [])

    useEffect(() => {
        (async () => {
            const node = await nodePromise
            node.port.onmessage = e => {
                if (typeof e.data === "number") {
                    setTime(e.data / 44100)
                } else {
                    handleTraceLogs?.(e.data)
                }
            }
        })()
        return () => { (async () => {
            const node = await nodePromise
            node.port.onmessage = () => {}
        })() }
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
        { name: "Listen", component: <Listen {...{ qrCanvas, title, size, seed, setSeed, seedLock, setSeedLock, state, setState, time, reset, error, buffer: binary, tracing, setTracing }} /> },
        { name: "Scan", component: <Scan {...{ onScan, tab }} /> },
        { name: "Create", component: <Create {...{ binary, loadBinary, wat, setWAT, tab }} /> },
        { name: "About", component: <About {...{ setTab }} /> },
    ]

    const border = `1px ${dragging ? "dashed" : "solid"} black`
    return <div id="app" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", containerType: "inline-size", margin: "auto", backgroundColor: "white", borderTop: border }}>
        <div style={{ borderLeft: border, borderRight: border, margin: "0 -1px" }}>
            <div style={{ margin: "20px" }} >
                <h1 style={{ margin: "0 0 20px 0" }}><a href="/"><img src={logoUrl} style={{ imageRendering: "pixelated", width: "100%" }} /></a></h1>
                <div style={{ display: "flex" }}>
                    {tabs.map(({ component }, index) =>
                        <div key={index} style={{ display: "flex", flexDirection: "column", justifyContent: "center", visibility: index === tab ? "visible" : "hidden", width: "100%", marginRight: "-100%" }}>{component}</div>
                    )}
                </div>
            </div>
        </div>
        <div className="tabs" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ borderTop: border, flexGrow: "1", alignSelf: "stretch" }}></div>
            {tabs.map(({ name }, index) =>
                <button key={index} className={index === tab ? "active" : ""} onClick={() => setTab(index)}>{name}</button>
            )}
            <div style={{ borderTop: border, flexGrow: "1", alignSelf: "stretch" }}></div>
        </div>
        {/* <a href={link}>Link</a><br /> */}
        {/* <a download="a.wasm" href={download}>Download</a> */}
    </div>
}

getWabt()

export default App
