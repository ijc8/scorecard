import { RefObject, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { Tab } from "./tabs"
import { NO_TITLE, cardFragment, cardURL, generateCard, formatTime, formatSeed, generateSeed, parseCardURL } from "./card"
import AudioDevice from "pixelarticons/svg/audio-device.svg?react"
import { BackHandle, CardBack, Face, Workbench, WorkbenchHandle } from "./Workbench"
import { Scan } from "./Scan"
import { Settings, SettingsTab, loadSettings } from "./Settings"
import { LoadCard, PACK_FORMAT, parsePack, starterPack } from "./packs"
import library from "./library.json"
import { flushSync } from "react-dom"
import { raise, throwTop, turn, useDissolve, usePile } from "./Pile"
import { Place, Spread, placeOf } from "./Spread"
import { Forward, HeartFull } from "./icons"
import { decodeSteps } from "./qrDecode"
import { playDecode } from "./decodeAnimation"
import { motionOff } from "./Settings"
import { holdMediaSession, useMediaSession } from "./mediaSession"
import QRCode from "qrcode"
import { encodeBlob, decodeBlob } from "./base43Encoder"
import Play from "pixelarticons/svg/play.svg?react"
import Pause from "pixelarticons/svg/pause.svg?react"
import Prev from "pixelarticons/svg/prev.svg?react"
import SpeedFast from "pixelarticons/svg/speed-fast.svg?react"
import ClockIcon from "pixelarticons/svg/clock.svg?react"
import Dice from "pixelarticons/svg/dice.svg?react"
import CloseBox from "pixelarticons/svg/close-box.svg?react"
import Downasaur from "pixelarticons/svg/downasaur.svg?react"
import Flatten from "pixelarticons/svg/flatten.svg?react"
// Alternative icon for "TOO BIG":
// import Loader from "pixelarticons/svg/loader.svg?react"
import Subscriptions from "pixelarticons/svg/subscriptions.svg?react"
import Camera from "pixelarticons/svg/camera.svg?react"
import EditBox from "pixelarticons/svg/edit-box.svg?react"
import DragAndDrop from "pixelarticons/svg/drag-and-drop.svg?react"
import Bullseye from "pixelarticons/svg/bullseye.svg?react"
import BullseyeArrow from "pixelarticons/svg/bullseye-arrow.svg?react"
import { readQR } from "./qrReader"
import logoUrl from "./assets/logo.png"
import exampleCardUrl from "./assets/example-card.png"
import { TraceMap } from "./wasmTracer"
import { MemoryTrace, findDataSegments } from "./memoryTrace"
import { initDebug, dlog, DEBUG } from "./debug"
import Heart from "pixelarticons/svg/heart.svg?react"
import Redo from "pixelarticons/svg/redo.svg?react"
import { canPrintDirectly, printCard, saveCardImage } from "./print"
import Headphone from "pixelarticons/svg/headphone.svg?react"
import Sliders from "pixelarticons/svg/sliders.svg?react"
import InfoBox from "pixelarticons/svg/info-box.svg?react"
import { Pack, addCard, addPack, clearDeck, loadDeck, loadPacks, neighbour, removeCard, savePacks, toggleSeed } from "./deck"
import { audioDebugSnapshot, audioHealthy, needTracer, onStall, sendToWorklet, setEchoCancellation, setInputWanted, setWorkletMessageHandler, startAudio } from "./audio"


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
function Listen({ qrCanvas, title, listens, size, seed, setSeed, seedLock, state, setState, time, reset, error, buffer: binary, played, tracing, toggleTracing, kept, toggleKept, face, code, loadBinary, lockSeed, description }: {
    qrCanvas: RefObject<HTMLCanvasElement>, title: string, listens: boolean, size: number, seed: number, setSeed: (s: number) => void, seedLock: boolean,
    state: any, setState: any, time: number, reset: any, error: any, buffer: Uint8Array | null, played: Uint8Array | null,
    tracing: boolean, toggleTracing: () => void, face: Face, code: string | null, loadBinary: (b: Uint8Array) => Promise<void>,
    kept: boolean, toggleKept: () => void, lockSeed: (lock: boolean) => void,
    description?: string,
}) {
    // The card's front shows its QR code, or (tracing) its bits.
    const front = face === "qr" || face === "bits"
    const bigIconStyle = { height: "10cqw", verticalAlign: "middle" }
    const smallIconStyle = { height: "5cqw", flexShrink: 0, verticalAlign: "middle" }
    const inlineIconStyle = { height: "11cqh", verticalAlign: "bottom" }
    const DiceIcon = seedLock ? CloseBox : Dice
    const showMessage = (error || (size === 0)) && front
    // (The QR code dissolves into the card's bits.)
    const dissolve = useDissolve(tracing && !showMessage)
    // When tracing is turned on, the QR code is first read, step by step, into those bits
    // (see decodeAnimation.ts); the animation plays on a canvas of its own, over both. Tap it to skip.
    const decodeCanvas = useRef<HTMLCanvasElement>(null)
    const [decoding, setDecoding] = useState(false)
    const wasTracing = useRef(tracing)
    useEffect(() => {
        const turnedOn = tracing && !wasTracing.current, changed = tracing !== wasTracing.current
        wasTracing.current = tracing
        if (!changed || !binary || !code || showMessage || !front || motionOff()) return
        let steps
        try {
            steps = decodeSteps(cardURL(code, seedLock ? seed : undefined), code.length)
        } catch {
            return
        }
        setDecoding(true)
        let timer = 0
        // (Once it's done, it stays a moment while the bits dissolve in underneath. Turning tracing
        // off plays it backwards: the bits are written out as the QR code again.)
        // (A card that wrote the one that plays goes on to show that: see `played`, and `trace` once the worklet has said which.)
        const wrote = !!played && (played.length !== binary.length || played.some((byte, i) => byte !== binary[i]))
        const stop = playDecode(decodeCanvas.current!, steps, binary, () => { timer = window.setTimeout(() => setDecoding(false), turnedOn ? 450 : 0) }, !turnedOn, wrote ? () => trace?.binary ?? played : undefined)
        return () => {
            stop()
            clearTimeout(timer)
            setDecoding(false)
        }
    }, [tracing, binary])

    // The card has two sides: the front (its QR code, which tracing sees through to its bits) and
    // the back (what it holds, as WebAssembly text). The workbench (the Create tab's card) is laid
    // out the same way, with the editor in the middle, so it takes this card's place.
    const back = useRef<BackHandle>(null)
    const workbench = useRef<WorkbenchHandle>(null)
    // The last card built on the workbench: while that's the one loaded, the workbench shows its name and size.
    const [ownBuild, setOwnBuild] = useState<Uint8Array | null>(null)
    const setStateRef = useRef(setState)
    setStateRef.current = setState
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
        // (The bits shown are those of the card that's running: for a card that generates another, the
        // other; the worklet says which once it's tracing.)
        const shown = trace?.binary ?? played ?? binary
        const canvas = traceCanvas.current
        const context = canvas.getContext("2d")!
        // Arrange the bits in the top four-fifths of a square, leaving the rest for memory.
        const bits = shown.length * 8
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
            if ((shown[i >> 3] >> (i % 8)) & 1) paint(i, 204, 204, 255)
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
        if (face === "back") {
            // On the back, light up the lines of WebAssembly text that are running.
            const lines = new Float32Array(trace.map[Object.keys(trace.map).length - 1].end.line + 1)
            const max = Math.max(...Object.values(trace.logs))
            trace.logs.forEach((count, id) => lines.fill(count / max, trace!.map[id].start.line, trace!.map[id].end.line))
            back.current?.showHeat(state === "playing" ? lines : null)
        }
        draw()
    }

    useEffect(draw, [tracing, binary, played])

    const togglePlay = async () => {
        if (state === "playing") return setState("paused")
        if (face === "write") {
            // Playing from the workbench builds what's written there first, if that isn't the loaded card.
            // Building takes a moment, so get audio going now, while we're still inside the gesture (for iOS).
            startAudio()
            if (!await workbench.current?.build()) return
            // (Let the freshly-loaded card settle in before starting it.)
            await new Promise(resolve => setTimeout(resolve))
        }
        setStateRef.current("playing")
    }
    const TraceIcon = tracing ? BullseyeArrow : Bullseye
    // How printing is going.
    const [printing, setPrinting] = useState("")
    const printable = () => ({ url: cardURL(code!, seedLock ? seed : undefined), title, size, description })
    const traceClick = () => {
        // (On the back, tracing lights up lines of the card's WebAssembly text.)
        if (tracing) back.current?.showHeat(null)
        toggleTracing()
    }
    const KeptIcon = kept ? HeartFull : Heart
    const header = (title: string, size: number | null, live: boolean) =>
            <h2 style={{ userSelect: "none", margin: "0 0 12px", fontSize: "6cqw", fontWeight: "normal", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", textAlign: "left", lineHeight: 1.2 }}>
                <span data-card-title="">{title}</span>
                {size !== null && <span style={{ whiteSpace: "nowrap" }}>
                    {listens && <span title="This card listens: it plays what the microphone hears, changed"><AudioDevice style={{ height: "6cqw", verticalAlign: "middle" }} /> </span>}
                    <span data-card-size="">{size}</span> bytes {/* TODO: add link and perhaps download buttons with icons */}
                    {/* Beside the size: a look at those bytes at work. */}
                    {binary && live && <button title="Show the card at work" style={{ fontSize: 0, lineHeight: 0, border: "none", padding: "0 0 0 6px", verticalAlign: "middle" }} onClick={traceClick}>
                        <TraceIcon style={{ height: "6cqw", verticalAlign: "middle" }} />
                    </button>}
                </span>}
            </h2>
    const side = (name: string, shown: boolean) => ({ className: `side ${name}`, style: { visibility: shown ? "inherit" : "hidden" } as React.CSSProperties, ...(shown ? {} : { inert: "" }) })
    const builtHere = !!binary && binary === ownBuild
    return <div>
        {/* On each side: title and size on top, and a square below. (The whole card turns over; see `turn`.) */}
        <div className="faces">
            <div {...side("front", front)}>
                {header(title, size, true)}
                <div className="square">
                    <canvas ref={qrCanvas} data-qr="" width="1" height="1" style={{ visibility: showMessage ? "hidden" : "inherit" }}></canvas>
                    {/* Tracing: the card's bits, seen through the QR code. */}
                    <canvas ref={traceCanvas} width="1" height="1" className="xray" style={dissolve}></canvas>
                    <canvas ref={decodeCanvas} width="1" height="1" title="Reading the QR code (tap to skip)" style={{ display: decoding ? "block" : "none" }} onClick={() => setDecoding(false)}></canvas>
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
                </div>
            </div>
            <div {...side("back", face === "back")}>
                {header(title, size, true)}
                <div className="square">
                    <CardBack ref={back} binary={played ?? binary} active={face === "back"}>
                        {/* The card as a thing: printed, or as a picture. */}
                        <button title="Save the card as a picture (or share it, to a printer's app)" onClick={() => saveCardImage(printable())}>Save picture</button>
                        {canPrintDirectly() && <button title="Print on a Bluetooth thermal printer (paired with this device)" onClick={async () => {
                            try {
                                await printCard(printable(), setPrinting)
                            } catch (e: any) {
                                setPrinting(e?.name === "NotFoundError" ? "" : String(e?.message ?? e))
                            }
                        }}>Print</button>}
                        <span>{printing}</span>
                    </CardBack>
                </div>
            </div>
            <div {...side("write", face === "write")}>
                {header(builtHere ? title : "new card", builtHere ? size : null, false)}
                <div className="square"><Workbench ref={workbench} {...{ binary, played, code, title, loadBinary }} onBuild={setOwnBuild} /></div>
            </div>
        </div>
        <div className="console">
            <div className="play-controls" style={{ display: "flex", textAlign: "left", justifyContent: "center", alignItems: "center", fontSize: "5cqw" }}>
                <Clock {...{ time, seed, style: smallIconStyle }} />
                <button onTouchStart={touchStartReset} onMouseDown={mouseReset} onMouseUp={() => { events.current.reset = false }} style={{ touchAction: "manipulation" }}><Prev style={bigIconStyle} /></button>
                <button id="start" onTouchStart={touchStartToggle} onMouseDown={mouseToggle} onMouseUp={() => { events.current.toggle = false }}>{state === "playing" ? <Pause style={bigIconStyle} /> : <Play style={bigIconStyle} />}</button>
                <SkipButton style={{ ...bigIconStyle, height: "8cqw" }} />
                <div style={{ display: "flex", alignItems: "center", userSelect: "none" }}>
                    <button style={{ fontSize: 0 }} title={seedLock ? "Unlock the seed: draw a new one each time" : "Lock this seed: keep it when starting again"} onClick={() => lockSeed(!seedLock)}><DiceIcon style={smallIconStyle} /></button>
                    &nbsp;
                    <SeedInput {...{ seed, setSeed }} />
                </div>
                {/* Beside the seed: keep this performance. */}
                <button style={{ fontSize: 0 }} disabled={!binary} title={kept ? "Forget this performance" : "Keep this performance (its seed is saved with the card)"} onClick={toggleKept}>
                    <KeptIcon style={smallIconStyle} />
                </button>
            </div>
        </div>
    </div>
}

// The clock. Tap it to go to a time: ahead by skipping, back by starting again (same seed) and
// skipping to there. Either way the card has to work its way through every sample in between, at
// up to 64 times real time.
function Clock({ time, seed, style }: { time: number, seed: number, style: React.CSSProperties }) {
    const [editing, setEditing] = useState<string | null>(null)
    const go = (text: string) => {
        setEditing(null)
        const match = text.trim().match(/^(?:(\d+):)?(\d+(?:\.\d*)?)$/)
        if (!match) return
        const target = Number(match[1] ?? 0) * 60 + Number(match[2])
        if (target >= time) sendToWorklet({ cmd: "skip", samples: Math.round((target - time) * 44100 / 128) * 128 })
        else sendToWorklet({ cmd: "reset", seed, skip: Math.round(target * 44100 / 128) * 128 })
    }
    return <div style={{ userSelect: "none", display: "flex", alignItems: "center", width: "3.8em", flexShrink: 0, whiteSpace: "nowrap", justifyContent: "right" }}>
        <ClockIcon style={style} />
        &nbsp;
        {editing === null
            ? <span title="Go to a time" style={{ verticalAlign: "middle", display: "inline-block", cursor: "pointer" }} onClick={() => setEditing(formatTime(time))}>{
                // sysfont has proportional digits ("1" is narrow, "4" wide); give each digit a
                // fixed cell so the colon and clock icon don't jitter while counting.
                [...formatTime(time)].map((c, i) => c === ":" ? c :
                    <span key={i} style={{ display: "inline-block", width: "0.63em", textAlign: "center" }}>{c}</span>)
            }</span>
            : <input autoFocus value={editing} aria-label="Go to time (minutes:seconds)" style={{ width: "2.6em", font: "inherit", padding: 0, border: "none", borderBottom: "1px solid black", background: "transparent" }}
                onChange={e => setEditing(e.target.value)} onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === "Enter") go(editing); else if (e.key === "Escape") setEditing(null) }}
                onBlur={() => setEditing(null)} />}
    </div>
}

