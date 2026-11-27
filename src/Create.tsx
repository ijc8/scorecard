import { useEffect, useRef, useState } from "react"
import { assembleWat } from "./assemble"
import { disassembleWasm } from "./wasmTracer"
import { Tab } from "./tabs"
import { PrintableCard, canPrintDirectly, printCard, saveCardImage } from "./print"

export function Create({ binary, loadBinary, wat, setWAT, tab, printable }: {
    binary: Uint8Array | null, loadBinary: (b: Uint8Array) => void, wat: string, setWAT: (w: string) => void, tab: number,
    printable: () => PrintableCard,
}) {
    // How printing is going.
    const [printing, setPrinting] = useState("")
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", justifyContent: "center", marginTop: "8px" }}>
            <button id="assemble" onClick={assemble}>Assemble!</button>
            {/* The loaded card as a thing: printed, or as a picture. */}
            <button id="save-picture" disabled={!binary} title="Save the card as a picture (or share it, to a printer's app)" onClick={() => saveCardImage(printable())}>Save picture</button>
            {canPrintDirectly() && <button id="print" disabled={!binary} title="Print on a Bluetooth thermal printer (paired with this device)" onClick={async () => {
                try {
                    await printCard(printable(), setPrinting)
                } catch (e: any) {
                    setPrinting(e?.name === "NotFoundError" ? "" : String(e?.message ?? e))
                }
            }}>Print</button>}
            <span>{printing}</span>
        </div>
        {error && <div id="assemble-error" style={{ textAlign: "left", whiteSpace: "pre-wrap" }}>{error}</div>}
    </>
}
