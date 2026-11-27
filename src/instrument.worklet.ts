// The tracer, for the audio worklet: added to its scope (as a second module, only once tracing or
// metering is wanted) so that the worklet can rewrite the card it plays, itself.
import "./workletPolyfill"
import { compile } from "watr"
import { instrumentWat, meterWat, plainWat } from "./wasmTracer"

// `trace`: report what runs. `meter`: stop if a loop goes round too long.
;(globalThis as any).scorecardInstrument = (binary: Uint8Array, trace: boolean, meter: boolean) => {
    // (Whichever it is, the card is also made to export its state, so that it can be carried over.)
    if (!trace) return { binary: compile(meter ? meterWat(binary) : plainWat(binary)) }
    const { text, map } = instrumentWat(binary, meter)
    return { binary: compile(text), map }
}
