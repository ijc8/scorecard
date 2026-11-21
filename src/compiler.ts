// Main-thread side of the C compiler (see compiler.worker.ts).

export interface CompileResult {
    log: string           // warnings and errors
    binary?: Uint8Array   // the card, if compilation succeeded
}

let worker: Worker | undefined
let nextId = 0

// `onProgress` reports the toolchain download (0 to 1) the first time around.
export function compileCard(source: string, onProgress: (fraction: number) => void) {
    worker ??= new Worker(new URL("./compiler.worker.ts", import.meta.url), { type: "module" })
    const w = worker
    const id = nextId++
    return new Promise<CompileResult>(resolve => {
        const listener = (e: MessageEvent) => {
            if (e.data.progress !== undefined) return onProgress(e.data.progress)
            if (e.data.id !== id) return
            w.removeEventListener("message", listener)
            resolve(e.data)
        }
        w.addEventListener("message", listener)
        w.addEventListener("error", e => resolve({ log: `The compiler couldn't be loaded: ${e.message ?? "unknown error"}` }), { once: true })
        w.postMessage({ id, source })
    })
}
