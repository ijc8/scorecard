// Things about cards themselves: their links, seeds and titles.
import { decodeBlob, encode, decode } from "./base43Encoder"

export function generateSeed() {
    return Math.floor(Math.random() * Math.pow(2, 32))
}

export function formatSeed(seed: number) {
    return seed.toString(16).padStart(8, "0")
}

export function formatTime(seconds: number) {
    seconds = Math.floor(seconds)
    let minutes = Math.floor(seconds / 60)
    seconds -= minutes * 60
    const hours = Math.floor(minutes / 60)
    if (hours === 0) {
        return `${minutes}:${seconds.toString().padStart(2, "0")}`
    }
    minutes -= hours * 60
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

// A card's link: "?c=<program>", with "s=<seed>&" before the "c" if the seed is locked.
export function cardURL(encoded: string, seed?: number) {
    const prefix = window.location.origin + window.location.pathname.replace(/\/$/, "") // trim trailing slash
    return `${prefix}?${seed === undefined ? "" : `s=${encode(BigInt(seed))}&`}c=${encoded}`
}

// Read a card's link. Returns nothing if the text isn't one.
// TODO: More validity checks (does the param contain valid base43? do the bytes contain valid wasm?)
export function parseCardURL(text: string) {
    let url
    try {
        url = new URL(text)
    } catch {
        return
    }
    // (In a query string, "+" arrives as a space.)
    const program = url.searchParams.get("c")?.replace(/ /g, "+")
    if (!program) return
    const seed = url.searchParams.get("s")?.replace(/ /g, "+")
    return { binary: decodeBlob(program), seed: seed ? Number(decode(seed)) : null }
}

export const NO_TITLE = "untitled"

export function extractTitle(module: WebAssembly.Module) {
    const instance = new WebAssembly.Instance(module)
    // Support new, short export name ("d") or legacy name ("title") for old cards.
    // (In the future, "d" may contain additional metadata such as an artist name or description.)
    const data = instance.exports.d ?? instance.exports.title
    if (data === undefined) {
        return
    }
    const startPtr: number = (data as WebAssembly.Global).value
    // Support new, short export name ("m") or legacy name ("memory") for old cards.
    const memory = (instance.exports.m ?? instance.exports.memory) as WebAssembly.Memory
    const mem = memory.buffer
    const heap = new Uint8Array(mem)
    let endPtr = startPtr;
    while (heap[endPtr] != 0 && endPtr < heap.length) endPtr++
    const title = (new TextDecoder()).decode(new Uint8Array(mem, startPtr, endPtr - startPtr))
    console.log("Loaded title", title, "from", startPtr, "to", endPtr)
    return title
}
