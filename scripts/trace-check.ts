// Checks the tracer by running the real worklet (outside a browser) on each card three ways:
// guarded only; traced, keeping its own account of the memory it touches (flags above its own
// memory: `shadowFor` in src/wasmTracer.ts); and traced calling out for each load and store, as a
// card that grows its memory has to be. All three must make the same samples, and the two traced
// ones must report exactly the same block counts and runs of bytes. Says how fast each runs.
// Then three made-up cards: one that reads past the end of its memory (which must fail traced, as
// it does untraced), one that grows its memory (which must fall back to calling out), one with no memory.
//     npx tsx scripts/trace-check.ts <card.wasm>...
import { readFileSync } from "fs"
import { compile } from "watr"
import { instrumentWat, meterWat, plainWat } from "../src/wasmTracer"

const g = globalThis as any
let Proc: any, posted: any[] = [], own = true
g.AudioWorkletProcessor = class { port = { postMessage: (m: any) => posted.push(structuredClone(m)), onmessage: null as any } }
g.registerProcessor = (_: string, c: any) => { Proc = c }
g.scorecardInstrument = (binary: Uint8Array, trace: boolean, meter: boolean) => {
    if (!trace) return { binary: compile(meter ? meterWat(binary) : plainWat(binary)) }
    const { text, ...account } = instrumentWat(binary, meter, own)
    return { binary: compile(text), ...account }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const SECONDS = 4

async function run(binary: Uint8Array, trace: boolean, ownAccount: boolean) {
    own = ownAccount
    posted = []
    // (A new processor each time, so that nothing rewritten the other way is reused.)
    const p = new Proc(), send = (data: any) => p.port.onmessage({ data })
    send({ cmd: "loadModule", binary, trace, meter: true }); await wait(20)
    send({ cmd: "play", seed: 1234 }); await wait(150)
    const account: string[] = [], audio: number[] = []
    let failed = "", shadowed = false
    const start = performance.now()
    for (let block = 0; block < SECONDS * 345; block++) {
        const out = new Float32Array(128)
        p.process([[new Float32Array(128)]], [[out]], {})
        audio.push(...new Uint32Array(out.buffer))
        for (const m of posted.splice(0)) {
            if (m.failed) failed = m.failed
            else if (m.reads) account.push(`r${m.reads.join(",")} w${m.writes.join(",")}`)
            else if (Array.isArray(m)) account.push("c" + m.map((n, i) => n ? `${i}:${n}` : "").filter(Boolean).join(","))
        }
    }
    shadowed = !!p.card?.shadow
    return { audio: audio.join(","), account: account.join("\n"), failed, shadowed, speed: SECONDS * 1000 / (performance.now() - start) }
}

const made: [string, string, (r: Awaited<ReturnType<typeof run>>[]) => string][] = [
    ["(reads past its memory)", `(module (memory $m 1 1) (global $n (mut i32) (i32.const 0))
        (func (export "p") (result f32) (global.set $n (i32.add (global.get $n) (i32.const 1)))
            (if (result f32) (i32.gt_u (global.get $n) (i32.const 1000)) (then (f32.load (i32.const 65534))) (else (f32.const 0)))))`,
        ([guarded, traced]) => guarded.failed && traced.failed === "unreachable" ? "" : "should have failed both ways"],
    ["(grows its memory)", `(module (memory $m 1) (global $n (mut i32) (i32.const 0))
        (func (export "p") (result f32) (global.set $n (i32.add (global.get $n) (i32.const 1)))
            (if (i32.eq (global.get $n) (i32.const 1000)) (then (drop (memory.grow (i32.const 1)))))
            (if (result f32) (i32.gt_u (global.get $n) (i32.const 1000))
                (then (f32.store (i32.const 70000) (f32.const 0.5)) (f32.load (i32.const 70000))) (else (f32.const 0)))))`,
        ([guarded, traced]) => guarded.failed || traced.failed ? "failed" : traced.shadowed ? "should have called out" : traced.audio !== guarded.audio ? "plays differently" : /w70000,4/.test(traced.account) ? "" : "store not reported"],
    ["(no memory)", `(module (func (export "p") (result f32) (f32.const 0.25)))`,
        ([guarded, traced]) => guarded.failed || traced.failed ? "failed" : /c0:\d+/.test(traced.account) ? "" : "nothing counted"],
]

const main = async () => {
    await import("../public/worklet.js" as string)
    let failures = 0
    const report = (ok: boolean, text: string) => { if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"} ${text}`) }
    for (const path of process.argv.slice(2)) {
        const binary = new Uint8Array(readFileSync(path)), name = path.split("/").pop()
        const guarded = await run(binary, false, true), traced = await run(binary, true, true), calling = await run(binary, true, false)
        const problems = [
            guarded.failed && `failed: ${guarded.failed}`,
            traced.audio !== guarded.audio && "traced plays DIFFERENTLY",
            calling.audio !== guarded.audio && "traced (calling out) plays DIFFERENTLY",
            traced.account !== calling.account && "the two accounts DIFFER",
            !traced.account.includes(":") && "nothing counted",
        ].filter(Boolean)
        const x = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}x`
        report(!problems.length, `${name}: ${problems.join("; ") || "same samples, same account"}; guarded ${x(guarded.speed)} real time, traced ${x(traced.speed)}${traced.shadowed ? "" : " (calling out)"}, calling out ${x(calling.speed)}`)
    }
    for (const [name, text, check] of made) {
        const binary = compile(text)
        const runs = [await run(binary, false, true), await run(binary, true, true)]
        const problem = check(runs)
        if (problem) console.log("    ", runs.map(r => `failed "${r.failed}" shadowed ${r.shadowed} account ${r.account.slice(0, 80)}`).join(" / "))
        report(!problem, `${name}${problem && ": " + problem}`)
    }
    process.exit(failures ? 1 : 0)
}
main()
