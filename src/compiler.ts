// Main-thread side of the C compiler (see compiler.worker.ts).

export interface CompileResult {
    log: string           // warnings and errors
    binary?: Uint8Array   // the card, if compilation succeeded
}

// What the compiler is up to: loading itself, fetching the toolchain (0 to 1, the first time
// around), or compiling.
export type CompileStage = "loading" | number | "compiling"

// Give up on the toolchain download if it makes no progress for this long (it's tens of megabytes,
// which on a phone's connection can falter).
const STALL_MS = 30000

let worker: Worker | undefined
let nextId = 0
let cancelCurrent: (() => void) | undefined

function stop() {
    worker?.terminate()
    worker = undefined
}

// Stops the compilation in progress (if any): its promise resolves with a note saying so.
export function cancelCompile() {
    cancelCurrent?.()
}

export function compileCard(source: string, onStage: (stage: CompileStage) => void) {
    const fresh = !worker
    worker ??= new Worker(new URL("./compiler.worker.ts", import.meta.url), { type: "module" })
    const w = worker
    const id = nextId++
    onStage(fresh ? "loading" : "compiling")
    return new Promise<CompileResult>(resolve => {
        let stallTimer: ReturnType<typeof setTimeout> | undefined
        const finish = (result: CompileResult) => {
            clearTimeout(stallTimer)
            w.removeEventListener("message", listener)
            w.removeEventListener("error", onError)
            cancelCurrent = undefined
            resolve(result)
        }
        const watch = () => {
            clearTimeout(stallTimer)
            stallTimer = setTimeout(() => {
                stop()
                finish({ log: "The compiler's download stalled. Play to try again." })
            }, STALL_MS)
        }
        const listener = (e: MessageEvent) => {
            if (e.data.progress !== undefined) {
                if (e.data.progress < 1) {
                    watch()
                    return onStage(e.data.progress)
                }
                clearTimeout(stallTimer)
                return onStage("compiling")
            }
            if (e.data.id !== id) return
            finish(e.data)
        }
        const onError = (e: ErrorEvent) => {
            // The worker can't carry on after this; start afresh next time.
            stop()
            finish({ log: `The compiler couldn't be loaded: ${e.message || "unknown error"}` })
        }
        cancelCurrent = () => {
            // Clang can't be interrupted mid-compile, so the worker goes (along with anything it has fetched).
            stop()
            finish({ log: "Stopped building." })
        }
        w.addEventListener("message", listener)
        w.addEventListener("error", onError)
        if (fresh) watch()
        w.postMessage({ id, source })
    })
}
