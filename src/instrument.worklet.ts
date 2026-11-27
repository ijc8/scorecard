// The tracer, for the audio worklet: added to its scope (as a second module, only once tracing is
// wanted) so that the worklet can rewrite the card it plays, itself.
import "./workletPolyfill"
import { compile } from "watr"
import { instrumentWat } from "./wasmTracer"

;(globalThis as any).scorecardInstrument = (binary: Uint8Array) => {
    const { text, map } = instrumentWat(binary)
    return { binary: compile(text), map }
}
