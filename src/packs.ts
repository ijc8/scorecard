// Packs of cards: the starter pack that ships with the app, and pack files.
import library from "./library.json"
import { decodeBlob, encodeBlob } from "./base43Encoder"
import { Pack } from "./deck"
import { NO_TITLE, generateCard } from "./card"

export type LoadCard = (code: string, seed?: number) => void

export const starterPack: Pack = { id: "starter", name: "Starter pack", cards: library.map(({ code, title, size, description }) => ({ code, title, size, description, seeds: [] })) }

// Pack files: JSON, with a marker so that we can tell them from anything else.
export const PACK_FORMAT = "scorecard-pack"

// Read a pack file, keeping only what checks out. (Titles and sizes come from the cards themselves.)
export async function parsePack(text: string): Promise<Pack | undefined> {
    try {
        const file = JSON.parse(text)
        if (file?.format !== PACK_FORMAT || !Array.isArray(file.cards)) return
        const cards = []
        for (const { code, description, seeds } of file.cards) {
            let binary, title
            try {
                binary = decodeBlob(code)
                if (!WebAssembly.validate(binary as BufferSource)) continue
                title = (await generateCard(binary, 0)).title
            } catch {
                continue
            }
            cards.push({
                code: encodeBlob(binary),
                title: title ?? NO_TITLE,
                size: binary.length,
                seeds: Array.isArray(seeds) ? seeds.filter(seed => Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32) : [],
                ...(typeof description === "string" ? { description: description.slice(0, 200) } : {}),
            })
        }
        if (cards.length === 0) return
        return { id: `${Date.now()}`, name: String(file.name ?? "Pack").slice(0, 40), cards }
    } catch {
        return
    }
}

