// The deck: cards you've collected (by scanning, following a link, or keeping one by hand),
// along with any seeds you've saved for them. Stored in localStorage; a card is at most ~4KB.
import { encodeBlob } from "./base43Encoder"

export interface DeckCard {
    code: string // base43-encoded binary; doubles as the card's identity
    title: string
    size: number
    added: number // timestamp (ms)
    seeds: number[]
    description?: string
}

// A pack is a named bundle of cards. It sits sealed in the deck until it's opened,
// at which point its cards join the deck. Packs can be exported to and imported from files.
export interface Pack {
    id: string
    name: string
    cards: Omit<DeckCard, "added">[]
}

const KEY = "scorecard-deck"
const PACKS_KEY = "scorecard-packs"

export function loadDeck(): DeckCard[] {
    try {
        const deck = JSON.parse(localStorage.getItem(KEY) ?? "[]")
        return Array.isArray(deck) ? deck : []
    } catch {
        return []
    }
}

function store<T>(key: string, value: T) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch {
        // Storage is unavailable or full; the deck still works for this visit.
    }
    return value
}

const save = (deck: DeckCard[]) => store(KEY, deck)

// The packs that haven't been opened yet. Before anything has been stored, that's just the starter pack.
export function loadPacks(starter: Pack): Pack[] {
    try {
        const packs = JSON.parse(localStorage.getItem(PACKS_KEY) ?? "null")
        return Array.isArray(packs) ? packs : [starter]
    } catch {
        return [starter]
    }
}

export const savePacks = (packs: Pack[]) => store(PACKS_KEY, packs)

// Add a pack's cards to the deck (skipping any that are already there).
export function addPack(deck: DeckCard[], pack: Pack) {
    const added = Date.now()
    const fresh = pack.cards.filter(card => !deck.some(c => c.code === card.code))
    return save([...fresh.map(card => ({ ...card, added })), ...deck])
}

// These all return a new deck (and persist it), leaving the old one untouched.

export function addCard(deck: DeckCard[], binary: Uint8Array, title: string) {
    const code = encodeBlob(binary)
    if (deck.some(card => card.code === code)) return deck
    return save([{ code, title, size: binary.length, added: Date.now(), seeds: [] }, ...deck])
}

export const clearDeck = () => save([])

export function removeCard(deck: DeckCard[], code: string) {
    return save(deck.filter(card => card.code !== code))
}

export function toggleSeed(deck: DeckCard[], code: string, seed: number) {
    return save(deck.map(card => card.code !== code ? card : {
        ...card,
        seeds: card.seeds.includes(seed) ? card.seeds.filter(s => s !== seed) : [...card.seeds, seed],
    }))
}
