// The deck: cards you've collected (by scanning, following a link, or keeping one by hand),
// along with any seeds you've saved for them. Stored in localStorage; a card is at most ~4KB.
import { encodeBlob } from "./base43Encoder"

export interface DeckCard {
    code: string // base43-encoded binary; doubles as the card's identity
    title: string
    size: number
    added: number // timestamp (ms)
    seeds: number[]
}

const KEY = "scorecard-deck"

export function loadDeck(): DeckCard[] {
    try {
        const deck = JSON.parse(localStorage.getItem(KEY) ?? "[]")
        return Array.isArray(deck) ? deck : []
    } catch {
        return []
    }
}

function save(deck: DeckCard[]) {
    try {
        localStorage.setItem(KEY, JSON.stringify(deck))
    } catch {
        // Storage is unavailable or full; the deck still works for this visit.
    }
    return deck
}

// These all return a new deck (and persist it), leaving the old one untouched.

export function addCard(deck: DeckCard[], binary: Uint8Array, title: string) {
    const code = encodeBlob(binary)
    if (deck.some(card => card.code === code)) return deck
    return save([{ code, title, size: binary.length, added: Date.now(), seeds: [] }, ...deck])
}

export function removeCard(deck: DeckCard[], code: string) {
    return save(deck.filter(card => card.code !== code))
}

export function toggleSeed(deck: DeckCard[], code: string, seed: number) {
    return save(deck.map(card => card.code !== code ? card : {
        ...card,
        seeds: card.seeds.includes(seed) ? card.seeds.filter(s => s !== seed) : [...card.seeds, seed],
    }))
}
