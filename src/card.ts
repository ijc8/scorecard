// Things about cards themselves: their links, their size limit, their titles and faces.
import QRCode from "qrcode"
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

// Each card's face shows its QR code, like the big card on the player.
export const faces = new Map<string, string>()
export function cardFace(code: string) {
    let face = faces.get(code)
    if (face === undefined) {
        const canvas = document.createElement("canvas")
        try {
            const { size, data } = QRCode.create(cardURL(code), { errorCorrectionLevel: "L" }).modules
            canvas.width = canvas.height = size
            const image = new ImageData(size, size)
            data.forEach((dark, i) => { image.data[i * 4 + 3] = dark ? 255 : 0 })
            canvas.getContext("2d")!.putImageData(image, 0, 0)
        } catch {
            // Too big for a QR code: leave the face blank.
        }
        faces.set(code, face = canvas.toDataURL())
    }
    return face
}

// A card's link carries the program after a "#": the base43-encoded binary, with a locked seed (if
// any) in front of it. Everything is chosen to pack tightly into a QR code:
// - The scheme and host are written in capitals. They mean the same either way, but capitals (like
//   base43's characters) fit QR's compact alphanumeric mode.
// - After a "#", the program isn't sent to the server when the link is opened, and isn't subject to
//   the path rules that would mangle it ("/../") or to servers' limits on address length.
// - An encoded program always begins with "0" (a WebAssembly binary starts with a zero byte), so a
//   seed is recognizable by not beginning with one: it's six base43 digits, offset to make sure.
export const SEED_OFFSET = 43n ** 5n

export function cardFragment(encoded: string, seed?: number) {
    return (seed === undefined ? "" : encode(BigInt(seed) + SEED_OFFSET)) + encoded
}

export function cardURL(encoded: string, seed?: number) {
    return `${window.location.origin.toUpperCase()}${window.location.pathname}#${cardFragment(encoded, seed)}`
}

// Read a card's link: the current form, or the older "?c=<program>&s=<seed>".
export function parseCardURL(text: string) {
    let url
    try {
        url = new URL(text)
    } catch {
        return
    }
    try {
        const fragment = url.hash.slice(1)
        if (fragment.startsWith("0")) {
            return { binary: decodeBlob(fragment), seed: null }
        } else if (fragment.length > 6) {
            return { binary: decodeBlob(fragment.slice(6)), seed: Number(decode(fragment.slice(0, 6)) - SEED_OFFSET) }
        }
        // (In a query string, "+" arrives as a space.)
        const program = url.searchParams.get("c")?.replace(/ /g, "+")
        const seed = url.searchParams.get("s")?.replace(/ /g, "+")
        if (program) return { binary: decodeBlob(program), seed: seed ? Number(decode(seed)) : null }
    } catch {
        // Not base43.
    }
}

// The largest binary (in bytes) whose URL still fits in a QR code when served from this address.
// Found by asking the QR library directly, since the answer depends on how it packs the URL.
export let _maxCardSize: number | undefined
export function maxCardSize() {
    if (_maxCardSize !== undefined) return _maxCardSize
    const fits = (bytes: number) => {
        // Longest possible encoding of this many bytes.
        const chars = Math.ceil(bytes * 8 / Math.log2(43))
        try {
            QRCode.create(cardURL(":".repeat(chars)), { errorCorrectionLevel: "L" })
            return true
        } catch {
            return false
        }
    }
    let low = 0, high = 4096
    while (high - low > 1) {
        const mid = (low + high) >> 1
        if (fits(mid)) low = mid
        else high = mid
    }
    return _maxCardSize = low
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


// Does the card take sound in? That is: does its process function take a sample, as well as returning one?
export function takesInput(module: WebAssembly.Module) {
    const instance = new WebAssembly.Instance(module)
    const process = (instance.exports.p ?? instance.exports.process) as ((...args: number[]) => number) | undefined
    return !!process && process.length > 0
}
