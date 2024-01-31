import type { WabtModule } from "../wabt"

let wabtPromise: Promise<WabtModule> | undefined

export function getWabt() {
    if (wabtPromise === undefined) {
        // Dynamic import for code-splitting (wabt is big!)
        wabtPromise = import("../wabt").then(m => m.default())
    }
    return wabtPromise
}
