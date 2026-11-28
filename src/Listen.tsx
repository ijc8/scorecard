import { RefObject, useEffect, useRef, useState } from "react"
import Play from "pixelarticons/svg/play.svg?react"
import Pause from "pixelarticons/svg/pause.svg?react"
import Prev from "pixelarticons/svg/prev.svg?react"
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
import TraceIcon from "pixelarticons/svg/search.svg?react"
import { formatSeed, formatTime } from "./card"
import { TraceData, tracer } from "./trace"
import { globalHeat } from "./wasmTracer"
import { dlog } from "./debug"
import { audioHealthy, sendToWorklet } from "./audio"
import { Forward, QRIcon, ScoreIcon } from "./icons"
import { Score } from "./Score"

// What the card shows where its QR code is: that, its bits at work (traced), or its score.
type View = "qr" | "bits" | "score"
const VIEWS: { name: View, title: string, Icon: React.FunctionComponent<React.SVGProps<SVGSVGElement>> }[] = [
    { name: "qr", title: "The card's QR code", Icon: QRIcon },
    { name: "bits", title: "The card's bits, at work as it plays", Icon: TraceIcon },
    { name: "score", title: "The card's score: the music to come, drawn out", Icon: ScoreIcon },
]

function SeedInput({ seed, setSeed }: any) {
    const [contents, setContents] = useState("")
    // (Enter submits and then takes the focus away, which submits again: once is enough.)
    const submitted = useRef(seed)
    useEffect(() => {
        setContents(formatSeed(seed))
        submitted.current = seed
    }, [seed])

    const submit = () => {
        if (/^[0-9A-Fa-f]+$/.test(contents) && contents.length <= 8) {
            const typed = parseInt(contents, 16)
            if (typed !== submitted.current) setSeed(submitted.current = typed)
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

// Go to a time in the performance (in seconds): ahead by skipping, back by starting again with the
// same seed and skipping to there. Either way the card has to work its way through every sample in
// between (unheard), at up to 64 times real time.
type SetTime = (time: number | ((time: number) => number)) => void

function seekTo(target: number, time: number, seed: number, setTime: SetTime) {
    if (target >= time) sendToWorklet({ cmd: "skip", samples: Math.round((target - time) * 44100 / 128) * 128 })
    else sendToWorklet({ cmd: "reset", seed, skip: Math.round(target * 44100 / 128) * 128 })
    showPending(setTime, () => target)
}

// Before the first Play (or with the audio stopped by the system), the worklet isn't running, so
// it can't do the skipping or say where it has got to until it is: it will, as soon as Play starts
// it. Meanwhile the clock shows where the card is going to be, so that the next seek starts from there.
function showPending(setTime: SetTime, to: (time: number) => number) {
    if (!audioHealthy()) setTime(to)
}

// The clock. Tap it to type a time to go to.
function Clock({ time, seed, setTime, style }: { time: number, seed: number, setTime: SetTime, style: React.CSSProperties }) {
    const [editing, setEditing] = useState<string | null>(null)
    const go = (text: string) => {
        setEditing(null)
        const match = text.trim().match(/^(?:(\d+):)?(\d+(?:\.\d*)?)$/)
        if (!match) return
        seekTo(Number(match[1] ?? 0) * 60 + Number(match[2]), time, seed, setTime)
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

// Tap to skip ahead; hold to fast-forward (you hear snatches of the card as it goes by).
function SkipButton({ setTime, style }: { setTime: SetTime, style: React.CSSProperties }) {
    const hold = useRef<{ timer?: number, fast?: boolean } | null>(null)
    const down = (e: React.PointerEvent) => {
        try {
            e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
            // (Not a pointer that can be captured: it will do without.)
        }
        const h: { timer?: number, fast?: boolean } = {}
        h.timer = window.setTimeout(() => {
            h.fast = true
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
            sendToWorklet({ cmd: "speed", value: 1 })
        } else if (!cancelled) {
            sendToWorklet({ cmd: "skip", samples: SKIP_SECONDS * 44100 })
            showPending(setTime, time => time + SKIP_SECONDS)
        }
    }
    return <button id="skip" title={`Tap: skip ${SKIP_SECONDS} seconds. Hold: fast-forward.`} style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none", paddingLeft: 0 } as React.CSSProperties}
        onPointerDown={down} onPointerUp={() => up(false)} onPointerCancel={() => up(true)} onContextMenu={e => e.preventDefault()}>
        <Forward style={style} />
    </button>
}

// TODO: Specify types
export function Listen({ qrCanvas, title, size, seed, setSeed, seedLock, setSeedLock, state, setState, time, setTime, reset, error, buffer: binary, tracing, setTracing }: {
    qrCanvas: RefObject<HTMLCanvasElement>, title: string, size: number, seed: number, setSeed: (s: number) => void, seedLock: boolean,
    setSeedLock: (l: boolean) => void, state: any, setState: any, time: number, setTime: SetTime, reset: any, error: any, buffer: Uint8Array | null,
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
    // data and globals they encode are read (blue) or written (red). Below the card is a band for
    // the rest of memory: everything the card has touched that isn't part of the card itself,
    // squeezed to fit.
    const draw = () => {
        const trace = tracer.trace
        if (trace && !tracing) trace.logs.length = 0
        if (!tracing || !traceCanvas.current || !binary) return
        const shown = trace?.binary ?? binary
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
                const startByte = trace.map[id].start.offset
                const endByte = trace.map[id].end.offset
                for (let i = startByte * 8; i < endByte * 8; i++) paint(i, 0, 255, 0, count / max * 0.4)
            })
            // (Globals: read and written as much as the code that reads and writes them runs.)
            for (const { global, read, written } of globalHeat(trace.globals, lineHeat(trace))) {
                for (let i = global.start * 8; i < global.end * 8; i++) {
                    paintRead(i, read)
                    paintWrite(i, written)
                }
            }
            const { memory } = trace
            for (const segment of memory.data) {
                for (let byte = 0; byte < segment.length; byte++) {
                    const read = memory.heat("reads", segment, byte), written = memory.heat("writes", segment, byte)
                    if (!read && !written) continue
                    for (let i = (segment.offset + byte) * 8; i < (segment.offset + byte + 1) * 8; i++) {
                        paintRead(i, read)
                        paintWrite(i, written)
                    }
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

    // How much each line of the traced card's text is running, from 0 to 1.
    const lineHeat = (trace: TraceData) => {
        const lines = new Float32Array(trace.map[Object.keys(trace.map).length - 1].end.line + 1)
        const max = Math.max(...Object.values(trace.logs))
        trace.logs.forEach((count, id) => lines.fill(count / max, trace.map[id].start.line, trace.map[id].end.line))
        return lines
    }

    tracer.handleLogs = (traceLogs: number[]) => {
        const trace = tracer.trace
        if (trace === null || !trace.map[traceLogs.length - 1]) return
        const oldTraceLogs = trace.logs
        trace.logs = traceLogs
        // We use `forEach` because it skips empty slots, unlike other methods.
        oldTraceLogs.forEach((count, id) => {
            trace.logs[id] = Math.max(trace.logs[id] ?? 0, count * 0.6)
        })
        // TODO: Highlight lines of WAT in Create tab.
        // trace.logs.forEach((count, id) => {
        //     for (let line = trace.map[id].start.line; line < trace.map[id].end.line; line++) {
        //         newCounts[line] = count
        //     }
        // })
        draw()
    }

    useEffect(draw, [tracing, binary])

    const togglePlay = () => { setState(state === "playing" ? "paused" : "playing") }
    // (The card is traced while its bits show, and not otherwise.)
    const [scored, setScored] = useState(false)
    const view: View = tracing ? "bits" : scored ? "score" : "qr"
    const setView = (name: View) => {
        setScored(name === "score")
        if ((name === "bits") !== tracing) setTracing(name === "bits")
    }
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
            <canvas ref={qrCanvas} style={{ imageRendering: "pixelated", display: view === "qr" ? "block" : "none", visibility: showMessage ? "hidden" : "inherit", width: "100%" }} width="1" height="1"></canvas>
            <canvas ref={traceCanvas} style={{ imageRendering: "pixelated", display: tracing ? "block" : "none", visibility: showMessage ? "hidden" : "inherit", width: "100%" }} width="1" height="1"></canvas>
            <Score binary={binary} seed={seed} time={time} active={view === "score" && !showMessage} seek={target => seekTo(target, time, seed, setTime)} />
        </div>
        <h2 style={{ userSelect: "none", margin: "20px", fontSize: "6cqw" }}>
            {title} | {size} bytes{" "}
            <span className="views">
                {VIEWS.map(({ name, title, Icon }) => <button key={name} className={name === view ? "on" : ""} title={title} aria-pressed={name === view} onClick={() => setView(name)}><Icon /></button>)}
            </span>
        </h2>
        {/* Play sits in the middle column, so it stays in the centre whatever is on either side. */}
        <div className="play-controls" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", textAlign: "left", alignItems: "center", fontSize: "5cqw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "right" }}>
                <Clock {...{ time, seed, setTime, style: smallIconStyle }} />
                <button onTouchStart={touchStartReset} onMouseDown={mouseReset} onMouseUp={() => { events.current.reset = false }} style={{ touchAction: "manipulation" }}><Prev style={bigIconStyle} /></button>
            </div>
            <button id="start" onTouchStart={touchStartToggle} onMouseDown={mouseToggle} onMouseUp={() => { events.current.toggle = false }}>{state === "playing" ? <Pause style={bigIconStyle} /> : <Play style={bigIconStyle} />}</button>
            <div style={{ display: "flex", alignItems: "center" }}>
                <SkipButton setTime={setTime} style={{ ...bigIconStyle, height: "8cqw" }} />
                <div style={{ display: "flex", alignItems: "center", userSelect: "none" }}>
                    <button style={{ fontSize: 0 }}><DiceIcon style={smallIconStyle} onClick={() => setSeedLock(!seedLock)} /></button>
                    &nbsp;
                    <SeedInput {...{ seed, setSeed }} />
                </div>
            </div>
        </div>
    </div>
}
