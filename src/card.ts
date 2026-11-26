// Things about cards themselves: their links, their size limit, their titles and faces.
import QRCode from "qrcode"
import { Generated } from "./generate"
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

// Two things the player can do aren't settled (see AGENTS.md), so a build only has them if it's
// asked for, by setting these when building:
// - VITE_FRAGMENT_LINKS: draw a card's link in the newer form, described below.
// - VITE_LISTENING_CARDS: let a card whose `p` takes a sample hear the microphone.
const asked = (name: string) => !!(import.meta as { env?: Record<string, string> }).env?.[name]
export const FRAGMENT_LINKS = asked("VITE_FRAGMENT_LINKS"), LISTENING_CARDS = asked("VITE_LISTENING_CARDS")

// The newer link carries the program after a "#": the base43-encoded binary, with a locked seed (if
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

// The link as it has always been, and as printed cards have it: "?c=<program>", with "s=<seed>&" before the "c" if the seed is locked.
const cardQuery = (encoded: string, seed?: number) => `${seed === undefined ? "" : `s=${encode(BigInt(seed))}&`}c=${encoded}`

export function cardURL(encoded: string, seed?: number) {
    if (!FRAGMENT_LINKS) return `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}?${cardQuery(encoded, seed)}`
    return `${window.location.origin.toUpperCase()}${window.location.pathname}#${cardFragment(encoded, seed)}`
}

// The same, for this page's own address bar (`debug`: keep the debugging overlay).
export function cardAddress(encoded: string, seed: number | undefined, debug: boolean) {
    if (!FRAGMENT_LINKS) return `${window.location.pathname}?${debug ? "debug&" : ""}${cardQuery(encoded, seed)}`
    return `${window.location.pathname}${debug ? "?debug" : ""}#${cardFragment(encoded, seed)}`
}

// Read a card's link, in either form.
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

// Finds out which card plays when this one is set up (itself, unless it generates another: see
// generate.ts), and that card's title and whether it listens. A card that hasn't finished setting
// up after a few seconds is given up on. (One worker is kept for this, and replaced if it gets stuck.)
const SETUP_LIMIT = 3000
let worker: Worker | undefined
let requests = 0
export function generateCard(binary: Uint8Array, seed: number): Promise<Generated> {
    return new Promise((resolve, reject) => {
        const mine = worker ??= new Worker(new URL("./generate.worker.ts", import.meta.url), { type: "module" })
        const id = ++requests
        const done = () => {
            clearTimeout(timer)
            mine.removeEventListener("message", listen)
        }
        const timer = setTimeout(() => {
            done()
            mine.terminate()
            if (worker === mine) worker = undefined
            reject(new Error("This card didn't finish setting up."))
        }, SETUP_LIMIT)
        const listen = (e: MessageEvent) => {
            if (e.data.id !== id) return
            done()
            if (e.data.error) reject(new Error(e.data.error))
            else resolve(e.data.result)
        }
        mine.addEventListener("message", listen)
        mine.postMessage({ id, binary, seed })
    })
}
