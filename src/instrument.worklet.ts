// The tracer, for the audio worklet: added to its scope (as a second module, only once tracing or
// metering is wanted) so that the worklet can rewrite the card it plays, itself.
import "./workletPolyfill"
import { compile } from "watr"
import { instrumentWat, meterWat } from "./wasmTracer"

// `trace`: report what runs. `meter`: stop if a loop goes round too long.
;(globalThis as any).scorecardInstrument = (binary: Uint8Array, trace: boolean, meter: boolean) => {
    if (!trace) return { binary: compile(meterWat(binary)) }
    const { text, map } = instrumentWat(binary, meter)
    return { binary: compile(text), map }
}
