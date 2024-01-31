import type { WabtModule } from "../wabt"

let wabt: WabtModule | undefined

export async function getWabt() {
    if (wabt === undefined) {
        // Dynamic import for code-splitting (wabt is big!)
        const m = await import("../wabt")
        wabt = await m.default()
    }
    return wabt
}
