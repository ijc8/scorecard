import { useEffect, useRef, useState } from "react"
import { assembleWat } from "./assemble"
import { disassembleWasm } from "./wasmTracer"
import { Tab } from "./tabs"

export function Create({ binary, loadBinary, wat, setWAT, tab }: {
    binary: Uint8Array | null, loadBinary: (b: Uint8Array) => void, wat: string, setWAT: (w: string) => void, tab: number
}) {
    const [error, setError] = useState("")
    const oldBinary = useRef(binary)
    useEffect(() => {
        if (tab !== Tab.Create || !binary || binary === oldBinary.current) return
        oldBinary.current = binary
        setWAT(disassembleWasm(binary).lines.join("\n"))
        setError("")
    }, [binary, tab])

    const assemble = async () => {
        let assembled
        try {
            assembled = await assembleWat(wat)
        } catch (e: any) {
            setError(String(e.message ?? e))
            return
        }
        setError("")
        loadBinary(assembled)
    }

    return <>
        <textarea style={{ width: "100%", flexGrow: "1" }} value={wat} onChange={e => setWAT(e.target.value)}></textarea><br />
        <button id="assemble" onClick={assemble}>Assemble!</button><br />
        {error && <div id="assemble-error" style={{ textAlign: "left", whiteSpace: "pre-wrap" }}>{error}</div>}
    </>
}
