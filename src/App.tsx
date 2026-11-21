import { RefObject, memo, useEffect, useMemo, useRef, useState } from 'react'
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
import ImageIcon from "pixelarticons/svg/image.svg?react"
import { readQR } from "./qrReader"
import logoUrl from "./assets/logo.png"
import exampleCardUrl from "./assets/example-card.png"
import { TraceMap, instrumentWasm } from "./wasmTracer"
import { MemoryTrace } from "./memoryTrace"
import { getWabt } from './lazyWabt'
import { initDebug, dlog, DEBUG } from "./debug"
import Heart from "pixelarticons/svg/heart.svg?react"
import Bookmark from "pixelarticons/svg/bookmark.svg?react"
import Close from "pixelarticons/svg/close.svg?react"
import library from "./library.json"
import { DeckCard, addCard, loadDeck, removeCard, toggleSeed } from "./deck"
import { audioDebugSnapshot, audioHealthy, onStall, sendToWorklet, setWorkletMessageHandler, startAudio } from "./audio"

// Indices into `tabs` in `App`.
const Tab = { Listen: 0, Deck: 1, Scan: 2, Create: 3, About: 4 }

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
function Listen({ qrCanvas, title, size, seed, setSeed, seedLock, setSeedLock, state, setState, time, reset, error, buffer: binary, tracing, setTracing, kept, toggleKept, seedSaved, toggleSeedSaved }: {
    qrCanvas: RefObject<HTMLCanvasElement>, title: string, size: number, seed: number, setSeed: (s: number) => void, seedLock: boolean,
    setSeedLock: (l: boolean) => void, state: any, setState: any, time: number, reset: any, error: any, buffer: Uint8Array | null,
    tracing: boolean, setTracing: (t: boolean) => void,
    kept: boolean, toggleKept: () => void, seedSaved: boolean, toggleSeedSaved: () => void,
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
        dlog("touchstart toggle", state, audioHealthy())
        if (state !== "playing" && !audioHealthy()) {
            // Hack within a hack... when play needs to (re)start audio, we need to handle it in
            // `onMouseDown`: iOS doesn't count touchstart as a user gesture for starting audio.
            return
        }
        events.current.toggle = true
        togglePlay()
    }
    const mouseToggle = () => {
        dlog("mousedown toggle", "skip=" + !!events.current.toggle)
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
    // The trace view shows the card's bits, lit up as the code they encode runs (green) and as the
    // data they encode is read (blue) or written (red). Below the card is a band for the rest of
    // memory: everything the card has touched that isn't part of the card itself, squeezed to fit.
    const draw = () => {
        if (trace && !tracing) trace.logs.length = 0
        if (!tracing || !traceCanvas.current || !binary) return
        const canvas = traceCanvas.current
        const context = canvas.getContext("2d")!
        // Arrange the bits in the top four-fifths of a square, leaving the rest for memory.
        const bits = binary.length * 8
        const size = Math.ceil(Math.sqrt(bits / 0.8))
        const bandStart = (Math.ceil(bits / size) + 1) * size
        canvas.width = size
        canvas.height = size
        const image = new ImageData(size, size)
        const paint = (i: number, r: number, g: number, b: number, alpha = 1) => {
            // Blend over what's there (on a white background).
            const p = image.data.subarray(i * 4, i * 4 + 4)
            const blank = p[3] === 0
            p[0] = (blank ? 255 : p[0]) * (1 - alpha) + r * alpha
            p[1] = (blank ? 255 : p[1]) * (1 - alpha) + g * alpha
            p[2] = (blank ? 255 : p[2]) * (1 - alpha) + b * alpha
            p[3] = 255
        }
        const paintRead = (i: number, heat: number) => heat && paint(i, 0, 110, 255, heat * 0.7)
        const paintWrite = (i: number, heat: number) => heat && paint(i, 255, 50, 0, heat * 0.7)
        for (let i = 0; i < bits; i++) {
            if ((binary[i >> 3] >> (i % 8)) & 1) paint(i, 204, 204, 255)
        }
        if (trace && state === "playing") {
            const max = Math.max(...Object.values(trace.logs))
            trace.logs.forEach((count, id) => {
                const startByte = trace!.map[id].start.offset
                const endByte = trace!.map[id].end.offset
                for (let i = startByte * 8; i < endByte * 8; i++) paint(i, 0, 255, 0, count / max * 0.4)
            })
            const { memory } = trace
            for (const [heat, paintHeat] of [[memory.reads, paintRead], [memory.writes, paintWrite]] as const) {
                for (const [address, value] of heat) {
                    const segment = memory.inData(address)
                    if (!segment) continue
                    const byte = segment.offset + address - segment.address
                    for (let i = byte * 8; i < byte * 8 + 8; i++) paintHeat(i, value)
                }
            }
            const band = memory.layout(Math.max(size * size - bandStart, 0))
            band.mapped.forEach((mapped, cell) => {
                if (!mapped) return
                paint(bandStart + cell, 232, 232, 255)
                paintRead(bandStart + cell, band.reads[cell])
                paintWrite(bandStart + cell, band.writes[cell])
            })
        }
        context.putImageData(image, 0, 0)
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
        <h2 style={{ userSelect: "none", margin: "20px 0", fontSize: "6cqw" }}>{title} | <span style={{ whiteSpace: "nowrap" }}>{size} bytes {/* TODO: add link and perhaps download buttons with icons */}
                {binary && <button className={"toggle" + (kept ? " on" : "")} title={kept ? "Remove from deck" : "Keep in deck"} style={{ fontSize: 0, border: "none", padding: "0 0 0 6px" }} onClick={toggleKept}>
                    <Heart style={{ height: "6cqw", verticalAlign: "middle" }} />
                </button>}
            </span>
        </h2>
        <div className="play-controls" style={{ display: "flex", textAlign: "left", justifyContent: "center", alignItems: "center", fontSize: "5cqw" }}>
            <div style={{ userSelect: "none", display: "flex", alignItems: "center", width: "4em", flexShrink: 0, whiteSpace: "nowrap", justifyContent: "right" }}>
                <Clock style={smallIconStyle} />
                &nbsp;
                <span style={{ verticalAlign: "middle", display: "inline-block" }}>{
                    // sysfont has proportional digits ("1" is narrow, "4" wide); give each digit a
                    // fixed cell so the colon and clock icon don't jitter while counting.
                    [...formatTime(time)].map((c, i) => c === ":" ? c :
                        <span key={i} style={{ display: "inline-block", width: "0.63em", textAlign: "center" }}>{c}</span>)
                }</span>
            </div>
            <button onTouchStart={touchStartReset} onMouseDown={mouseReset} onMouseUp={() => { events.current.reset = false }} style={{ touchAction: "manipulation" }}><Prev style={bigIconStyle} /></button>
            <button id="start" onTouchStart={touchStartToggle} onMouseDown={mouseToggle} onMouseUp={() => { events.current.toggle = false }}>{state === "playing" ? <Pause style={bigIconStyle} /> : <Play style={bigIconStyle} />}</button>
            <div style={{ display: "flex", alignItems: "center", userSelect: "none" }}>
                <button style={{ fontSize: 0 }}><DiceIcon style={smallIconStyle} onClick={() => setSeedLock(!seedLock)} /></button>
                &nbsp;
                <SeedInput {...{ seed, setSeed }} />
                <button className={"toggle" + (seedSaved ? " on" : "")} title={seedSaved ? "Forget this seed" : "Save this seed"} style={{ fontSize: 0 }} onClick={toggleSeedSaved}>
                    <Bookmark style={smallIconStyle} />
                </button>
            </div>
            <button style={{ fontSize: 0, marginRight: "-5cqw" }} onClick={() => setTracing(!tracing)}>
                <TraceIcon style={{ ...smallIconStyle }} />
            </button>
        </div>
    </div>
}

function Scan({ onScan, tab }: { onScan: (data: string) => boolean, tab: number }) {
    const [message, setMessage] = useState("")
    const video = useRef<HTMLVideoElement>(null)
    const onScanRef = useRef(onScan)
    onScanRef.current = onScan
    const active = tab === Tab.Scan

    const handle = (text: string | undefined, nothing: string) => {
        if (text === undefined) setMessage(nothing)
        else if (!onScanRef.current(text)) setMessage("That's not a score card")
    }

    useEffect(() => {
        if (!active) return
        setMessage("")
        let stream: MediaStream | undefined
        let stopped = false
        let timeout: number | undefined
        const canvas = document.createElement("canvas")
        const context = canvas.getContext("2d", { willReadFrequently: true })!

        const scan = async () => {
            const v = video.current
            if (stopped || !v) return
            if (v.videoWidth) {
                // Decode the whole frame at full resolution, not just what's visible in the viewfinder.
                canvas.width = v.videoWidth
                canvas.height = v.videoHeight
                context.drawImage(v, 0, 0)
                try {
                    const text = await readQR(context.getImageData(0, 0, canvas.width, canvas.height))
                    if (stopped) return
                    if (text !== undefined) handle(text, "")
                } catch (e) {
                    console.error(e)
                }
            }
            timeout = window.setTimeout(scan, 60)
        }

        ;(async () => {
            try {
                // Ask for a high-resolution rear camera: dense codes need the pixels.
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                })
            } catch (e) {
                dlog("camera failed", String(e))
                if (!stopped) setMessage("Can't use the camera")
                return
            }
            if (stopped || !video.current) {
                stream.getTracks().forEach(track => track.stop())
                return
            }
            video.current.srcObject = stream
            video.current.play().catch(() => {})
            scan()
        })()

        return () => {
            stopped = true
            clearTimeout(timeout)
            stream?.getTracks().forEach(track => track.stop())
            if (video.current) video.current.srcObject = null
        }
    }, [active])

    const scanPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return
        setMessage("Reading...")
        handle(await readQR(file).catch(() => undefined), "No card found in that photo")
    }

    return active && <>
        <div className="viewfinder">
            <video ref={video} playsInline muted autoPlay />
            <div></div>
        </div>
        <div style={{ fontSize: "6cqw", display: "flex", justifyContent: "center", alignItems: "center", margin: "12px 0" }}>
            {message ? <><Alert style={{ height: "6cqw" }} />&nbsp;{message}</> : "Point at a score card"}
        </div>
        <label className="photo-button">
            <ImageIcon style={{ height: "1.2em", verticalAlign: "middle" }} /> Scan a photo instead
            <input type="file" accept="image/*" onChange={scanPhoto} />
        </label>
    </>
}