const SKIP_SECONDS = 10, FAST_FORWARD = 4, HOLD_MS = 350

// Tap to skip ahead; hold to fast-forward (the card runs faster, and you hear it, sped up).
function SkipButton({ style }: { style: React.CSSProperties }) {
    const [fast, setFast] = useState(false)
    const hold = useRef<{ timer?: number, fast?: boolean } | null>(null)
    const down = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        const h: { timer?: number, fast?: boolean } = {}
        h.timer = window.setTimeout(() => {
            h.fast = true
            setFast(true)
            sendToWorklet({ cmd: "speed", value: FAST_FORWARD })
        }, HOLD_MS)
        hold.current = h
    }
    const up = (cancelled: boolean) => {
        const h = hold.current
        if (!h) return
        hold.current = null
        clearTimeout(h.timer)
        if (h.fast) {
            setFast(false)
            sendToWorklet({ cmd: "speed", value: 1 })
        } else if (!cancelled) {
            sendToWorklet({ cmd: "skip", samples: SKIP_SECONDS * 44100 })
        }
    }
    const Icon = fast ? SpeedFast : Forward
    return <button title={`Tap: skip ${SKIP_SECONDS} seconds. Hold: fast-forward.`} style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none", paddingLeft: 0 } as React.CSSProperties}
        onPointerDown={down} onPointerUp={() => up(false)} onPointerCancel={() => up(true)} onContextMenu={e => e.preventDefault()}>
        <Icon style={style} />
    </button>
}

