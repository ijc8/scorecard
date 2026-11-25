// What does gas metering cost? (See `meterWat` in src/wasmTracer.ts.) For each card: checks that the
// metered card makes the same samples, that it does stop when the gas runs out, and times both.
//     npx tsx scripts/gas-check.ts <card.wasm>...
import { readFileSync } from "fs"
import { compile } from "watr"
import { meterWat } from "../src/wasmTracer"
import { generate } from "../src/generate"

const SECONDS = 30, QUANTUM = 128, BUDGET = 100_000_000

function run(binary: Uint8Array, metered: boolean) {
    const exports: any = new WebAssembly.Instance(new WebAssembly.Module(binary)).exports
    const gas = exports.gas
    if (metered) gas.value = BUDGET
    ;(exports.s ?? exports.setup)?.(1234)
    const p = exports.p ?? exports.process
    const out = new Float32Array(SECONDS * 44100)
    let most = 0
    const start = performance.now()
    for (let i = 0; i < out.length; i += QUANTUM) {
        if (metered) gas.value = BUDGET
        for (let j = i; j < i + QUANTUM && j < out.length; j++) out[j] = p(0)
        if (metered) most = Math.max(most, BUDGET - gas.value)
    }
    return { out, ms: performance.now() - start, most }
}

const same = (a: Float32Array, b: Float32Array) => a.every((x, i) => Object.is(x, b[i]) || (isNaN(x) && isNaN(b[i])))

for (const path of process.argv.slice(2)) {
    const name = path.split("/").pop()
    try {
        // (A card that generates another is metered as the card that plays.)
        const card = generate(new Uint8Array(readFileSync(path)), 1234).binary
        const metered = compile(meterWat(card))
        const best = (binary: Uint8Array, m: boolean) => Math.min(...[0, 1, 2, 3, 4].map(() => run(binary, m).ms))
        const plain = run(card, false), guarded = run(metered, true)
        const a = best(card, false), b = best(metered, true)
        // Out of gas: it must stop.
        const starved: any = new WebAssembly.Instance(new WebAssembly.Module(metered)).exports
        let stopped = false
        try {
            starved.gas.value = 1
            ;(starved.s ?? starved.setup)?.(1234)
            for (let i = 0; i < 44100; i++) starved.p(0)
        } catch {
            stopped = true
        }
        console.log(`${same(plain.out, guarded.out) ? "same" : "DIFFERENT"}  ${name!.padEnd(26)} ${card.length} -> ${metered.length} B  ` +
            `${(SECONDS * 1000 / a).toFixed(0)}x -> ${(SECONDS * 1000 / b).toFixed(0)}x real time  (+${((b / a - 1) * 100).toFixed(1)}%)  ` +
            `most loop passes in a block: ${guarded.most}  ${stopped ? "stops when starved" : "(no loops reached: never starves)"}`)
    } catch (e: any) {
        console.log(`FAIL  ${name}: ${String(e?.message ?? e).split("\n")[0]}`)
    }
}
