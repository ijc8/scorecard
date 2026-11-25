// The tracer, for the audio worklet: added to its scope (as a second module, only once tracing is
// wanted) so that the worklet can instrument whatever card it ends up playing, itself. That way a
// card that generates another is traced as the card it generated this time, with this seed.
import "./workletPolyfill"
import { compile } from "watr"
import { instrumentWat } from "./wasmTracer"

;(globalThis as any).scorecardInstrument = (binary: Uint8Array) => {
    const { text, map } = instrumentWat(binary)
    return { binary: compile(text), map }
}
