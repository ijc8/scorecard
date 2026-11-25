import * as wasmparser from "wasmparser/dist/esm/WasmParser"
import * as wasmdis from "wasmparser/dist/esm/WasmDis"
import { assembleWat } from "./assemble"
import { findDataSegments } from "./memoryTrace"

export type TraceMap = {
    [key: number]: {
        start: { line: number, offset: number },
        end: { line: number, offset: number }
    }
}

export function disassembleWasm(binary: Uint8Array) {
    const reader = new wasmparser.BinaryReader()
    reader.setData(binary.buffer as ArrayBuffer, binary.byteOffset, binary.byteLength)
    const dis = new wasmdis.WasmDisassembler()
    dis.addOffsets = true
    dis.skipTypes = true
    if (!dis.disassembleChunk(reader)) {
        throw new Error("Unexpected EOF in wasm")
    }
    return dis.getResult()
}

// The card's WebAssembly text, with calls out to `scorecard.log` (execution) and `scorecard.read` and
// `scorecard.write` (memory) added, and where each block of code that's counted lies in the text.
export function instrumentWat(binary: Uint8Array) {
    const result = disassembleWasm(binary)
    let id = 0
    const out: string[] = []
    const markers: { line: number, offset: number }[] = []
    let doneWithFunctions = false
    result.lines.forEach(function (s, index) {
        const offset = result.offsets![index]
        // console.log(s, offset)
        // Memory accesses are traced too, by passing each address through `scorecard.read` or
        // `scorecard.write` (along with the instruction's static offset and the access size) on its way
        // to the load or store. For a store, the value on top of the stack is set aside in a local first.
        const access = s.match(/^ *(i32|i64|f32|f64)\.(load|store)(8|16|32)?(?:_[su])?(?: offset=(\d+))?/)
        if (access) {
            const [, type, op, bits, offset] = access
            const size = bits ? Number(bits) / 8 : (type.endsWith("32") ? 4 : 8)
            const call = [`i32.const ${offset ?? 0}`, `i32.const ${size}`, `call $${op === "load" ? "read" : "write"}`]
            out.push(...(op === "load" ? call : [`local.set $trace_${type}`, ...call, `local.get $trace_${type}`]))
        }
        out.push(s)
        // HACK: Instrument binary for execution tracing by editing the WAT
        // This is accomplished by generating a new import for a `log` function,
        // and inserting calls at key points for control flow (the start of each "basic block" of a CFG).
        // Each inserted call to `scorecard.log` has a unique ID.
        // We generate a map from log IDs to regions of code that must have been executed if we see that ID.
        // This map includes both line numbers (for the text format) and byte offsets (for the binary format).
        if (s.match(/^\(module/)) {
            out.push(
                '(import "scorecard" "log" (func $log (param i32)))',
                '(import "scorecard" "read" (func $read (param i32 i32 i32) (result i32)))',
                '(import "scorecard" "write" (func $write (param i32 i32 i32) (result i32)))',
            )
        }
        if (s.match(/^ *\(func /)) {
            markers.push({ line: index, offset: result.offsets![index - 1] })
        }
        if (s.match(/^ *\((func|local) /) && !result.lines[index+1]?.match(/^ *\(local/)) {
            // (Scratch locals for traced stores go after the function's own, so as not to renumber them.)
            out.push("(local $trace_i32 i32) (local $trace_i64 i64) (local $trace_f32 f32) (local $trace_f64 f64)")
            out.push(`(call $log (i32.const ${id++}))`)
        } else if (s.match(/^ *(br_if|if|else|loop|end)/)) {
            const line = `(call $log (i32.const ${id++}))`
            // console.log("INSERT:", line)
            out.push(line)
            markers.push({ line: index + 1, offset })
        }
        if (!doneWithFunctions && (s.match(/^ *\(data /) || s.match(/^\)/))) {
            markers.push({ line: index, offset: result.offsets![index - 1] })
            doneWithFunctions = true
        }
    })
    const map: TraceMap = {}
    for (let i = 0; i < id; i++) {
        map[i] = {
            start: markers[i],
            end: markers[i + 1],
        }
    }
    return { text: out.join("\n"), map }
}

export async function instrumentWasm(binary: Uint8Array) {
    const { text, map } = instrumentWat(binary)
    return { binary: await assembleWat(text), map, data: findDataSegments(binary) }
}

// Gas metering (an experiment): the card's WebAssembly text with a counter added, so that a card
// that never returns can be stopped. Every pass through a loop takes one from a global, `gas`
// (exported, for whoever runs the card to top up before each call); when it reaches zero the card
// traps. Loops are the only place this is needed: endless recursion runs out of stack by itself.
export const GAS_EXPORT = "gas"
export function meterWat(binary: Uint8Array) {
    const { lines } = disassembleWasm(binary)
    const out: string[] = []
    const end = lines.lastIndexOf(")")
    lines.forEach((line, index) => {
        if (index === end) out.push(`(global $gas (export "${GAS_EXPORT}") (mut i32) (i32.const 0))`)
        out.push(line)
        if (/^ *loop\b/.test(line)) {
            out.push("global.get $gas", "i32.const 1", "i32.sub", "global.set $gas", "global.get $gas", "i32.eqz", "if", "unreachable", "end")
        }
    })
    return out.join("\n")
}
