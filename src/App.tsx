import { useEffect, useRef, useState } from 'react'
import './App.css'
import QRCode from "qrcode"
import { encodeBlob } from "./base43Encoder"
import logoUrl from "./assets/logo.png"
import { instrumentWasm } from "./wasmTracer"
import { getWabt } from './lazyWabt'
import { initDebug, dlog, DEBUG } from "./debug"
import { audioDebugSnapshot, onStall, sendToWorklet, setWorkletMessageHandler, startAudio } from "./audio"
import { NO_TITLE, cardURL, extractTitle, generateSeed, parseCardURL } from "./card"
import { tracer } from "./trace"
import { readQR } from "./qrReader"
import { Tab } from "./tabs"
import { Listen } from "./Listen"
import { Scan } from "./Scan"
import { Create } from "./Create"
import { About } from "./About"

initDebug(audioDebugSnapshot)

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
    const [tab, setTab] = useState(encoded ? Tab.Listen : Tab.About)
    const [dragging, setDragging] = useState(false)
    const qrCanvas = useRef<HTMLCanvasElement>(null)
    const [tracing, _setTracing] = useState(false)

    const setupTracing = async (originalBinary: Uint8Array) => {
        // Instrument Wasm for execution tracing.
        const { binary, map } = await instrumentWasm(originalBinary)
        // TODO: set fixed WAT for tracing (line highlighting) in Create tab
        tracer.trace = { binary, map, logs: [] }
    }

    // `lockedSeed`: the seed the card's link came with, if any. (Passed along because `seed` and
    // `seedLock` here still hold what they were before the link was read.)
    const loadBinary = async (binary: Uint8Array, lockedSeed?: number) => {
        const module = new WebAssembly.Module(binary as BufferSource)
        setSize(binary.length)
        console.log("loaded wasm", module)
        setTitle(extractTitle(module) ?? NO_TITLE)

        // Send to AudioWorklet
        // NOTE: We send the binary here because sending the WebAssembly.Module doesn't work in iOS Safari...
        if (tracing) {
            await setupTracing(binary)
            sendToWorklet({ cmd: "loadModule", binary: tracer.trace!.binary, trace: true })
        } else {
            tracer.trace = null
            sendToWorklet({ cmd: "loadModule", binary })
        }
        setBinary(binary)
        reset(lockedSeed)
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
        const url = cardURL(encodeBlob(binary), seedLock ? seed : undefined)
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
        window.history.pushState(null, "", DEBUG ? url.replace("?", "?debug&") : url)
        // setLink(url)
        // setDownload(window.URL.createObjectURL(new Blob([buffer])))
        setTab(Tab.Listen)
        qrContents.current = seedLock ? [binary, seed] : [binary]
    }, [binary, seed, seedLock])

    const reset = (lockedSeed?: number) => {
        let _seed = lockedSeed ?? seed
        if (lockedSeed === undefined && !seedLock) {
            _seed = generateSeed()
            setSeed(_seed)
        }
        setTime(0)
        sendToWorklet({ cmd: "reset", seed: _seed })
    }

    const setState = (_state: "playing" | "paused") => {
        dlog("setState", _state)
        if (_state === "playing") {
            startAudio() // must run synchronously inside the user gesture (for iOS)
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
            if (!tracer.trace) {
                await setupTracing(binary)
            }
            sendToWorklet({ cmd: "loadModule", binary: tracer.trace!.binary, trace: true })
        } else {
            sendToWorklet({ cmd: "loadModule", binary })
        }
        if (state !== "playing") reset()
    }

    const onScan = (data: string) => {
        // Return value indicates whether the string contains a valid ScoreCard URL.
        const card = parseCardURL(data)
        if (!card) return false
        if (card.seed !== null) {
            setSeed(card.seed)
            setSeedLock(true)
        }
        loadBinary(card.binary, card.seed ?? undefined)
        return true
    }

    const onScanRef = useRef(onScan)
    onScanRef.current = onScan

    useEffect(() => {
        onScan(window.location.href)
    }, [])

    useEffect(() => {
        // Support drag-and-dropping .wasm files (or images of cards).
        let target: EventTarget | null = null

        const drop = async (e: DragEvent) => {
            e.preventDefault()
            target = null
            setDragging(false)

            const file = e.dataTransfer!.files[0]
            if (!file) return
            if (file.type.startsWith("image/")) {
                // A picture of a card: read its QR code.
                const text = await readQR(file).catch(() => undefined)
                if (text) onScanRef.current(text)
                return
            }
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
        setWorkletMessageHandler(e => {
            if (typeof e.data === "number") {
                setTime(e.data / 44100)
            } else {
                tracer.handleLogs?.(e.data)
            }
        })
        return () => setWorkletMessageHandler(() => {})
    }, [])

    // If the audio clock stalls (iOS), show "paused" so the next Play tap can restart audio.
    useEffect(() => onStall(() => _setState("paused")), [])

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