const About = memo(function About({ setTab, openDeck }: any) {
    // TODO: Make this text fill the card on both desktop and mobile...
    const inline = { height: "1.1em", verticalAlign: "text-bottom" }
    return <div id="about" style={{ textAlign: "left", padding: "0 12px", containerType: "size", height: "100%" }}>
        <div style={{ fontSize: "4cqw" }}>
            <span style={{ fontSize: "1.1em" }}>ScoreCard is a player for "score cards": QR codes containing tiny generative music programs.</span> A score card looks like this:
            <img src={exampleCardUrl} style={{ display: "block", margin: "auto", padding: "12px" }} />
            Each QR code contains a valid URL (linking to this web app, the score card player) and an entire audio-generating <a href="https://webassembly.org/">WebAssembly</a> program. Because the QR code contains the piece itself, even if the link breaks, the code can still be read and played back by an instance of the ScoreCard player hosted somewhere else, or by a player that runs outside of the browser.
            <p>This also implies that piece must fit in a QR code, implying an max executable size of just 2,953 bytes (more like 2,900 bytes after encoding it in a URL).</p>
            <p>To get started, pick a score card from the <a href="#" onClick={openDeck} style={{ textDecoration: "underline" }}>Deck</a>, <a href="#" onClick={() => setTab(Tab.Scan)} style={{ textDecoration: "underline" }}>Scan</a> one, or <a href="#" onClick={() => setTab(Tab.Create)} style={{ textDecoration: "underline" }}>Create</a> your own. For more information, check out the <a href="https://github.com/ijc8/scorecard" style={{ textDecoration: "underline" }}>README</a>.</p>
            <p>Things to try:</p>
            <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
                <li>Flick the top card aside for the next one in your deck.</li>
                <li>Tap <Headphone style={inline} /> (or the table) to spread the whole pile out, along with any packs waiting to be opened.</li>
                <li>Tap <Redo style={inline} /> at a card's corner to turn it over and read its code. On the back you can also print it, or save it as a picture.</li>
                <li>Tap <Bullseye style={inline} /> to watch the QR code being read into the card's bits, and the bits at work as they play.</li>
                <li>Tap <Forward style={inline} /> to skip ahead, or hold it to fast-forward. Tap the clock to go to a time.</li>
                <li>Each performance of a card has a seed. <Dice style={inline} /> locks it, and <Heart style={inline} /> keeps that performance with the card.</li>
            </ul>
            <p style={{ marginBottom: 0 }}>Happy hacking & joyful jamming!<br />- ijc</p>
        </div>
    </div>
})

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

