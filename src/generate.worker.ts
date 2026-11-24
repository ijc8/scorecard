import { generate } from "./generate"

self.onmessage = (e: MessageEvent<{ id: number, binary: Uint8Array, seed: number }>) => {
    const { id, binary, seed } = e.data
    try {
        self.postMessage({ id, result: generate(binary, seed) })
    } catch (error: any) {
        self.postMessage({ id, error: String(error?.message ?? error) })
    }
}
