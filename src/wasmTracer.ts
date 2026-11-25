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

// Gas metering: the card's WebAssembly text with a counter added, so that a card that never
// returns can be stopped. Loops are the only place this is needed: endless recursion runs out of
// stack by itself. Each function counts its own passes through loops in a local (which costs next
// to nothing: an add and a compare, in a register), and every 64th pass takes 64 from a global,
// `gas` (exported, for whoever runs the card to top up before each call); when that runs out, the
// card traps. So what's metered is one call that goes on and on, to within 64 passes a function:
// short loops in a function that returns are never charged at all.
export const GAS_EXPORT = "gas"
const GAS_GLOBAL = `(global $gas (export "${GAS_EXPORT}") (mut i32) (i32.const 0))`
const GAS_LOCAL = "(local $gas_n i32)"
const GAS_CHECK = [
    "local.get $gas_n", "i32.const 1", "i32.add", "local.tee $gas_n", "i32.const 64", "i32.ge_u",
    "if",
    "i32.const 0", "local.set $gas_n",
    "global.get $gas", "i32.const 64", "i32.sub", "global.set $gas",
    "global.get $gas", "i32.const 0", "i32.le_s", "if", "unreachable", "end",
    "end",
]
// (A function's own locals come first; ours go after them, so as not to renumber any.)
const endsHeader = (lines: string[], index: number) => /^ *\((func|local) /.test(lines[index]) && !/^ *\(local/.test(lines[index + 1] ?? "")
// The card's WebAssembly text, with calls out to `scorecard.log` (execution) and `scorecard.read` and
// `scorecard.write` (memory) added, and where each block of code that's counted lies in the text.
// With `meter`, it's given a gas counter as well (see `meterWat`).
export function instrumentWat(binary: Uint8Array, meter = false) {
    const result = disassembleWasm(binary)
    const last = result.lines.lastIndexOf(")")
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
        if (meter && index === last) out.push(GAS_GLOBAL)
        out.push(s)
        if (meter && /^ *loop\b/.test(s)) out.push(...GAS_CHECK)
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
            if (meter) out.push(GAS_LOCAL)
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

export function meterWat(binary: Uint8Array) {
    const { lines } = disassembleWasm(binary)
    const out: string[] = []
    const end = lines.lastIndexOf(")")
    lines.forEach((line, index) => {
        if (index === end) out.push(GAS_GLOBAL)
        out.push(line)
        if (endsHeader(lines, index)) out.push(GAS_LOCAL)
        if (/^ *loop\b/.test(line)) out.push(...GAS_CHECK)
    })
    return out.join("\n")
}
