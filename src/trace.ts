// Execution tracing state, shared by the player (which instruments the card and receives the
// worklet's counts) and the Listen tab (which draws them).
import { GlobalUse, TraceMap } from "./wasmTracer"

export interface TraceData {
    binary: Uint8Array
    map: TraceMap
    logs: number[]
    globals: GlobalUse[]
}

export const tracer: { trace: TraceData | null, handleLogs?: (logs: number[]) => void } = { trace: null }
