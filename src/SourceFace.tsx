import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { encodeBlob } from "./base43Encoder"
import { compileCard } from "./compiler"
import newCardSource from "./newCard.c?raw"
import { getSource, saveSource, templates } from "./sources"
import { highlight } from "./highlight"
import { getWabt } from "./lazyWabt"
import { maxCardSize } from "./card"

export function loadScratch() {
    try {
        return localStorage.getItem("scorecard-source") ?? newCardSource
    } catch {
        return newCardSource
    }
}

export interface SourceHandle {
    // Make sure the loaded card is up to date with the editor; resolves to whether it is.
    build: () => Promise<boolean>
}

// The third side of a card: its source. That's C if we know it (the starter pack's sources ship with
// the app, and whatever is compiled here is remembered), and otherwise the WebAssembly text that
// the card disassembles to. Either can be edited; playing rebuilds the card if it has been.
export const SourceFace = forwardRef<SourceHandle, {
    binary: Uint8Array | null, code: string | null, loadBinary: (b: Uint8Array) => Promise<void>, active: boolean
}>(function SourceFace({ binary, code, loadBinary, active }, ref) {
    const [mode, setMode] = useState<"C" | "Wasm">("C")
    const [source, _setSource] = useState(loadScratch)
    const [wat, setWAT] = useState("")
    const [log, setLog] = useState("")
    // null: idle; a number: fetching the compiler (0 to 1); true: building.
    const [busy, setBusy] = useState<number | true | null>(null)
    // What the loaded card was built from (in each language), to tell whether the editor has moved on.
    const [builtSource, setBuiltSource] = useState<string | null>(null)
    const [builtWAT, setBuiltWAT] = useState("")
    const ownBuild = useRef<Uint8Array | null>(null)

    const setSource = (source: string) => {
        _setSource(source)
        try {
            localStorage.setItem("scorecard-source", source)
        } catch {}
    }

    // When another card is loaded, show its source: C if we have it, WebAssembly otherwise.
    useEffect(() => {
        if (!code || binary === ownBuild.current) return
        const known = getSource(code)
        setLog("")
        setBuiltSource(known ?? null)
        if (known === undefined) return setMode("Wasm")
        _setSource(known)
        setMode("C")
    }, [code])

    const disassembled = useRef<Uint8Array | null>(null)
    useEffect(() => {
        if (!active || mode !== "Wasm" || !binary || binary === disassembled.current) return
        disassembled.current = binary
        getWabt().then(wabt => {
            const module = wabt.readWasm(binary, { readDebugNames: true })
            module.applyNames()
            const text = module.toText({ foldExprs: false, inlineExport: true })
            module.destroy()
            setWAT(text)
            setBuiltWAT(text)
        })
    }, [binary, active, mode])

    const dirty = mode === "C" ? source !== builtSource : wat !== builtWAT

    const build = async () => {
        if (busy !== null) return false
        if (!dirty && binary) return true
        setBusy(true)
        let result: { binary?: Uint8Array, log: string }
        if (mode === "C") {
            result = await compileCard(source, fraction => setBusy(fraction < 1 ? fraction : true))
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
        const built = result.binary
        if (built && built.length > maxCardSize()) {
            setLog(`${result.log}\nThat makes ${built.length} bytes, which is ${built.length - maxCardSize()} too many to fit in a QR code.`.trim())
            return false
        }
        setLog(result.log.trim())
        if (!built) return false
        ownBuild.current = built
        if (mode === "C") {
            saveSource(encodeBlob(built), source)
            setBuiltSource(source)
        } else {
            setBuiltWAT(wat)
            setBuiltSource(null)
        }
        await loadBinary(built)
        return true
    }
    useImperativeHandle(ref, () => ({ build }))

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            build()
        } else if (e.key === "Tab" && !e.shiftKey) {
            // Indent, rather than leaving the editor.
            e.preventDefault()
            document.execCommand("insertText", false, "    ")
        }
    }

    const text = mode === "C" ? source : wat
    const highlighted = useMemo(() => highlight(text, mode), [text, mode])
    const backdrop = useRef<HTMLPreElement>(null)
    const max = maxCardSize()
    const status = typeof busy === "number" ? `fetching compiler: ${Math.floor(busy * 100)}%`
        : busy ? "building..."
        : dirty ? (/error/.test(log) ? "has errors" : "edited: play to rebuild")
        : binary ? `${max - binary.length} bytes left` : ""
    return <div className="source">
        <div className="editor">
            {/* The colours come from a copy of the text behind the (see-through) textarea. */}
            <pre ref={backdrop} aria-hidden>{highlighted}{"\n"}</pre>
            <textarea spellCheck={false} autoCapitalize="off" autoCorrect="off" onKeyDown={onKeyDown}
                onScroll={e => backdrop.current?.scrollTo(e.currentTarget.scrollLeft, e.currentTarget.scrollTop)}
                value={text} onChange={e => mode === "C" ? setSource(e.target.value) : setWAT(e.target.value)}></textarea>
        </div>
        {log && <pre className="log">{log}</pre>}
        <div>
            <div className="modes">
                {(["C", "Wasm"] as const).map(m =>
                    <button key={m} className={m === mode ? "active" : ""} title={m === "C" ? "Write the card in C" : "The card as WebAssembly text"} onClick={() => { setMode(m); setLog("") }}>{m}</button>
                )}
            </div>
            {mode === "C" && <select value="" title="Start from an example" onChange={e => {
                if (!dirty || source.trim() === "" || window.confirm("Replace what you've written?")) {
                    setSource(templates[e.target.value])
                    setLog("")
                }
            }}>
                <option value="" disabled>New...</option>
                {Object.keys(templates).map(name => <option key={name}>{name}</option>)}
            </select>}
            <span>{status}</span>
        </div>
    </div>
})

export type Face = "qr" | "bits" | "source"

