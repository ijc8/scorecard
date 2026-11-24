// The deck as a rolodex (a prototype, chosen in Settings): the cards after this one stand behind
// it, their tops (title and size) showing above it. Swipe the card down to flip it forward and
// bring up the next; swipe up to bring back the one before; or tap a card's top to go to it.
import { useRef } from "react"
import { DeckCard } from "./deck"
import { LoadCard } from "./Deck"
import { motionOff } from "./Settings"

const SHOWN = 3  // how many cards' tops show behind this one

// Where the player's card is in the deck, and the cards around it.
function around(deck: DeckCard[], current: string | null) {
    const index = deck.findIndex(card => card.code === current)
    const at = (offset: number) => deck[((index + offset) % deck.length + deck.length) % deck.length]
    return { index, at }
}

// Turns the rolodex: animates the big card going (forward) or coming back (backward). The card's
// contents change underneath, so the old card is shown by a snapshot laid over it.
function turn(direction: 1 | -1) {
    const card = document.querySelector<HTMLElement>(".card3d")
    const front = card?.querySelector<HTMLElement>(".side:not(.back)")
    if (!card || !front || !card.animate || motionOff()) return
    const rect = front.getBoundingClientRect()
    const snapshot = front.cloneNode(true) as HTMLElement
    // (Canvases don't clone with their pictures.)
    const canvases = front.querySelectorAll("canvas"), copies = snapshot.querySelectorAll("canvas")
    canvases.forEach((canvas, i) => {
        const img = document.createElement("img")
        img.src = canvas.toDataURL()
        img.className = canvas.className
        img.style.cssText = canvas.style.cssText + ";image-rendering:pixelated;display:block;width:100%;height:100%"
        copies[i].replaceWith(img)
    })
    Object.assign(snapshot.style, {
        position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
        margin: "0", zIndex: direction > 0 ? "60" : "40", pointerEvents: "none", transformOrigin: "50% 100%", background: "white",
    })
    document.body.append(snapshot)
    const behind = { transform: "translateY(-7%) scale(0.9)", opacity: 0.5 }
    const fallen = { transform: "perspective(900px) rotateX(-95deg)", opacity: 1 }
    const options = { duration: 420, easing: "cubic-bezier(.4, 0, .6, 1)" }
    if (direction > 0) {
        // This card falls forward, hinged at its foot, and the next rises from behind it.
        snapshot.animate([{ transform: "perspective(900px) rotateX(0deg)" }, fallen], options).onfinish = () => snapshot.remove()
        card.animate([behind, { transform: "none", opacity: 1 }], options)
    } else {
        // The card before swings back up in front, and this one sinks back into its place.
        snapshot.animate([{ transform: "none", opacity: 1 }, behind], options).onfinish = () => snapshot.remove()
        card.style.transformOrigin = "50% 100%"
        card.animate([fallen, { transform: "perspective(900px) rotateX(0deg)", opacity: 1 }], options).onfinish = () => { card.style.transformOrigin = "" }
    }
}

// The card that many places along from this one in the deck (the deck's first, if this isn't in it).
export function neighbour(deck: DeckCard[], current: string | null, direction: number) {
    if (deck.length === 0) return
    const { index, at } = around(deck, current)
    return index < 0 ? deck[0] : at(direction)
}

export function useRolodex(deck: DeckCard[], current: string | null, loadCard: LoadCard) {
    const go = (direction: 1 | -1) => {
        if (deck.length === 0) return
        const { index, at } = around(deck, current)
        // (If this card isn't in the deck, start from the deck's first.)
        const card = index < 0 ? deck[0] : at(direction)
        if (card.code === current) return
        turn(direction)
        loadCard(card.code)
    }
    // Vertical swipes on the card.
    const start = useRef<{ x: number, y: number } | null>(null)
    const swipe = {
        onPointerDown: (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY } },
        onPointerUp: (e: React.PointerEvent) => {
            const s = start.current
            start.current = null
            if (!s) return
            const dx = e.clientX - s.x, dy = e.clientY - s.y
            if (Math.abs(dy) > 40 && Math.abs(dy) > 1.5 * Math.abs(dx)) go(dy > 0 ? 1 : -1)
        },
        onPointerCancel: () => { start.current = null },
    }
    return { go, swipe }
}

// The tops of the next few cards, standing behind this one (the furthest at the top).
export function RolodexTops({ deck, current, loadCard }: { deck: DeckCard[], current: string | null, loadCard: LoadCard }) {
    const { index, at } = around(deck, current)
    const shown = Math.min(SHOWN, deck.length - (index < 0 ? 0 : 1))
    const cards = Array.from({ length: shown }, (_, k) => index < 0 ? deck[k] : at(k + 1)).reverse()
    return <div className="rolodex">
        {cards.map((card, i) => {
            const depth = shown - i  // 1 is just behind the big card
            return <button key={card.code} style={{ "--depth": depth } as React.CSSProperties} title={`Go to ${card.title}`}
                onClick={() => {
                    if (motionOff() || depth > 1) loadCard(card.code)
                    else {
                        turn(1)
                        loadCard(card.code)
                    }
                }}>
                <span>{card.title}</span><span>{card.size} bytes</span>
            </button>
        })}
    </div>
}
