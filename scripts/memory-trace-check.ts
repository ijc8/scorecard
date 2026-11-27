// Runs the real worklet (outside a browser) on traced cards, feeding what it posts about memory to
// MemoryTrace as the page does, and says what that costs the page per update (there are 43 a second,
// so it has 23 ms) and how fast the traced card runs. Cards with delay lines are the ones to try:
// they touch tens of thousands of bytes an update.
//     npx tsx scripts/memory-trace-check.ts <card.wasm>...
import { readFileSync } from "fs"
import { compile } from "watr"
import { instrumentWat, meterWat, plainWat } from "../src/wasmTracer"
import { MemoryTrace, findDataSegments } from "../src/memoryTrace"
const g = globalThis as any
let Proc: any
g.AudioWorkletProcessor = class { port = { postMessage: (m: any) => posted.push(m), onmessage: null as any } }
g.registerProcessor = (_: string, c: any) => { Proc = c }
g.scorecardInstrument = (binary: Uint8Array, trace: boolean, meter: boolean) => {
    if (!trace) return { binary: compile(meter ? meterWat(binary) : plainWat(binary)) }
    const { text, map } = instrumentWat(binary, meter)
    return { binary: compile(text), map }
}
let posted: any[] = []
const main = async () => {
    await import("../public/worklet.js" as string)
    for (const path of process.argv.slice(2)) {
        posted = []
        const p = new Proc(), send = (data: any) => p.port.onmessage({ data })
        send({ cmd: "loadModule", binary: new Uint8Array(readFileSync(path)), trace: true, meter: true }); await new Promise(r => setTimeout(r, 100))
        send({ cmd: "play", seed: 1 }); await new Promise(r => setTimeout(r, 300))
        let memory: MemoryTrace | null = null, updates = 0, bytes = 0, runs = 0, tUpdate = 0, tLayout = 0, worst = 0, tWorklet = 0
        const input = [new Float32Array(128)]
        const SECONDS = 6
        for (let block = 0; block < SECONDS * 345; block++) {
            const a = performance.now()
            p.process([input], [[new Float32Array(128)]], {})
            tWorklet += performance.now() - a
            for (const m of posted.splice(0)) {
                if (m.traced) memory = new MemoryTrace(findDataSegments(m.traced.binary))
                if (m.failed) console.log("FAILED", m.failed)
                if (m.reads && memory) {
                    const b = performance.now()
                    memory.update(m.reads, m.writes)
                    const c = performance.now()
                    const band = memory.layout(4000)
                    const d = performance.now()
                    tUpdate += c - b; tLayout += d - c; worst = Math.max(worst, d - b); updates++
                    for (const r of [m.reads, m.writes]) { runs += r.length / 2; for (let i = 1; i < r.length; i += 2) bytes += r[i] }
                    if (updates === 200) console.log("   ", path.split("/").pop(), "regions", memory.regions.length, "covering", memory.regions.reduce((s, [a, b]) => s + b - a, 0), "bytes; cells lit: reads", band.reads.filter(Boolean).length, "writes", band.writes.filter(Boolean).length, "of", band.mapped.filter(Boolean).length, "mapped")
                }
            }
        }
        console.log(`${path.split("/").pop()}: ${(bytes / updates).toFixed(0)} bytes in ${(runs / updates).toFixed(1)} runs per update; page side ${(tUpdate / updates).toFixed(3)} ms update + ${(tLayout / updates).toFixed(3)} ms layout (worst ${worst.toFixed(2)} ms; budget 23 ms); worklet runs traced at ${(SECONDS * 1000 / tWorklet).toFixed(1)}x real time`)
    }
}
main()
