import { useEffect, useRef } from "react"
import { getWabt } from "./lazyWabt"
import { Tab } from "./tabs"

export function Create({ binary, loadBinary, wat, setWAT, tab }: {
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

    const assemble = async () => {
        console.log("assembling", wat)
        console.log("text size", wat.length)
        const wabt = await getWabt()
        // TODO: Show errors.
        const result = wabt.parseWat("main.wasm", wat).toBinary({})
        console.log(result.log)
        loadBinary(result.buffer)
    }

    return <>
        <textarea style={{ width: "100%", flexGrow: "1" }} value={wat} onChange={e => setWAT(e.target.value)}></textarea><br />
        <button id="assemble" onClick={assemble}>Assemble!</button><br />
    </>
}
