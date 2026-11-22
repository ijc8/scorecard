// Remembers what cards were written from, so that a card's source can be shown again later:
// the starter pack's sources ship with the app, and anything built here is kept in localStorage.
import library from "./library.json"
import newCardSource from "./newCard.c?raw"

// The languages a card can be written in here (besides WebAssembly text, which needs no remembering).
export type Language = "C" | "Beat" | "Pattern"

const files = import.meta.glob("../examples/library/*.c", { query: "?raw", import: "default", eager: true }) as { [path: string]: string }

// Things to start from, by language and name. The first of each is what a new card starts as.
export const templates: { [language in Language]: { [name: string]: string } } = {
    C: { "new card": newCardSource },
    Beat: {
        "new beat": "// my beat\nt * (42 & t >> 10)\n",
        "triangles": "// triangles\nt & t >> 8\n",
        "two voices": "// two voices\n(t * 5 & t >> 7) | (t * 3 & t >> 10)\n",
        "faster clock": "// faster clock\n@22050\n(t >> 6 | t | t >> (t >> 16)) * 10 + ((t >> 11) & 7)\n",
    },
    Pattern: {
        "new pattern": "// my pattern\nbpm 110\nsaw: c2 [~ c2] eb2 <g2 bb1>\ntri: <[c4 eb4 g4 bb4] [f4 ab4 c5 eb5]>\ndrums: bd*2, ~ sd ~ sd, hh*8\n",
        "three against four": "// three against four\nbpm 90\nsine: [c4 e4 g4]*2, [c3 g3 c3 g3]\ndrums: bd [~ bd] ~ bd, hh*6\n",
        "turns": "// turns\nbpm 130\nsqr: <c3 eb3 f3 g3>*4 <bb3 c4>*2\ntri: c5@3 <g4 bb4 d5>\ndrums: [bd ~ ~ bd] [~ ~ bd ~], ~ cp, hh*4 hh*8\n",
    },
}

const shipped = new Map<string, string>()
for (const card of library) {
    const source = files[`../examples/library/${card.source}`]
    if (source === undefined) continue
    templates.C[card.title] = source
    shipped.set(card.code, source)
}

const KEY = "scorecard-sources"
const LIMIT = 40 // most recent cards whose sources are kept

// Entries are [card's code, source, language (C if missing: older entries didn't say)].
function load(): [string, string, Language?][] {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]")
        return Array.isArray(stored) ? stored : []
    } catch {
        return []
    }
}

// `code` is the card's base43-encoded binary.
export function getSource(code: string): { source: string, language: Language } | undefined {
    const source = shipped.get(code)
    if (source !== undefined) return { source, language: "C" }
    const entry = load().find(([c]) => c === code)
    return entry && { source: entry[1], language: entry[2] ?? "C" }
}

export function saveSource(code: string, source: string, language: Language) {
    const stored = [[code, source, language], ...load().filter(([c]) => c !== code)].slice(0, LIMIT)
    try {
        localStorage.setItem(KEY, JSON.stringify(stored))
    } catch {}
}
