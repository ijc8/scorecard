import { useState } from "react"
import Heart from "pixelarticons/svg/heart.svg?react"
import Close from "pixelarticons/svg/close.svg?react"
import library from "./library.json"
import { decodeBlob, encodeBlob } from "./base43Encoder"
import { DeckCard, Pack } from "./deck"
import { NO_TITLE, cardFace, formatSeed, generateCard } from "./card"
import { motionOff } from "./Settings"

export type LoadCard = (code: string, seed?: number) => void

// Send a copy of a card flying from the deck onto the player.
export function flyToPlayer(card: HTMLElement) {
    const table = document.getElementById("table")
    if (!table || !card.animate || motionOff()) return
    const from = card.getBoundingClientRect()
    const to = table.getBoundingClientRect()
    const copy = card.cloneNode(true) as HTMLElement
    Object.assign(copy.style, {
        position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
        margin: "0", zIndex: "100", pointerEvents: "none",
    })
    document.body.append(copy)
    const move = `translate(${to.left + to.width / 2 - from.left - from.width / 2}px, ${to.top + to.height / 2 - from.top - from.height / 2}px)`
    const scale = Math.min(to.width / from.width, to.height / from.height)
    copy.animate([
        { transform: "none", opacity: 1 },
        { transform: `${move} scale(${scale * 0.9}) rotate(6deg)`, opacity: 1, offset: 0.75 },
        { transform: `${move} scale(${scale})`, opacity: 0 },
    ], { duration: 450, easing: "cubic-bezier(.3, 0, .2, 1)" }).onfinish = () => copy.remove()
}

export function PlayingCard({ title, size, code, index, selected, loadCard, children }: {
    title: string, size: number, code: string, index: number, selected: boolean, loadCard: LoadCard, children?: React.ReactNode
}) {
    // Cards sit a little crooked in the pile (each always the same way).
    const tilt = (code.charCodeAt(1) + code.charCodeAt(2) * 3) % 7 - 3
    const style = { "--tilt": `${tilt}deg`, "--i": Math.min(index, 12) } as React.CSSProperties
    return <div className={"pcard" + (selected ? " selected" : "")} style={style}>
        <button className="pcard-face" onClick={e => { flyToPlayer(e.currentTarget); loadCard(code) }}>
            <span className="pcard-head"><b>{title}</b><span>{size}</span></span>
            <img src={cardFace(code)} alt="" />
        </button>
        {selected && children}
    </div>
}

// A sealed pack of cards, waiting in the deck to be torn open.
export function SealedPack({ pack, open }: { pack: Pack, open: () => void }) {
    const [opening, setOpening] = useState(false)
    const tear = () => {
        if (opening) return
        setOpening(true)
        setTimeout(open, motionOff() ? 0 : 600)
    }
    return <button className={"pack" + (opening ? " opening" : "")} onClick={tear}>
        <span className="pack-top"></span>
        <span className="pack-body">
            <span className="pack-label">
                <b>{pack.name}</b>
                <span>{pack.cards.length} {pack.cards.length === 1 ? "card" : "cards"}</span>
            </span>
            <span className="pack-hint">Open</span>
        </span>
    </button>
}

// Your collection of cards, which overlap in a pile; the one that's playing is pulled out.
// Below the pile are any sealed packs (to begin with, a starter pack built from `examples/library`).
// On wide screens the deck sits beside the player; on narrow ones it's a drawer.
export function Deck({ deck, packs, current, loadCard, discard, openPack, importPack, exportPack, open, setOpen }: {
    deck: DeckCard[], packs: Pack[], current: string | null, loadCard: LoadCard, discard: (code: string) => void,
    openPack: (pack: Pack) => void, importPack: (file: File) => void, exportPack: () => void, open: boolean, setOpen: (o: boolean) => void
}) {
    const play: LoadCard = (code, seed) => {
        loadCard(code, seed)
        setOpen(false)
    }
    return <>
        {/* On narrow screens, the edge of the deck peeks out from the side, to be pulled out. */}
        <button className="deck-peek" title="Deck" aria-label="Open your deck" onClick={() => setOpen(true)}><span></span><span></span><span></span></button>
        {open && <div className="deck-scrim" onClick={() => setOpen(false)}></div>}
        <aside className={"deck" + (open ? " open" : "")}>
            <div>
                <h3>
                    <span>Deck | {deck.length} {deck.length === 1 ? "card" : "cards"}</span>
                    <button className="deck-close" title="Close" style={{ fontSize: 0 }} onClick={() => setOpen(false)}><Close style={{ height: "18px" }} /></button>
                </h3>
                {deck.length === 0 && <p>Cards you scan or open from a link land here. Keep the one you're hearing with <Heart style={{ height: "1em", verticalAlign: "middle" }} />.</p>}
                <div className="pile">
                    {deck.map((card, index) =>
                        <PlayingCard key={card.code} {...card} index={index} selected={card.code === current} loadCard={play}>
                            <div className="pcard-extras">
                                {card.description && <div>{card.description}</div>}
                                {card.seeds.map(seed =>
                                    <button key={seed} title="Play with this seed" onClick={() => play(card.code, seed)}>{formatSeed(seed)}</button>
                                )}
                                <span>{card.seeds.length === 0 && new Date(card.added).toLocaleDateString()}</span>
                                <button title="Remove from deck" style={{ fontSize: 0 }} onClick={() => discard(card.code)}><Close style={{ height: "14px" }} /></button>
                            </div>
                        </PlayingCard>
                    )}
                </div>
                {packs.map(pack => <SealedPack key={pack.id} pack={pack} open={() => openPack(pack)} />)}
                <div className="deck-actions">
                    {deck.length > 0 && <button title="Save your deck as a pack file to share" onClick={exportPack}>Wrap as a pack</button>}
                    <label title="Add a pack from a file">
                        Add a pack
                        <input type="file" accept=".json,application/json" onChange={e => {
                            if (e.target.files?.[0]) importPack(e.target.files[0])
                            e.target.value = ""
                        }} />
                    </label>
                </div>
            </div>
        </aside>
    </>
}

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