type LoadCard = (code: string, seed?: number) => void

function CardEntry({ title, size, description, code, loadCard, children }: {
    title: string, size: number, description?: string, code: string, loadCard: LoadCard, children?: React.ReactNode
}) {
    return <div className="deck-card">
        <button onClick={() => loadCard(code)}>
            <span className="deck-title">{title}</span>
            <span>{size} bytes</span>
            {description && <span className="deck-description">{description}</span>}
        </button>
        {children}
    </div>
}

// Your collection of cards, plus a starter pack of ready-made ones
// (built from `examples/library` into `library.json`).
function Deck({ deck, loadCard, discard }: { deck: DeckCard[], loadCard: LoadCard, discard: (code: string) => void }) {
    return <div className="deck">
        <div>
            <h3>Your deck | {deck.length} {deck.length === 1 ? "card" : "cards"}</h3>
            {deck.length === 0 && <p>Cards you scan or open from a link are collected here. You can also keep the card you're listening to with <Heart style={{ height: "1em", verticalAlign: "middle" }} />.</p>}
            {deck.map(card =>
                <CardEntry key={card.code} {...card} loadCard={loadCard}>
                    <div className="deck-extras">
                        {card.seeds.map(seed =>
                            <button key={seed} title="Play with this seed" onClick={() => loadCard(card.code, seed)}>{formatSeed(seed)}</button>
                        )}
                        <span style={{ flexGrow: 1 }}>{card.seeds.length === 0 && new Date(card.added).toLocaleDateString()}</span>
                        <button title="Remove from deck" style={{ fontSize: 0 }} onClick={() => discard(card.code)}><Close style={{ height: "16px" }} /></button>
                    </div>
                </CardEntry>
            )}
            <h3>Starter pack</h3>
            {library.map(card => <CardEntry key={card.code} {...card} loadCard={loadCard} />)}
        </div>
    </div>
}

const About = memo(function About({ setTab }: any) {
    // TODO: Make this text fill the card on both desktop and mobile...
    return <div id="about" style={{ textAlign: "left", padding: "0 12px", containerType: "size", height: "100%" }}>
        <div style={{ fontSize: "4cqw" }}>
            <span style={{ fontSize: "1.1em" }}>ScoreCard is a player for "score cards": QR codes containing tiny generative music programs.</span> A score card looks like this:
            <img src={exampleCardUrl} style={{ display: "block", margin: "auto", padding: "12px" }} />
            Each QR code contains a valid URL (linking to this web app, the score card player) and an entire audio-generating <a href="https://webassembly.org/">WebAssembly</a> program. Because the QR code contains the piece itself, even if the link breaks, the code can still be read and played back by an instance of the ScoreCard player hosted somewhere else, or by a player that runs outside of the browser.
            <p>This also implies that piece must fit in a QR code, implying an max executable size of just 2,953 bytes (more like 2,900 bytes after encoding it in a URL).</p>
            <p>To get started, pick a score card from the <a href="#" onClick={() => setTab(Tab.Deck)} style={{ textDecoration: "underline" }}>Deck</a>, <a href="#" onClick={() => setTab(Tab.Scan)} style={{ textDecoration: "underline" }}>Scan</a> one, or <a href="#" onClick={() => setTab(Tab.Create)} style={{ textDecoration: "underline" }}>Create</a> your own. For more information, check out the <a href="https://github.com/ijc8/scorecard" style={{ textDecoration: "underline" }}>README</a>.</p>
            <p style={{ marginBottom: 0 }}>Happy hacking & joyful jamming!<br />- ijc</p>
        </div>
    </div>
})

function cardURL(encoded: string, seed?: number) {
    const prefix = window.location.origin + window.location.pathname.replace(/\/$/, "") // trim trailing slash
    const seedParam = seed === undefined ? "" : `s=${encode(BigInt(seed))}&`
    return `${prefix}?${seedParam}c=${encoded}`
}

// The largest binary (in bytes) whose URL still fits in a QR code when served from this address.
// Found by asking the QR library directly, since the answer depends on how it packs the URL.
let _maxCardSize: number | undefined
function maxCardSize() {
    if (_maxCardSize !== undefined) return _maxCardSize
    const fits = (bytes: number) => {
        // Longest possible encoding of this many bytes.
        const chars = Math.ceil(bytes * 8 / Math.log2(43))
        try {
            QRCode.create(cardURL(":".repeat(chars)), { errorCorrectionLevel: "L" })
            return true
        } catch {
            return false
        }
    }
    let low = 0, high = 4096
    while (high - low > 1) {
        const mid = (low + high) >> 1
        if (fits(mid)) low = mid
        else high = mid
    }
    return _maxCardSize = low
}

function Create({ binary, loadBinary, wat, setWAT, tab }: {
    binary: Uint8Array | null, loadBinary: (b: Uint8Array) => void, wat: string, setWAT: (w: string) => void, tab: number
}) {
    const oldBinary = useRef(binary)
    useEffect(() => {
        if (tab !== Tab.Create || !binary || binary === oldBinary.current) return
        oldBinary.current = binary
        console.log("disassembling")
        getWabt().then(wabt => {
            const disassembled = wabt.readWasm(binary, { readDebugNames: true })
            disassembled.applyNames()
            setWAT(disassembled.toText({ foldExprs: false, inlineExport: true }))
        })
    }, [binary, tab])

    // Assemble as you type (after a pause), to show the size budget and any errors.
    const [assembled, setAssembled] = useState<{ buffer?: Uint8Array, error?: string }>({})
    useEffect(() => {
        if (tab !== Tab.Create) return
        if (!wat.trim()) return setAssembled({})
        let current = true
        const timeout = setTimeout(async () => {
            const wabt = await getWabt()
            if (!current) return
            let module
            try {
                module = wabt.parseWat("card.wat", wat)
                setAssembled({ buffer: module.toBinary({}).buffer })
            } catch (e: any) {
                setAssembled({ error: String(e.message ?? e).trim() })
            } finally {
                module?.destroy()
            }
        }, 300)
        return () => {
            current = false
            clearTimeout(timeout)
        }
    }, [wat, tab])

    const { buffer, error } = assembled
    const max = maxCardSize()
    const size = buffer?.length ?? 0
    return <>
        <textarea style={{ width: "100%", flexGrow: "1", minHeight: "200px" }} spellCheck={false} value={wat} onChange={e => setWAT(e.target.value)}></textarea>
        {error && <pre className="assembler-error">{error}</pre>}
        <div className={"budget" + (size > max ? " over" : "")} title="How much of a QR code this card fills">
            <div style={{ width: `${Math.min(size / max, 1) * 100}%` }}></div>
            <span>{buffer ? (size > max ? `${size - max} bytes too big` : `${size} bytes | ${max - size} left`) : error ? "can't assemble" : "nothing to assemble"}</span>
        </div>
        <button id="assemble" disabled={!buffer} onClick={() => loadBinary(buffer!)}>Assemble!</button><br />
    </>
}

const NO_TITLE = "untitled"

interface TraceData {
    binary: Uint8Array
    map: TraceMap
    logs: number[]
    memory: MemoryTrace
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

function extractTitle(module: WebAssembly.Module) {
    const instance = new WebAssembly.Instance(module)
    // Support new, short export name ("d") or legacy name ("title") for old cards.
    // (In the future, "d" may contain additional metadata such as an artist name or description.)
    const data = instance.exports.d ?? instance.exports.title
    if (data === undefined) {
        return
    }
    const startPtr: number = (data as WebAssembly.Global).value
    // Support new, short export name ("m") or legacy name ("memory") for old cards.
    const memory = (instance.exports.m ?? instance.exports.memory) as WebAssembly.Memory
    const mem = memory.buffer
    const heap = new Uint8Array(mem)
    let endPtr = startPtr;
    while (heap[endPtr] != 0 && endPtr < heap.length) endPtr++
    const title = (new TextDecoder()).decode(new Uint8Array(mem, startPtr, endPtr - startPtr))
    console.log("Loaded title", title, "from", startPtr, "to", endPtr)
    return title
}

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
    const [deck, setDeck] = useState(loadDeck)
    const code = useMemo(() => binary && encodeBlob(binary), [binary])
    const deckCard = deck.find(card => card.code === code)

    const setupTracing = async (originalBinary: Uint8Array) => {
        // Instrument Wasm for execution tracing.
        const { binary, map, data } = await instrumentWasm(originalBinary)
        // TODO: set fixed WAT for tracing (line highlighting) in Create tab
        trace = { binary, map, logs: [], memory: new MemoryTrace(data) }
    }

    // `keep` adds the card to the deck. `seed` loads the card with that seed locked in, or (if null)
    // unlocked with a fresh seed; by default the seed lock is left as it is.
    const loadBinary = async (binary: Uint8Array, { keep, seed }: { keep?: boolean, seed?: number | null } = {}) => {
        const module = new WebAssembly.Module(binary as BufferSource)
        setSize(binary.length)
        console.log("loaded wasm", module)
        const title = extractTitle(module) ?? NO_TITLE
        setTitle(title)
        if (keep) setDeck(deck => addCard(deck, binary, title))
        if (seed !== undefined) setSeedLock(seed !== null)

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
        reset(seed)
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
        // (The state marks this entry as ours, so that reloading the page doesn't count as following a link.)
        window.history.pushState({ loaded: true }, "", DEBUG ? url.replace("?", "?debug&") : url)
        // setLink(url)
        // setDownload(window.URL.createObjectURL(new Blob([buffer])))
        setTab(Tab.Listen)
        qrContents.current = seedLock ? [binary, seed] : [binary]
    }, [binary, seed, seedLock])

    const reset = (newSeed?: number | null) => {
        let _seed = newSeed ?? seed
        if (typeof newSeed === "number") {
            setSeed(_seed)
        } else if (newSeed === null || !seedLock) {
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
            if (!trace) {
                await setupTracing(binary)
            }
            sendToWorklet({ cmd: "loadModule", binary: trace!.binary, trace: true })
        } else {
            sendToWorklet({ cmd: "loadModule", binary })
        }
        if (state !== "playing") reset()
    }

    const onScan = (data: string, keep = true) => {
        // Return value indicates whether the string contains a valid ScoreCard URL.
        let url
        try {
            url = new URL(data)
        } catch {
            return false
        }
        const encodedBlob = url.searchParams.get("c")
        if (!encodedBlob) return false

        const encodedSeed = url.searchParams.get("s")
        const seed = encodedSeed ? Number(decode(encodedSeed.replace(/ /g, "+"))) : null
        let buffer
        try {
            buffer = decodeBlob(encodedBlob.replace(/ /g, "+"))
        } catch {
            return false
        }
        if (!WebAssembly.validate(buffer as BufferSource)) return false
        loadBinary(buffer, { keep, seed })
        return true
    }

    useEffect(() => {
        // Collect the card if we got here by following a link (or scanning with another app),
        // but not if this is just a reload of a card that was loaded some other way.
        onScan(window.location.href, !window.history.state?.loaded)
    }, [])

    const loadCard: LoadCard = (code, seed) => loadBinary(decodeBlob(code), { seed: seed ?? null })
    const toggleKept = () => {
        if (!binary) return
        setDeck(deckCard ? removeCard(deck, code!) : addCard(deck, binary, title))
    }
    const toggleSeedSaved = () => {
        if (!binary) return
        // Saving a seed implies keeping the card.
        setDeck(toggleSeed(addCard(deck, binary, title), code!, seed))
    }

    const onScanRef = useRef(onScan)
    onScanRef.current = onScan

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
            } else if (Array.isArray(e.data)) {
                handleTraceLogs?.(e.data)
            } else {
                trace?.memory.update(e.data.reads, e.data.writes)
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
        { name: "Listen", component: <Listen {...{ qrCanvas, title, size, seed, setSeed, seedLock, setSeedLock, state, setState, time, reset, error, buffer: binary, tracing, setTracing, kept: !!deckCard, toggleKept, seedSaved: !!deckCard?.seeds.includes(seed), toggleSeedSaved }} /> },
        { name: "Deck", component: <Deck {...{ deck, loadCard, discard: (code: string) => setDeck(removeCard(deck, code)) }} /> },
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
