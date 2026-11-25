import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { encodeBlob } from "./base43Encoder"
import { CompileStage, cancelCompile, compileCard } from "./compiler"
import { compileBytebeat } from "./bytebeat"
import { compilePattern } from "./pattern"
import { Language, getSource, saveSource, templates } from "./sources"
import { highlight } from "./highlight"
import { assembleWat } from "./assemble"
import { disassembleWasm } from "./wasmTracer"
import { maxCardSize } from "./card"

const LINE_HEIGHT = 12 * 1.3, PADDING = 6 // of the text; see `.editor` in App.css

// A strip of colour behind each line of text, for how much it's running (tracing).
function drawHeat(canvas: HTMLCanvasElement | null, lines: Float32Array | null, scroll: number) {
    if (!canvas) return
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
    if (!lines) return
    const context = canvas.getContext("2d")!
    const first = Math.max(0, Math.floor((scroll - PADDING) / LINE_HEIGHT))
    for (let line = first; line < lines.length && (line - first) * LINE_HEIGHT < canvas.height + LINE_HEIGHT; line++) {
        if (!lines[line]) continue
        context.fillStyle = `rgb(0 255 0 / ${lines[line] * 45}%)`
        context.fillRect(0, PADDING + line * LINE_HEIGHT - scroll, canvas.width, LINE_HEIGHT)
    }
}

export interface BackHandle {
    // Colour the lines of the card's WebAssembly text by how much each is running (null to stop).
    showHeat: (heat: Float32Array | null) => void
}

// The back of a card: what the card itself holds, as WebAssembly text. It's only for reading (with
// tracing on, the lines that are running light up); writing happens on the workbench, below.
// `children` go in the strip under the text.
export const CardBack = forwardRef<BackHandle, { binary: Uint8Array | null, active: boolean, children?: React.ReactNode }>(function CardBack({ binary, active, children }, ref) {
    const [shown, setShown] = useState<{ binary: Uint8Array, text: string } | null>(null)
    useEffect(() => {
        // (This is the same disassembly that tracing works from, so its line numbers match.)
        if (active && binary && binary !== shown?.binary) setShown({ binary, text: disassembleWasm(binary).lines.join("\n") })
    }, [binary, active])
    const text = shown?.binary === binary ? shown!.text : ""
    const highlighted = useMemo(() => highlight(text, "Wasm"), [text])
    const heatCanvas = useRef<HTMLCanvasElement>(null)
    const heat = useRef<Float32Array | null>(null)
    const pre = useRef<HTMLPreElement>(null)
    const draw = () => drawHeat(heatCanvas.current, heat.current, pre.current?.scrollTop ?? 0)
    useEffect(draw, [text, active])
    useImperativeHandle(ref, () => ({
        showHeat: lines => {
            heat.current = lines
            draw()
        },
    }))
    return <div className="source">
        <div className="editor reading">
            <canvas ref={heatCanvas}></canvas>
            <pre ref={pre} tabIndex={0} onScroll={draw}>{highlighted}{"\n"}</pre>
        </div>
        <div>{children}</div>
    </div>
})

// The ways to write a card. The first three are kept as written; "Wasm" is WebAssembly text.
const MODES: { [mode in Language | "Wasm"]: string } = {
    C: "Write the card in C",
    Beat: "Bytebeat: one expression in t",
    Pattern: "A pattern, in mini-notation",
    Wasm: "Write the card as WebAssembly text",
}
type Mode = keyof typeof MODES

const scratchKey = (language: Language) => language === "C" ? "scorecard-source" : `scorecard-source-${language}`

function loadScratch() {
    const texts = {} as { [language in Language]: string }
    for (const language of ["C", "Beat", "Pattern"] as const) {
        const fresh = Object.values(templates[language])[0]
        try {
            texts[language] = localStorage.getItem(scratchKey(language)) ?? fresh
        } catch {
            texts[language] = fresh
        }
    }
    return texts
}

export interface WorkbenchHandle {
    // Make sure the loaded card is what's written here; resolves to whether it is.
    build: () => Promise<boolean>
}

const THIS_CARD = "\0this card"

