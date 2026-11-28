// Checks that watr reassembles what the player feeds it faithfully: each card's own disassembly
// (as the source face's Wasm mode shows it), and its instrumented text (for tracing). Both must
// make the same samples as the card itself. (When this replaced wabt, 22 cards also gave wabt's
// exact trace counts.)
//     npx tsx scripts/watr-check.ts <card.wasm>...
import { readFileSync } from "fs"
import { compile } from "watr"
import { disassembleWasm, instrumentWat } from "../src/wasmTracer"

const SAMPLES = 44100 * 3

function run(binary: Uint8Array, traced: boolean) {
    const imports = { scorecard: { read: (a: number) => a, write: (a: number) => a } }
    const exports: any = new WebAssembly.Instance(new WebAssembly.Module(binary), imports).exports
    ;(exports.s ?? exports.setup)?.(1234)
    const p = exports.p ?? exports.process
    const out = new Float32Array(SAMPLES)
    for (let i = 0; i < SAMPLES; i++) out[i] = p(0)
    // (A traced card counts the times each block of its code has run, in globals.)
    const counts = Object.keys(exports).filter(key => key.startsWith("scorecard.block")).map(key => exports[key].value)
    return { out, counts: traced ? counts.join(",") : "" }
}

const same = (a: Float32Array, b: Float32Array) => a.every((x, i) => Object.is(x, b[i]) || (isNaN(x) && isNaN(b[i])))

let failures = 0
for (const path of process.argv.slice(2)) {
    const binary = new Uint8Array(readFileSync(path))
    const name = path.split("/").pop()
    try {
        const original = run(binary, false)
        const text = disassembleWasm(binary).lines.join("\n")
        const viaWatr = compile(text)
        const plain = same(run(viaWatr, false).out, original.out)
        const { text: traced } = instrumentWat(binary)
        const tWatr = run(compile(traced), true)
        const tracedOK = same(tWatr.out, original.out) && /[1-9]/.test(tWatr.counts)
        const ok = plain && tracedOK
        if (!ok) failures++
        console.log(`${ok ? "ok  " : "FAIL"} ${name}: plain ${plain ? "same" : "DIFFERENT"}, traced ${tracedOK ? "same" : "DIFFERENT"} (sizes: original ${binary.length}, reassembled ${viaWatr.length})`)
    } catch (e: any) {
        failures++
        console.log(`FAIL ${name}: ${String(e?.message ?? e).split("\n")[0]}`)
    }
}
process.exit(failures ? 1 : 0)