function App() {
    const [title, setTitle] = useState(NO_TITLE)
    const [listens, setListens] = useState(false)
    const [size, setSize] = useState(0)
    const [seed, setSeed] = useState(0)
    const [seedLock, setSeedLock] = useState(false)
    const [binary, setBinary] = useState<Uint8Array | null>(null)
    // The card that's running: `binary`, or what that generated.
    const [played, setPlayed] = useState<Uint8Array | null>(null)
    // const [link, setLink] = useState("")
    // const [download, setDownload] = useState("")
    const [state, _setState] = useState("stopped")
    const [time, setTime] = useState(0)
    const [error, setError] = useState(false)
    const encoded = parseCardURL(window.location.href)
    const [tab, setTab] = useState(encoded ? Tab.Listen : Tab.About)
    const [dragging, setDragging] = useState(false)
    const qrCanvas = useRef<HTMLCanvasElement>(null)
    const [tracing, _setTracing] = useState(false)
    const [deck, setDeck] = useState(loadDeck)
    const [packs, setPacks] = useState(() => loadPacks(starterPack))
    const [settings, _setSettings] = useState(loadSettings)
    const setSettings = (settings: Settings) => {
        _setSettings(settings)
        try {
            localStorage.setItem("scorecard-settings", JSON.stringify(settings))
        } catch {}
    }
    useEffect(() => {
        document.documentElement.classList.toggle("still", !settings.motion)
    }, [settings.motion])
    useEffect(() => setEchoCancellation(settings.echo), [settings.echo])
    useEffect(() => {
        // Squared, so the slider feels even to the ear.
        sendToWorklet({ cmd: "volume", value: settings.volume ** 2 })
    }, [settings.volume])
    useEffect(() => {
        // Keep the screen on while playing, if asked to. (The lock is lost whenever the page is hidden.)
        const wakeLock = (navigator as any).wakeLock
        if (!settings.awake || state !== "playing" || !wakeLock) return
        let lock: any
        let done = false
        const acquire = () => {
            if (document.visibilityState !== "visible") return
            wakeLock.request("screen").then((l: any) => {
                lock?.release()
                lock = l
                if (done) l.release()
            }).catch(() => {})
        }
        acquire()
        document.addEventListener("visibilitychange", acquire)
        return () => {
            done = true
            lock?.release()
            document.removeEventListener("visibilitychange", acquire)
        }
    }, [settings.awake, state])
    // The whole deck is shown by spreading the pile out on the table (see Spread.tsx).
    const [spread, setSpread] = useState(false)
    const pilePlace = useRef<Place | null>(null), pileScroll = useRef(0)
    const openSpread = () => {
        const top = document.querySelector(".pile-top")
        if (top) pilePlace.current = placeOf(top)
        pileScroll.current = window.scrollY
        setSpread(true)
    }
    // (The table may have been scrolled a long way; the pile is where it was.)
    useLayoutEffect(() => { if (!spread) window.scrollTo(0, pileScroll.current) }, [spread])
    const openDeck = useRef(openSpread).current
    const code = useMemo(() => binary && encodeBlob(binary), [binary])
    const deckCard = deck.find(card => card.code === code)

    // `keep` adds the card to the deck. `seed` loads the card with that seed locked in, or (if null)
    // unlocked with a fresh seed; by default the seed lock is left as it is.
    const loadBinary = async (binary: Uint8Array, { keep, seed }: { keep?: boolean, seed?: number | null } = {}) => {
        // The card that plays is the one given, unless its setup generates another (see generate.ts):
        // then what tracing shows is the card it wrote. (Always found with the same seed, so that a
        // card's title doesn't depend on the performance.)
        let generated
        try {
            generated = await generateCard(binary, 0)
        } catch (e: any) {
            window.alert(e?.message ?? String(e))
            return
        }
        const { binary: played, listens } = generated
        setSize(binary.length)
        console.log("loaded wasm", played === binary ? "" : `(generated: ${played.length} bytes from ${binary.length})`)
        const title = generated.title ?? NO_TITLE
        setTitle(title)
        // A card whose process function takes a sample in is an effect, and gets the microphone.
        setListens(listens)
        setInputWanted(listens)
        if (keep && settings.collect) setDeck(deck => addCard(deck, binary, title))
        if (seed !== undefined) setSeedLock(seed !== null)

        // Send to AudioWorklet
        // NOTE: We send the binary here because sending the WebAssembly.Module doesn't work in iOS Safari...
        // (The worklet has the card generate again for each performance, with that performance's
        // seed; when tracing, it instruments the card that results, and says which card that is.)
        trace = null
        if (tracing || settings.meter) await needTracer()
        sendToWorklet({ cmd: "loadModule", binary, trace: tracing, meter: settings.meter })
        setBinary(binary)
        setPlayed(played)
        // (A card arrives face up.)
        setTurned(false)
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
        try {
            window.history.pushState({ loaded: true }, "", `${window.location.pathname}${DEBUG ? "?debug" : ""}#${cardFragment(encodeBlob(binary), seedLock ? seed : undefined)}`)
        } catch {
            // Some embeddings don't allow changing the address; the card still plays.
        }
        // setLink(url)
        // setDownload(window.URL.createObjectURL(new Blob([buffer])))
        // Show the card (unless it was built on the workbench: then stay there).
        setTab(tab => tab === Tab.Create ? tab : Tab.Listen)
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
        holdMediaSession(_state === "playing")
        _setState(_state)
    }

    const setTracing = async (tracing: boolean) => {
        _setTracing(tracing)
        if (!binary) return
        if (tracing || settings.meter) await needTracer()
        if (!tracing) trace = null
        sendToWorklet({ cmd: "loadModule", binary, trace: tracing, meter: settings.meter })
        if (state === "stopped" || time === 0) {
            reset()
        } else {
            // The card has to start over for the change to take hold. Keep its seed, so it's the same
            // performance, and have it run (silently, as fast as it can) back to where it had got to.
            sendToWorklet({ cmd: "reset", seed, resume: true })
        }
    }

    const onScan = (data: string, keep = true) => {
        // Return value indicates whether the string contains a valid ScoreCard URL.
        const card = parseCardURL(data)
        if (!card || !WebAssembly.validate(card.binary as BufferSource)) return false
        loadBinary(card.binary, { keep, seed: card.seed })
        return true
    }

    useEffect(() => {
        // Collect the card if we got here by following a link (or scanning with another app),
        // but not if this is just a reload of a card that was loaded some other way.
        onScan(window.location.href, !window.history.state?.loaded)
        // Following a link to another card from here only changes what's after the "#", which doesn't reload the page.
        const onHashChange = () => onScanRef.current(window.location.href)
        window.addEventListener("hashchange", onHashChange)
        return () => window.removeEventListener("hashchange", onHashChange)
    }, [])

    const openPack = (pack: Pack) => {
        setDeck(addPack(deck, pack))
        setPacks(savePacks(packs.filter(p => p.id !== pack.id)))
    }
    const importPack = async (file: File) => {
        const pack = await parsePack(await file.text())
        if (!pack) return window.alert("That doesn't look like a pack of score cards.")
        setPacks(packs => savePacks([...packs, pack]))
        openSpread()
    }
    const importPackRef = useRef(importPack)
    importPackRef.current = importPack
    const exportPack = () => {
        const name = window.prompt("Name this pack:", "My pack")
        if (!name) return
        const cards = deck.map(({ code, seeds, description }) => ({ code, seeds, description }))
        const blob = new Blob([JSON.stringify({ format: PACK_FORMAT, name, cards })], { type: "application/json" })
        const link = document.createElement("a")
        link.href = URL.createObjectURL(blob)
        link.download = `${name.replace(/[^\w -]+/g, "").trim() || "pack"}.json`
        link.click()
        setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    }

    const loadCard: LoadCard = (code, seed) => loadBinary(decodeBlob(code), { seed: seed ?? null })
    const stepDeck = (direction: number) => {
        const card = neighbour(deck, code, direction)
        if (!card || card.code === code) return
        loadCard(card.code)
    }
    useMediaSession(title, state === "playing", qrCanvas.current, binary, {
        play: () => setState("playing"),
        pause: () => setState("paused"),
        skip: () => sendToWorklet({ cmd: "skip", samples: 10 * 44100 }),
        next: () => stepDeck(1),
        previous: () => stepDeck(-1),
    })
    // The heart keeps a performance: this seed is saved with the card in the deck (which keeps the
    // card, if it wasn't there). Again, and the seed is forgotten. (Cards leave the deck from the
    // spread.) Locking the seed is something else: it stops a new one being drawn.
    const kept = !!deckCard?.seeds.includes(seed)
    const toggleKept = () => {
        if (!binary) return
        setDeck(toggleSeed(kept ? deck : addCard(deck, binary, title), code!, seed))
    }
    const lockSeed = setSeedLock

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
            if (file.type === "application/json" || file.name.endsWith(".json")) {
                return importPackRef.current(file)
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
                if (e.data.failed) {
                    // The card was stopped in the worklet: it ran out of gas (see the guard, in Settings), or broke.
                    holdMediaSession(false)
                    _setState("paused")
                    window.alert(`This card was stopped: ${/unreachable/i.test(e.data.failed) ? "it went on too long without finishing" : e.data.failed}.`)
                } else if (e.data.bench) {
                    benchDone.current?.(e.data.bench)
                } else if (e.data.traced) {
                    // The worklet has instrumented the card it's playing: this is that card, and what its counters count.
                    const { binary, map } = e.data.traced
                    trace = { binary, map, logs: [], memory: new MemoryTrace(findDataSegments(binary)) }
                } else {
                    trace?.memory.update(e.data.reads, e.data.writes)
                }
            }
        })
        return () => setWorkletMessageHandler(() => {})
    }, [])

    // If the audio clock stalls (iOS), show "paused" so the next Play tap can restart audio.
    useEffect(() => onStall(hung => {
        holdMediaSession(false)
        _setState("paused")
        // (Twice in the same place, with the audio thread not answering: it's the card, and it has been taken off.)
        if (hung) window.alert("This card stopped responding, so it has been stopped. Load it again to give it another try.")
    }), [])

    // TODO: "load example" link
    // useEffect(() => {
    //     (async () => {
    //         const source = await (await fetch("test.wat")).text()
    //         console.log("loaded WAT source:", source)
    //         setWAT(source)
    //     })();
    // } , [])

    // The top card of the pile is the loaded card, unless one of the cards kept at the back of the
    // pile has been brought to the top by its tab: Scan, Create (the workbench), Settings or About.
    // Tapping such a card's tab again sends it back. The music pile has a tab of its own, which
    // brings it back from any of those, and from there spreads the pile out.
    const nextCard = (direction: 1 | -1) => {
        const card = neighbour(deck, code, direction)
        return card && card.code !== code ? card : undefined
    }
    // Is the loaded card turned over, to its back?
    const [turned, setTurned] = useState(false)
    const pickTab = (index: number) => {
        // (With no card loaded there is no music card to go back to: straight to the spread.)
        if (index === Tab.Listen && (tab === Tab.Listen || !binary)) return openSpread()
        const change = () => flushSync(() => setTab(index === tab ? Tab.Listen : index))
        if (index === tab || index === Tab.Listen) throwTop("down", change)
        else raise(change)
    }
    const flip = () => turn(() => flushSync(() => setTurned(!turned)), nextCard(1))
    const pileHandlers = usePile({
        enabled: !spread,
        current: code,
        next: nextCard,
        go: card => loadCard(card.code),
        dismiss: tab !== Tab.Listen ? () => flushSync(() => setTab(Tab.Listen)) : undefined,
    })

    useEffect(() => {
        // A tap on the table (beside the pile) spreads the pile out. So does a tap on the pile: its
        // edges, or the music card on top, anywhere that isn't something to press (or the row of controls).
        if (spread) return
        const click = (e: MouseEvent) => {
            if (!(e.target instanceof Element)) return
            if (e.target.matches("html, body, #root, #layout, #app, .pile, .pile-edges")) openSpread()
            else if (tab === Tab.Listen && e.target.closest(".pile-top") && !e.target.closest("button, input, textarea, select, label, a, video, .source, .play-controls, canvas[title]")) openSpread()
        }
        document.addEventListener("click", click)
        return () => document.removeEventListener("click", click)
    }, [spread, tab])

    const face: Face = tab === Tab.Create ? "write" : turned ? "back" : tracing ? "bits" : "qr"
    const toggleTracing = () => setTracing(!tracing)
    // Changing the guard takes hold at once (the card carries on from where it was).
    const guarded = useRef(settings.meter)
    useEffect(() => {
        if (guarded.current === settings.meter) return
        guarded.current = settings.meter
        if (!binary) return
        ;(async () => {
            if (tracing || settings.meter) await needTracer()
            sendToWorklet({ cmd: "loadModule", binary, trace: tracing, meter: settings.meter })
            sendToWorklet({ cmd: "reset", seed, resume: true })
        })()
    }, [settings.meter])
    // How fast is the loaded card, as scanned and guarded? (The worklet times itself making sound nobody hears.)
    const benchDone = useRef<((result: { samples: number, ms: number, error?: string }) => void) | null>(null)
    const measure = async () => {
        if (!binary) return "No card is loaded."
        if (state === "playing") setState("paused")
        await needTracer()
        const run = (meter: boolean) => new Promise<{ samples: number, ms: number, error?: string }>(resolve => {
            benchDone.current = resolve
            sendToWorklet({ cmd: "bench", seed, meter })
        })
        const plain = await run(false), metered = await run(true)
        if (plain.error || metered.error) return `Couldn't measure: ${plain.error ?? metered.error}`
        const speed = (r: { samples: number, ms: number }) => r.samples / 44.1 / r.ms
        return `${title}: ${speed(plain).toFixed(0)}x real time as scanned, ${speed(metered).toFixed(0)}x guarded (${((speed(plain) / speed(metered) - 1) * 100).toFixed(0)}% slower).`
    }
    const settingsProps = {
        measure,
        settings, setSettings, deckSize: deck.length, hasStarter: packs.some(pack => pack.id === starterPack.id),
        freshStarter: () => { setPacks(savePacks([...packs, starterPack])); openSpread() },
        emptyDeck: () => setDeck(clearDeck()),
    }
    const tabs = [
        { name: "Listen", Icon: Headphone, component: <Listen {...{ qrCanvas, title, listens, size, seed, setSeed, seedLock, state, setState, time, reset, error, buffer: binary, played, tracing, toggleTracing, face, code, loadBinary, kept, toggleKept, lockSeed, description: deckCard?.description ?? library.find(card => card.code === code)?.description }} /> },
        { name: "Scan", Icon: Camera, component: <Scan {...{ onScan, tab }} /> },
        // The workbench is laid out like a music card (and shares its controls), so it's drawn by Listen.
        { name: "Create", Icon: EditBox, component: null },
        { name: "Settings", Icon: Sliders, component: <SettingsTab {...settingsProps} /> },
        { name: "About", Icon: InfoBox, component: <About {...{ setTab, openDeck }} /> },
    ]

    const logo = <h1 className="app-logo" style={{ margin: "0 0 20px 0" }}><a href="/"><img src={logoUrl} style={{ imageRendering: "pixelated", width: "100%" }} /></a></h1>
    const panes = <div className="panes" style={{ display: "flex" }}>
        {tabs.map(({ component }, index) => component &&
            <div key={index} data-pane={index === Tab.Listen ? "listen" : "sheet"} className={index !== Tab.Listen ? "sheet" : tab === Tab.Listen || tab === Tab.Create ? "" : "away"} style={{ display: "flex", flexDirection: "column", justifyContent: "center", visibility: index === tab || (index === Tab.Listen && tab === Tab.Create) ? "visible" : "hidden", width: "100%", marginRight: "-100%" }}>{component}</div>
        )}
    </div>
    // Each tab is drawn twice: sticking out from the back of the pile, and (white) hanging from the top card when it's that card's own.
    const tabButtons = (own: boolean) => tabs.map(({ name, Icon }, index) =>
        <button key={index} data-tab={index} title={index === Tab.Listen && tab === Tab.Listen ? "Spread the pile out" : name} aria-label={name} className={own ? "active" : ""} style={{ visibility: (index === tab) === own ? "visible" : "hidden" }} onClick={() => pickTab(index)}><Icon /></button>)
    return <div id="layout">
    <div id="app" style={{ containerType: "inline-size" }}>
        {spread && <Spread {...{ deck, packs, openPack, importPack, exportPack, current: tab === Tab.Listen || tab === Tab.Create ? code : null, pile: pilePlace.current, scroll: pileScroll.current }}
            tabbed={[
                { index: Tab.Scan, name: "Scan", Icon: Camera, face: <>
                    <div className="viewfinder"><div></div></div>
                    <div style={{ margin: "12px 0", fontSize: "6cqw", textAlign: "center" }}>Point at a score card</div>
                </> },
                { index: Tab.Create, name: "Create", Icon: EditBox, face: <>
                    <div style={{ margin: "0 0 12px", fontSize: "6cqw", lineHeight: 1.2 }}>new card</div>
                    <div style={{ aspectRatio: "1", border: "1px solid black" }}></div>
                </> },
                { index: Tab.Settings, name: "Settings", Icon: Sliders, face: <SettingsTab {...settingsProps} /> },
                { index: Tab.About, name: "About", Icon: InfoBox, face: <About setTab={() => {}} openDeck={() => {}} /> },
            ]}
            discard={code => setDeck(removeCard(deck, code))}
            close={() => setSpread(false)}
            pick={(picked, seed) => {
                setSpread(false)
                setTab(Tab.Listen)
                if (picked !== code || seed !== undefined) loadCard(picked, seed)
            }}
            pickTab={index => { setSpread(false); setTab(index) }} />}
        <div className="pile" style={spread ? { display: "none" } : undefined}>
            <div className="pile-edges"></div>
            <div className="tabs pile-tabs">{tabButtons(false)}</div>
            <div className="pile-card pile-top" style={{ borderStyle: dragging ? "dashed" : "solid" }} {...pileHandlers}>
                <div style={{ margin: "20px" }}>{logo}{panes}</div>
                <div className="tabs own-tab">{tabButtons(true)}</div>
                {/* Printed at the corner, as index cards say "over". */}
                {binary && tab === Tab.Listen && <button className={"over" + (turned ? " turned" : "")} title={turned ? "Turn the card back over" : "Turn the card over, to read its code"} onClick={flip}><Redo /></button>}
            </div>
        </div>
    </div>
    </div>
}

export default App
