// Checks that a card that's playing can be carried over into another rewriting of itself (traced,
// metered, or neither) and plays on exactly as it would have: see `carryOver` in public/worklet.js.
// Each card is played for a while as one rewriting, its state (memory and globals, which every
// rewriting exports) is copied into another, and what that plays must match the card left alone.
//     npx tsx scripts/carry-check.ts <card.wasm>...
import { readFileSync } from "fs"
import { compile } from "watr"
import { instrumentWat, meterWat, plainWat } from "../src/wasmTracer"

const BEFORE = 44100 * 2 + 777, AFTER = 44100 * 2, SEED = 1234

const kinds = {
    plain: (binary: Uint8Array) => compile(plainWat(binary)),
    metered: (binary: Uint8Array) => compile(meterWat(binary)),
    traced: (binary: Uint8Array) => compile(instrumentWat(binary, true).text),
}
type Kind = keyof typeof kinds

function instantiate(binary: Uint8Array) {
    const imports = { scorecard: { log() {}, read: (a: number) => a, write: (a: number) => a } }
    const exports: any = new WebAssembly.Instance(new WebAssembly.Module(binary as BufferSource), imports).exports
    return exports
}
const play = (exports: any, n: number) => {
    const p = exports.p ?? exports.process, out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
        if (exports.gas) exports.gas.value = 1e9
        out[i] = p(0)
    }
    return out
}
const same = (a: Float32Array, b: Float32Array) => a.every((x, i) => Object.is(x, b[i]) || (isNaN(x) && isNaN(b[i])))

let failures = 0
for (const path of process.argv.slice(2)) {
    const binary = new Uint8Array(readFileSync(path)), name = path.split("/").pop()
    try {
        const alone = instantiate(binary)
        ;(alone.s ?? alone.setup)?.(SEED)
        play(alone, BEFORE)
        const want = play(alone, AFTER)
        const results: string[] = []
        let state = ""
        for (const [from, to] of [["plain", "traced"], ["traced", "plain"], ["metered", "traced"], ["traced", "metered"]] as [Kind, Kind][]) {
            const a = instantiate(kinds[from](binary)), b = instantiate(kinds[to](binary))
            if (a.gas) a.gas.value = 1e9
            ;(a.s ?? a.setup)?.(SEED)
            play(a, BEFORE)
            const memory = a["scorecard.memory"], copy = b["scorecard.memory"]
            if (memory) {
                const more = (memory.buffer.byteLength - copy.buffer.byteLength) / 65536
                if (more > 0) copy.grow(more)
                new Uint8Array(copy.buffer).set(new Uint8Array(memory.buffer))
            }
            const globals = Object.keys(a).filter(key => key.startsWith("scorecard.global"))
            for (const key of globals) b[key].value = a[key].value
            state = `${memory ? memory.buffer.byteLength / 65536 + " pages" : "no memory"}, ${globals.length} globals`
            const ok = same(play(b, AFTER), want)
            if (!ok) failures++
            results.push(`${from} to ${to} ${ok ? "same" : "DIFFERENT"}`)
        }
        console.log(`${results.every(r => r.endsWith("same")) ? "ok  " : "FAIL"} ${name} (${state}): ${results.join(", ")}`)
    } catch (e: any) {
        failures++
        console.log(`FAIL ${name}: ${String(e?.message ?? e).split("\n")[0]}`)
    }
}
process.exit(failures ? 1 : 0)
