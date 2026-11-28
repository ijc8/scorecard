// Runs the real worklet on traced cards; writes everything it posts about tracing to a JSON file per card.
import { readFileSync, writeFileSync } from "fs"
import { compile } from "watr"
const g = globalThis as any
let Proc: any, posted: any[] = []
g.AudioWorkletProcessor = class { port = { postMessage: (m: any) => posted.push(structuredClone(m)), onmessage: null as any } }
g.registerProcessor = (_: string, c: any) => { Proc = c }
const main = async () => {
    const T = await import("../src/wasmTracer")
    g.scorecardInstrument = (binary: Uint8Array, trace: boolean, meter: boolean) => {
        if (!trace) return { binary: compile(meter ? T.meterWat(binary) : T.plainWat(binary)) }
        const { text, ...rest } = T.instrumentWat(binary, meter)
        return { binary: compile(text), ...rest }
    }
    await import("../public/worklet.js" as string)
    const out = process.argv[2]
    for (const path of process.argv.slice(3)) {
        posted = []
        const p = new Proc(), send = (data: any) => p.port.onmessage({ data })
        send({ cmd: "loadModule", binary: new Uint8Array(readFileSync(path)), trace: true, meter: true }); await new Promise(r => setTimeout(r, 50))
        send({ cmd: "play", seed: 1234 }); await new Promise(r => setTimeout(r, 300))
        const log: any[] = [], audio: number[] = []
        const t0 = performance.now()
        for (let block = 0; block < 4 * 345; block++) {
            const o = new Float32Array(128)
            p.process([[new Float32Array(128)]], [[o]], {})
            let h = 0; for (const x of new Uint32Array(o.buffer)) h = (Math.imul(h, 31) + x) | 0
            audio.push(h)
            for (const m of posted.splice(0)) {
                if (m.failed) log.push({ failed: m.failed })
                else if (m.reads) log.push({ reads: [...m.reads], writes: [...m.writes] })
                else if (Array.isArray(m)) log.push({ counts: Object.fromEntries(Object.entries(m).filter(([, v]) => v)) })
            }
        }
        const ms = performance.now() - t0
        const name = path.split("/").pop()!
        writeFileSync(`${out}/${name}.json`, JSON.stringify({ log, audio }))
        console.log(name, log.length, "messages;", (4000 / ms).toFixed(1) + "x real time")
    }
}
main()
