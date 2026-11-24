// Setting a card up, as far as finding out which card ends up playing. A card's setup function
// (`s`) may return the address of another card in its memory (a 32-bit length, then that many bytes
// of WebAssembly), to be played in its place; that one's setup may do the same, and so on. So a
// card can carry a program packed smaller than the program itself along with what unpacks it, or
// write a different program for each seed.
//
// This runs in a worker (generate.worker.ts), so that a card that never finishes can be given up on.
// The audio worklet does the same again for itself at the start of each performance.
export interface Generated {
    binary: Uint8Array   // the card that plays: the one given, unless it generated another
    title?: string       // from the last card along the way that has one
    listens: boolean     // does the card that plays take sound in?
}

function titleOf(exports: WebAssembly.Exports) {
    // (Short names, or the legacy ones of old cards.)
    const data = exports.d ?? exports.title
    const memory = (exports.m ?? exports.memory) as WebAssembly.Memory | undefined
    if (!(data instanceof WebAssembly.Global) || !memory) return
    const heap = new Uint8Array(memory.buffer)
    const start = data.value >>> 0
    let end = start
    while (end < heap.length && heap[end] !== 0) end++
    return new TextDecoder().decode(heap.subarray(start, end))
}

export function generate(binary: Uint8Array, seed: number): Generated {
    let title: string | undefined
    for (;;) {
        const { exports } = new WebAssembly.Instance(new WebAssembly.Module(binary as BufferSource))
        const setup = (exports.s ?? exports.setup) as ((seed: number) => unknown) | undefined
        const next = setup?.(seed)
        title = titleOf(exports) ?? title
        if (typeof next !== "number" || next === 0) {
            const process = (exports.p ?? exports.process) as ((...args: number[]) => number) | undefined
            return { binary, title, listens: !!process && process.length > 0 }
        }
        const memory = ((exports.m ?? exports.memory) as WebAssembly.Memory).buffer
        const at = next >>> 0
        const length = new DataView(memory).getUint32(at, true)
        binary = new Uint8Array(memory.slice(at + 4, at + 4 + length))
    }
}