// The workbench: the card behind the Create tab, for writing new cards. It keeps its own text,
// whatever card is loaded: the loaded card only comes into it if you ask to start from it (from
// what it was written in, if that's known: the starter pack's sources ship with the app, and
// whatever is built here is remembered; otherwise from its WebAssembly text). Playing builds what's
// written, if that isn't the loaded card already. `binary` is the loaded card, and `played` the
// one that runs (what the loaded card generates, if it does that); `onBuild` is told of each card
// built here just before it's loaded.
export const Workbench = forwardRef<WorkbenchHandle, {
    binary: Uint8Array | null, played: Uint8Array | null, code: string | null, title: string,
    loadBinary: (b: Uint8Array) => Promise<void>, onBuild: (b: Uint8Array) => void,
}>(function Workbench({ binary, played, code, title, loadBinary, onBuild }, ref) {
    const [mode, setMode] = useState<Mode>("C")
    const [texts, setTexts] = useState(loadScratch)
    const [wat, setWAT] = useState("")
    const [log, setLog] = useState("")
    // null: idle; otherwise, what the build is up to, and since when.
    const [busy, setBusy] = useState<CompileStage | null>(null)
    const [busySince, setBusySince] = useState(0)
    const [, tick] = useState(0)
    useEffect(() => {
        if (busy === null) return
        const timer = setInterval(() => tick(t => t + 1), 1000)
        return () => clearInterval(timer)
    }, [busy !== null])
    // The last card built here, and what it was built from, to tell whether the editor has moved on.
    const [built, setBuilt] = useState<{ card: Uint8Array, mode: Mode, text: string } | null>(null)

    const text = mode === "Wasm" ? wat : texts[mode]
    const setText = (text: string, language = mode) => {
        if (language === "Wasm") return setWAT(text)
        setTexts(texts => ({ ...texts, [language]: text }))
        try {
            localStorage.setItem(scratchKey(language), text)
        } catch {}
    }

    const dirty = !(built && built.card === binary && built.mode === mode && built.text === text)

    const build = async () => {
        if (busy !== null) {
            // Pressing play again while building stops the build.
            cancelCompile()
            return false
        }
        if (!dirty) return true
        setBusy("compiling")
        setBusySince(Date.now())
        const progress = (stage: CompileStage) => {
            setBusy(stage)
            if (stage === "compiling") setBusySince(Date.now())
        }
        let result: { binary?: Uint8Array, log: string }
        if (mode === "C") {
            result = await compileCard(text, progress)
        } else if (mode === "Beat") {
            result = await compileBytebeat(text)
        } else if (mode === "Pattern") {
            result = compilePattern(text)
        } else {
            try {
                result = { binary: await assembleWat(wat), log: "" }
            } catch (e: any) {
                result = { log: String(e.message ?? e).trim() }
            }
        }
        setBusy(null)
        const card = result.binary
        if (card && card.length > maxCardSize()) {
            setLog(`${result.log}\nThat makes ${card.length} bytes, which is ${card.length - maxCardSize()} too many to fit in a QR code.`.trim())
            return false
        }
        setLog(result.log.trim())
        if (!card) return false
        if (mode !== "Wasm") saveSource(encodeBlob(card), text, mode)
        setBuilt({ card, mode, text })
        onBuild(card)
        await loadBinary(card)
        return true
    }

    useImperativeHandle(ref, () => ({ build }))

    // Start from the loaded card: from its source if we have that, from its WebAssembly text otherwise.
    const known = code ? getSource(code) : undefined
    const startFrom = (name: string) => {
        const target: Mode = name !== THIS_CARD ? mode : known ? known.language : "Wasm"
        const fresh = name !== THIS_CARD ? templates[mode as Language][name] : known ? known.source : disassembleWasm((played ?? binary)!).lines.join("\n")
        const current = target === "Wasm" ? wat : texts[target]
        const untouched = current.trim() === "" || current === fresh || (target !== "Wasm" && Object.values(templates[target]).includes(current))
            || (built?.mode === target && built.text === current)
        if (!untouched && !window.confirm("Replace what you've written?")) return
        setText(fresh, target)
        setMode(target)
        setLog("")
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            build()
        } else if (e.key === "Tab" && !e.shiftKey) {
            // Indent, rather than leaving the editor.
            e.preventDefault()
            document.execCommand("insertText", false, "    ")
        }
    }

    const highlighted = useMemo(() => highlight(text, mode), [text, mode])
    const backdrop = useRef<HTMLPreElement>(null)
    const max = maxCardSize()
    const seconds = Math.floor((Date.now() - busySince) / 1000)
    const status = typeof busy === "number" ? `fetching compiler: ${Math.floor(busy * 100)}%`
        : busy === "loading" ? "loading compiler..."
        : busy ? `building...${seconds >= 3 ? ` ${seconds}s (play again to stop)` : ""}`
        : dirty ? (log ? "has errors" : text.trim() ? "play to build" : "")
        : `${max - binary!.length} left`
    return <div className="source">
        <div className="editor">
            {/* The colours come from a copy of the text behind the (see-through) textarea. */}
            <pre ref={backdrop} aria-hidden>{highlighted}{"\n"}</pre>
            <textarea spellCheck={false} autoCapitalize="off" autoCorrect="off" onKeyDown={onKeyDown}
                placeholder={mode === "Wasm" ? "(module ...)" : undefined}
                onScroll={e => backdrop.current?.scrollTo(e.currentTarget.scrollLeft, e.currentTarget.scrollTop)}
                value={text} onChange={e => setText(e.target.value)}></textarea>
        </div>
        {log && <pre className="log">{log}</pre>}
        <div>
            <div className="modes">
                {(Object.keys(MODES) as Mode[]).map(m =>
                    <button key={m} className={m === mode ? "active" : ""} title={MODES[m]} onClick={() => { setMode(m); setLog("") }}>{m}</button>
                )}
            </div>
            <select value="" title="Start from an example, or from the card on the pile" onChange={e => startFrom(e.target.value)}>
                <option value="" disabled>New...</option>
                {binary && <option value={THIS_CARD}>from {title}</option>}
                {mode !== "Wasm" && Object.keys(templates[mode]).map(name => <option key={name}>{name}</option>)}
            </select>
            <span>{status}</span>
        </div>
    </div>
})

export type Face = "qr" | "bits" | "back" | "write"
