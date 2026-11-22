import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { encodeBlob } from "./base43Encoder"
import { compileCard } from "./compiler"
import { compileBytebeat } from "./bytebeat"
import { compilePattern } from "./pattern"
import { Language, getSource, saveSource, templates } from "./sources"
import { highlight } from "./highlight"
import { getWabt } from "./lazyWabt"
import { disassembleWasm } from "./wasmTracer"
import { maxCardSize } from "./card"

// The ways to write a card. The first three are kept as written; "Wasm" is the card itself as
// WebAssembly text, which any card can be shown as.
const MODES: { [mode in Language | "Wasm"]: string } = {
    C: "Write the card in C",
    Beat: "Bytebeat: one expression in t",
    Pattern: "A pattern, in mini-notation",
    Wasm: "The card as WebAssembly text",
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

export interface SourceHandle {
    // Make sure the loaded card is up to date with the editor; resolves to whether it is.
    build: () => Promise<boolean>
    // Colour the lines of the card's WebAssembly text by how much each is running (null to stop).
    showHeat: (heat: Float32Array | null) => void
    // Turn to the WebAssembly text (which is what tracing can light up).
    showWasm: () => void
}

const LINE_HEIGHT = 12 * 1.3, PADDING = 6 // of the editor's text; see `.editor` in App.css

// The third side of a card: its source. That's what it was written in if we know it (the starter
// pack's sources ship with the app, and whatever is built here is remembered), and otherwise the
// WebAssembly text that the card disassembles to. Any of them can be edited; playing rebuilds the
// card if it has been.
export const SourceFace = forwardRef<SourceHandle, {
    binary: Uint8Array | null, code: string | null, loadBinary: (b: Uint8Array) => Promise<void>, active: boolean
}>(function SourceFace({ binary, code, loadBinary, active }, ref) {
    const [mode, setMode] = useState<Mode>("C")
    const [texts, setTexts] = useState(loadScratch)
    const [wat, setWAT] = useState("")
    const [log, setLog] = useState("")
    // null: idle; a number: fetching the compiler (0 to 1); true: building.
    const [busy, setBusy] = useState<number | true | null>(null)
    // What the loaded card was built from, to tell whether the editor has moved on.
    const [built, setBuilt] = useState<{ language: Language, text: string } | null>(null)
    const [builtWAT, setBuiltWAT] = useState("")
    const ownBuild = useRef<Uint8Array | null>(null)

    const text = mode === "Wasm" ? wat : texts[mode]
    const setText = (text: string, language = mode) => {
        if (language === "Wasm") return setWAT(text)
        setTexts(texts => ({ ...texts, [language]: text }))
        try {
            localStorage.setItem(scratchKey(language), text)
        } catch {}
    }

    // When another card is loaded, show its source: as it was written if we have that, as WebAssembly otherwise.
    useEffect(() => {
        if (!code || binary === ownBuild.current) return
        const known = getSource(code)
        setLog("")
        setBuilt(known ? { language: known.language, text: known.source } : null)
        if (!known) return setMode("Wasm")
        setTexts(texts => ({ ...texts, [known.language]: known.source }))
        setMode(known.language)
    }, [code])

    const disassembled = useRef<Uint8Array | null>(null)
    useEffect(() => {
        if (!active || mode !== "Wasm" || !binary || binary === disassembled.current) return
        disassembled.current = binary
        // (This is the same disassembly that tracing works from, so its line numbers match.)
        const text = disassembleWasm(binary).lines.join("\n")
        setWAT(text)
        setBuiltWAT(text)
    }, [binary, active, mode])

    const dirty = mode === "Wasm" ? wat !== builtWAT : !(built && built.language === mode && built.text === text)

    const build = async () => {
        if (busy !== null) return false
        if (!dirty && binary) return true
        setBusy(true)
        const progress = (fraction: number) => setBusy(fraction < 1 ? fraction : true)
        let result: { binary?: Uint8Array, log: string }
        if (mode === "C") {
            result = await compileCard(text, progress)
        } else if (mode === "Beat") {
            result = await compileBytebeat(text)
        } else if (mode === "Pattern") {
            // A pattern becomes C, which is then compiled like any other.
            const pattern = compilePattern(text)
            result = pattern.c ? await compileCard(pattern.c, progress) : pattern
        } else {
            const wabt = await getWabt()
            let module
            try {
                module = wabt.parseWat("card.wat", wat)
                result = { binary: module.toBinary({}).buffer, log: "" }
            } catch (e: any) {
                result = { log: String(e.message ?? e).trim() }
            } finally {
                module?.destroy()
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
        ownBuild.current = card
        if (mode === "Wasm") {
            setBuiltWAT(wat)
            setBuilt(null)
        } else {
            saveSource(encodeBlob(card), text, mode)
            setBuilt({ language: mode, text })
        }
        await loadBinary(card)
        return true
    }

    // Tracing: a strip of colour behind each line of the WebAssembly text, for how much it's running.
    const heatCanvas = useRef<HTMLCanvasElement>(null)
    const heat = useRef<Float32Array | null>(null)
    const textarea = useRef<HTMLTextAreaElement>(null)
    const drawHeat = () => {
        const canvas = heatCanvas.current, lines = heat.current
        if (!canvas || !textarea.current) return
        canvas.width = canvas.clientWidth
        canvas.height = canvas.clientHeight
        if (!lines || mode !== "Wasm" || dirty) return
        const context = canvas.getContext("2d")!
        const scroll = textarea.current.scrollTop
        const first = Math.max(0, Math.floor((scroll - PADDING) / LINE_HEIGHT))
        for (let line = first; line < lines.length && (line - first) * LINE_HEIGHT < canvas.height + LINE_HEIGHT; line++) {
            if (!lines[line]) continue
            context.fillStyle = `rgb(0 255 0 / ${lines[line] * 45}%)`
            context.fillRect(0, PADDING + line * LINE_HEIGHT - scroll, canvas.width, LINE_HEIGHT)
        }
    }
    useEffect(drawHeat, [mode, dirty])

    useImperativeHandle(ref, () => ({
        build,
        showHeat: lines => {
            heat.current = lines
            drawHeat()
        },
        showWasm: () => setMode("Wasm"),
    }))

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
    const status = typeof busy === "number" ? `fetching compiler: ${Math.floor(busy * 100)}%`
        : busy ? "building..."
        : dirty ? (log ? "has errors" : "edited: play to rebuild")
        : binary ? `${max - binary.length} bytes left` : ""
    return <div className="source">
        <div className="editor">
            <canvas ref={heatCanvas}></canvas>
            {/* The colours come from a copy of the text behind the (see-through) textarea. */}
            <pre ref={backdrop} aria-hidden>{highlighted}{"\n"}</pre>
            <textarea ref={textarea} spellCheck={false} autoCapitalize="off" autoCorrect="off" onKeyDown={onKeyDown}
                onScroll={e => {
                    backdrop.current?.scrollTo(e.currentTarget.scrollLeft, e.currentTarget.scrollTop)
                    drawHeat()
                }}
                value={text} onChange={e => setText(e.target.value)}></textarea>
        </div>
        {log && <pre className="log">{log}</pre>}
        <div>
            <div className="modes">
                {(Object.keys(MODES) as Mode[]).map(m =>
                    <button key={m} className={m === mode ? "active" : ""} title={MODES[m]} onClick={() => { setMode(m); setLog("") }}>{m}</button>
                )}
            </div>
            {mode !== "Wasm" && <select value="" title="Start from an example" onChange={e => {
                if (!dirty || text.trim() === "" || Object.values(templates[mode]).includes(text) || window.confirm("Replace what you've written?")) {
                    setText(templates[mode][e.target.value])
                    setLog("")
                }
            }}>
                <option value="" disabled>New...</option>
                {Object.keys(templates[mode]).map(name => <option key={name}>{name}</option>)}
            </select>}
            <span>{status}</span>
        </div>
    </div>
})

export type Face = "qr" | "bits" | "source"
