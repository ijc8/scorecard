// Remembers the C source of cards, so that a card's source can be shown again later:
// the starter pack's sources ship with the app, and anything compiled here is kept in localStorage.
import library from "./library.json"
import newCardSource from "./newCard.c?raw"

const files = import.meta.glob("../examples/library/*.c", { query: "?raw", import: "default", eager: true }) as { [path: string]: string }

// Sources to start a new card from, by title.
export const templates: { [name: string]: string } = { "new card": newCardSource }
const shipped = new Map<string, string>()
for (const card of library) {
    const source = files[`../examples/library/${card.source}`]
    if (source === undefined) continue
    templates[card.title] = source
    shipped.set(card.code, source)
}

const KEY = "scorecard-sources"
const LIMIT = 40 // most recent cards whose sources are kept

function load(): [string, string][] {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]")
        return Array.isArray(stored) ? stored : []
    } catch {
        return []
    }
}

// `code` is the card's base43-encoded binary.
export function getSource(code: string) {
    return shipped.get(code) ?? load().find(([c]) => c === code)?.[1]
}

export function saveSource(code: string, source: string) {
    const stored = [[code, source], ...load().filter(([c]) => c !== code)].slice(0, LIMIT)
    try {
        localStorage.setItem(KEY, JSON.stringify(stored))
    } catch {}
}
