import * as wasmparser from "wasmparser/dist/esm/WasmParser"
import * as wasmdis from "wasmparser/dist/esm/WasmDis"

export function instrumentWat(content: Uint8Array) {
    const reader = new wasmparser.BinaryReader()
    reader.setData(content, 0, content.byteLength)
    const dis = new wasmdis.WasmDisassembler()
    dis.addOffsets = true
    dis.skipTypes = false
    if (!dis.disassembleChunk(reader)) {
        throw new Error("Unexpected EOF in wasm")
    }
    const result = dis.getResult()
    let id = 0
    const out: string[] = []
    const markers: { line: number, offset: number }[] = []
    let doneWithFunctions = false
    result.lines.forEach(function (s, index) {
        const offset = result.offsets![index]
        console.log(s, offset)
        out.push(s)
        // HACK: Instrument binary for execution tracing by editing the WAT
        // This is accomplished by generating a new import for a `log` function,
        // and inserting calls at key points for control flow (the start of each "basic block" of a CFG).
        // Each inserted call to `scorecard.log` has a unique ID.
        // We generate a map from log IDs to regions of code that must have been executed if we see that ID.
        // This map includes both line numbers (for the text format) and byte offsets (for the binary format).
        if (s.match(/^ *\(type/) && !result.lines[index+1]?.match(/^ *\(type/)) {
            const line = '(import "scorecard" "log" (func $log (param i32)))'
            console.log("INSERT:", line)
            out.push(line)
        }
        if (s.match(/^ *\(func /)) {
            markers.push({ line: index, offset: result.offsets![index - 1] })
        }
        if (s.match(/^ *\((func|local) /) && !result.lines[index+1]?.match(/^ *\(local/)) {
            const line = `(call $log (i32.const ${id++}))`
            console.log("INSERT:", line)
            out.push(line)
        } else if (s.match(/^ *(br_if|if|else|loop|end)/)) {
            const line = `(call $log (i32.const ${id++}))`
            console.log("INSERT:", line)
            out.push(line)
            markers.push({ line: index + 1, offset })
        }
        if (!doneWithFunctions && (s.match(/^ *\(data /) || s.match(/^\)/))) {
            markers.push({ line: index, offset: result.offsets![index - 1] })
            doneWithFunctions = true
        }
    })
    const logMap: { [key: number]: { start: { line: number, offset: number }, end: { line: number, offset: number } } } = {}
    for (let i = 0; i < id; i++) {
        logMap[i] = {
            start: markers[i],
            end: markers[i + 1],
        }
    }
    return { original: result.lines.join("\n"), instrumented: out.join("\n"), logMap }
}
