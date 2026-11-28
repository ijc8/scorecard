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
// Whatever the player rewrites a card for, it also has the card export all of its state: its
// memory, and every global that can change. With those, a card that's playing can be carried over
// into another rewriting of itself (traced, say) by copying the state across, and plays on from
// where it was: see `carryOver` in public/worklet.js.
export const STATE_PREFIX = "scorecard."
function stateExports(lines: string[]) {
    const out: string[] = []
    for (const line of lines) {
        const memory = /^ *\(memory (\$\S+)/.exec(line)
        if (memory) out.push(`(export "${STATE_PREFIX}memory" (memory ${memory[1]}))`)
        const global = /^ *\(global (\$\S+) \(mut (i32|i64|f32|f64)\)/.exec(line)
        if (global) out.push(`(export "${STATE_PREFIX}global${out.length}" (global ${global[1]}))`)
    }
    return out
}

// The card's own text with only that added, for a card that's neither traced nor metered.
export function plainWat(binary: Uint8Array) {
    const { lines } = disassembleWasm(binary)
    lines.splice(lines.lastIndexOf(")"), 0, ...stateExports(lines))
    return lines.join("\n")
}

// (A function's own locals come first; ours go after them, so as not to renumber any.)
const endsHeader = (lines: string[], index: number) => /^ *\((func|local) /.test(lines[index]) && !/^ *\(local/.test(lines[index + 1] ?? "")
// What a traced card is given to keep its own account in, where its memory allows (`shadowFor`):
// the card's memory is made a little over three times the size, and above the card's own part
// (`size` bytes, which is all the card can reach: see `access`) are a flag for every byte of it
// that's been read, then one for every byte written, then a flag for every 4096 bytes that have
// any read flags set, and the same for written. Whoever runs the card reads these and clears them.
export interface Shadow { size: number, read: number, written: number, readPages: number, writtenPages: number, pages: number }
export const SHADOW_PAGE = 4096

function shadowFor(lines: string[]): { shadow: Shadow, line: number, text: string } | null {
    const memories = lines.flatMap((text, line) => /^ *\((memory|import .*\(memory) /.test(text) ? [{ text, line }] : [])
    // (A card that asks how big its memory is, or grows it, would see ours.)
    if (memories.length !== 1 || lines.some(line => /^ *memory\.(size|grow)\b/.test(line))) return null
    const declared = /^( *\(memory \$\S+) (\d+)(?: (\d+))?\)$/.exec(memories[0].text)
    if (!declared) return null
    const own = Number(declared[2]), size = own * 65536, pages = size / SHADOW_PAGE
    const total = 3 * own + Math.ceil(2 * pages / 65536)
    if (own === 0 || total > 65536) return null
    const shadow = { size, read: size, written: 2 * size, readPages: 3 * size, writtenPages: 3 * size + pages, pages }
    const most = declared[3] === undefined ? "" : ` ${Math.max(total, Number(declared[3]))}`
    return { shadow, line: memories[0].line, text: `${declared[1]} ${total}${most})` }
}

// What goes in front of a load or a store (whose address is on top of the stack) to flag the bytes
// it touches. The card must not be able to tell that its memory is bigger than it was, so an
// address beyond its own part fails here, as it would have failed at the load or store.
const FLAGS: Record<number, string[]> = {
    1: ["i32.const 1", "i32.store8"], 2: ["i32.const 257", "i32.store16"],
    4: ["i32.const 16843009", "i32.store"], 8: ["i64.const 72340172838076673", "i64.store"],
}
function access(shadow: Shadow, store: boolean, offset: number, size: number) {
    const limit = shadow.size - offset - size
    if (limit < 0) return ["unreachable"]
    const [flags, set] = FLAGS[size]
    return [
        "local.tee $trace_at",
        `i32.const ${limit}`, "i32.gt_u", "if", "unreachable", "end",
        "local.get $trace_at", flags, `${set} offset=${(store ? shadow.written : shadow.read) + offset}`,
        "local.get $trace_at", ...(offset ? [`i32.const ${offset}`, "i32.add"] : []), "i32.const 12", "i32.shr_u",
        "i32.const 1", `i32.store8 offset=${store ? shadow.writtenPages : shadow.readPages}`,
        "local.get $trace_at",
    ]
}

export const BLOCK_PREFIX = "scorecard.block"
// The card's WebAssembly text, rewritten to keep an account of what it runs and what memory it
// touches, and where each block of code that's counted lies in the text. The account is kept in
// the card itself, so that it needn't call out as it plays (which made a traced card some twenty
// times slower): a global for each block (exported as `scorecard.blockN`), counting the times it's
// run, and flags for memory (`shadow`, above). Whoever runs the card reads those and clears them.
// A card whose memory can't be given flags (`shadow` is null) passes each address through an
// imported `scorecard.read` or `scorecard.write` instead, with the instruction's static offset and the size.
// With `meter`, it's given a gas counter as well (see `meterWat`). (`own` false is for checking the second way against the first.)
export function instrumentWat(binary: Uint8Array, meter = false, own = true) {
    const result = disassembleWasm(binary)
    const last = result.lines.lastIndexOf(")")
    const shadowed = own ? shadowFor(result.lines) : null
    const shadow = shadowed?.shadow ?? null
    let id = 0
    const out: string[] = []
    const count = () => {
        out.push(`global.get $trace_block${id}`, "i32.const 1", "i32.add", `global.set $trace_block${id}`)
        id++
    }
    const markers: { line: number, offset: number }[] = []
    let doneWithFunctions = false
    result.lines.forEach(function (s, index) {
        const offset = result.offsets![index]
        // For a store, the value on top of the stack is set aside in a local first.
        const touched = s.match(/^ *(i32|i64|f32|f64)\.(load|store)(8|16|32)?(?:_[su])?(?: offset=(\d+))?/)
        if (touched) {
            const [, type, op, bits, offset] = touched
            const size = bits ? Number(bits) / 8 : (type.endsWith("32") ? 4 : 8)
            const flag = shadow
                ? access(shadow, op === "store", Number(offset ?? 0), size)
                : [`i32.const ${offset ?? 0}`, `i32.const ${size}`, `call $${op === "load" ? "read" : "write"}`]
            out.push(...(op === "load" ? flag : [`local.set $trace_${type}`, ...flag, `local.get $trace_${type}`]))
        }
        if (index === last) {
            out.push(...stateExports(result.lines))
            if (meter) out.push(GAS_GLOBAL)
            for (let i = 0; i < id; i++) out.push(`(global $trace_block${i} (export "${BLOCK_PREFIX}${i}") (mut i32) (i32.const 0))`)
        }
        out.push(index === shadowed?.line ? shadowed.text : s)
        if (meter && /^ *loop\b/.test(s)) out.push(...GAS_CHECK)
        // Execution is traced by counting at key points for control flow (the start of each "basic
        // block" of a CFG), each with its own counter. We generate a map from those to regions of
        // code that must have been executed if the count isn't zero. This map includes both line
        // numbers (for the text format) and byte offsets (for the binary format).
        if (!shadow && s.match(/^\(module/)) {
            out.push(
                '(import "scorecard" "read" (func $read (param i32 i32 i32) (result i32)))',
                '(import "scorecard" "write" (func $write (param i32 i32 i32) (result i32)))',
            )
        }
        if (s.match(/^ *\(func /)) {
            markers.push({ line: index, offset: result.offsets![index - 1] })
        }
        if (endsHeader(result.lines, index)) {
            // (Scratch locals for traced stores go after the function's own, so as not to renumber them.)
            out.push("(local $trace_i32 i32) (local $trace_i64 i64) (local $trace_f32 f32) (local $trace_f64 f64) (local $trace_at i32)")
            if (meter) out.push(GAS_LOCAL)
            count()
        } else if (s.match(/^ *(br_if|if|else|loop|end)/)) {
            count()
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
    return { text: out.join("\n"), map, blocks: id, shadow }
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
        if (index === end) out.push(...stateExports(lines), GAS_GLOBAL)
        out.push(line)
        if (endsHeader(lines, index)) out.push(GAS_LOCAL)
        if (/^ *loop\b/.test(line)) out.push(...GAS_CHECK)
    })
    return out.join("\n")
}

// Where a card's globals are in its text and its bytes, and the lines that read and write each.
// Tracing doesn't watch globals themselves: a global is being read (or written) as much as the
// code that reads it is running, which is traced (see `globalHeat`).
export interface GlobalUse { line: number, start: number, end: number, reads: number[], writes: number[] }
export function findGlobalUses(binary: Uint8Array) {
    const { lines, offsets } = disassembleWasm(binary)
    const globals = new Map<string, GlobalUse>()
    lines.forEach((text, line) => {
        const defined = /^ *\(global (\$\S+) /.exec(text)
        if (defined) globals.set(defined[1], { line, start: offsets![line - 1], end: offsets![line], reads: [], writes: [] })
        const used = /^ *global\.(get|set) (\$\S+)/.exec(text)
        if (used) globals.get(used[2])?.[used[1] === "get" ? "reads" : "writes"].push(line)
    })
    return [...globals.values()]
}

// How much each global is being read and written (0 to 1), given how much each line of the text is running.
export function globalHeat(globals: GlobalUse[], lines: Float32Array) {
    const most = (uses: number[]) => uses.reduce((heat, line) => Math.max(heat, lines[line] ?? 0), 0)
    return globals.map(global => ({ global, read: most(global.reads), written: most(global.writes) }))
}
