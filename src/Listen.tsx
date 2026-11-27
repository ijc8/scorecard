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
import Bullseye from "pixelarticons/svg/bullseye.svg?react"
import BullseyeArrow from "pixelarticons/svg/bullseye-arrow.svg?react"
import { formatSeed, formatTime } from "./card"
import { tracer } from "./trace"
import { dlog } from "./debug"
import { audioHealthy, sendToWorklet } from "./audio"
import { Forward } from "./icons"

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

// Go to a time in the performance (in seconds): ahead by skipping, back by starting again with the
// same seed and skipping to there. Either way the card has to work its way through every sample in
// between (unheard), at up to 64 times real time.
function seekTo(target: number, time: number, seed: number) {
    if (target >= time) sendToWorklet({ cmd: "skip", samples: Math.round((target - time) * 44100 / 128) * 128 })
    else sendToWorklet({ cmd: "reset", seed, skip: Math.round(target * 44100 / 128) * 128 })
}

// The clock. Tap it to type a time to go to.
function Clock({ time, seed, style }: { time: number, seed: number, style: React.CSSProperties }) {
    const [editing, setEditing] = useState<string | null>(null)
    const go = (text: string) => {
        setEditing(null)
        const match = text.trim().match(/^(?:(\d+):)?(\d+(?:\.\d*)?)$/)
        if (!match) return
        seekTo(Number(match[1] ?? 0) * 60 + Number(match[2]), time, seed)
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
function SkipButton({ style }: { style: React.CSSProperties }) {
    const hold = useRef<{ timer?: number, fast?: boolean } | null>(null)
    const down = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId)
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
        }
    }
    return <button id="skip" title={`Tap: skip ${SKIP_SECONDS} seconds. Hold: fast-forward.`} style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none", paddingLeft: 0 } as React.CSSProperties}
        onPointerDown={down} onPointerUp={() => up(false)} onPointerCancel={() => up(true)} onContextMenu={e => e.preventDefault()}>
        <Forward style={style} />
    </button>
}

// TODO: Specify types
export function Listen({ qrCanvas, title, size, seed, setSeed, seedLock, setSeedLock, state, setState, time, reset, error, buffer: binary, tracing, setTracing }: {
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
    const draw = () => {
        const trace = tracer.trace
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
                const startByte = trace.map[id].start.offset
                const endByte = trace.map[id].end.offset
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
        <h2 style={{ userSelect: "none", margin: "20px", fontSize: "6cqw" }}>
            {title} | {size} bytes{" "}
            <button id="trace" title={tracing ? "Stop tracing" : "Trace: show which of the card's bits are running"} style={{ fontSize: 0, border: "none", padding: 0, verticalAlign: "middle" }} onClick={() => setTracing(!tracing)}>
                <TraceIcon style={{ height: "5cqw" }} />
            </button>
        </h2>
        {/* Play sits in the middle column, so it stays in the centre whatever is on either side. */}
        <div className="play-controls" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", textAlign: "left", alignItems: "center", fontSize: "5cqw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "right" }}>
                <Clock {...{ time, seed, style: smallIconStyle }} />
                <button onTouchStart={touchStartReset} onMouseDown={mouseReset} onMouseUp={() => { events.current.reset = false }} style={{ touchAction: "manipulation" }}><Prev style={bigIconStyle} /></button>
            </div>
            <button id="start" onTouchStart={touchStartToggle} onMouseDown={mouseToggle} onMouseUp={() => { events.current.toggle = false }}>{state === "playing" ? <Pause style={bigIconStyle} /> : <Play style={bigIconStyle} />}</button>
            <div style={{ display: "flex", alignItems: "center" }}>
                <SkipButton style={{ ...bigIconStyle, height: "8cqw" }} />
                <div style={{ display: "flex", alignItems: "center", userSelect: "none" }}>
                    <button style={{ fontSize: 0 }}><DiceIcon style={smallIconStyle} onClick={() => setSeedLock(!seedLock)} /></button>
                    &nbsp;
                    <SeedInput {...{ seed, setSeed }} />
                </div>
            </div>
        </div>
    </div>
}
