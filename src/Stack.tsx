// The stack look (a mock; Settings > Card look), after HyperCard: the whole panel is a card, in two
// layers. The background (wordmark, transport, these arrows, the tabs) is shared by every card in the
// stack; the card layer (name, size, QR code) is each card's own. The deck is the stack: arrows and
// "3 of 12" step through it, with HyperCard's visual effects for transitions: a wipe from one card
// to the next, and a dissolve between a card's QR code and its bits.
import { useEffect, useRef, useState } from "react"
import { DeckCard } from "./deck"
import { motionOff } from "./Settings"

// Wipes from the card that's showing to the one about to be loaded (call this just before loading
// it). Only the card layer changes, so a snapshot of the old one is laid over it and wiped away:
// leftwards for the next card, rightwards for the one before.
export function wipe(direction: 1 | -1) {
    const card = document.querySelector<HTMLElement>(".card3d")
    const front = card?.querySelector<HTMLElement>(".side:not(.back)")
    if (!card || !front || !front.animate || front.style.visibility === "hidden" || motionOff()) return
    const ghost = front.cloneNode(true) as HTMLElement
    // (Canvases don't clone with their pictures.)
    const canvases = front.querySelectorAll("canvas"), copies = ghost.querySelectorAll("canvas")
    canvases.forEach((canvas, i) => {
        const img = document.createElement("img")
        img.src = canvas.toDataURL()
        img.className = canvas.className
        img.style.cssText = canvas.style.cssText + ";image-rendering:pixelated;display:block;width:100%;height:100%"
        copies[i].replaceWith(img)
    })
    Object.assign(ghost.style, { position: "absolute", inset: "0", zIndex: "5", pointerEvents: "none", transition: "none" })
    ghost.setAttribute("inert", "")
    card.querySelectorAll(".wipe-ghost").forEach(old => old.remove())
    ghost.classList.add("wipe-ghost")
    card.append(ghost)
    // In steps, so the edge moves in chunks, as it did at 1-bit.
    ghost.animate(
        [{ clipPath: "inset(0 0 0 0)" }, { clipPath: direction > 0 ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)" }],
        { duration: 320, easing: "steps(16)" },
    ).onfinish = () => ghost.remove()
}

// The dissolve: a tile of cells that switch on in a scattered order, used as a mask in STEPS stages.
const STEPS = 8, CELLS = 32, CELL = 4
let tiles: string[] | null = null
function dissolveTiles() {
    if (tiles) return tiles
    const order = Array.from({ length: CELLS * CELLS }, (_, i) => i % STEPS)
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
    }
    // (Drawn at the screen's own resolution, so the cells keep hard edges.)
    const scale = CELL * Math.ceil(window.devicePixelRatio || 1)
    tiles = Array.from({ length: STEPS + 1 }, (_, level) => {
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = CELLS * scale
        const context = canvas.getContext("2d")!
        order.forEach((stage, i) => {
            if (stage < level) context.fillRect((i % CELLS) * scale, Math.floor(i / CELLS) * scale, scale, scale)
        })
        return `url(${canvas.toDataURL()})`
    })
    return tiles
}

// Styles for something that dissolves in (when `on`) and out again.
export function useDissolve(on: boolean): React.CSSProperties {
    const [level, setLevel] = useState(on ? STEPS : 0)
    useEffect(() => {
        const target = on ? STEPS : 0
        if (motionOff()) return setLevel(target)
        const timer = window.setInterval(() => setLevel(level => {
            if (level === target) clearInterval(timer)
            return level + Math.sign(target - level)
        }), 45)
        return () => clearInterval(timer)
    }, [on])
    if (level === STEPS) return { opacity: 1, transition: "none" }
    if (level === 0) return { opacity: 0, transition: "none" }
    const mask = dissolveTiles()[level], size = `${CELLS * CELL}px`
    return { opacity: 1, transition: "none", maskImage: mask, WebkitMaskImage: mask, maskSize: size, WebkitMaskSize: size }
}

// Sideways swipes on the card: left for the next card, right for the one before.
export function useSwipe(step: (direction: 1 | -1) => void) {
    const start = useRef<{ x: number, y: number } | null>(null)
    return {
        onPointerDown: (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY } },
        onPointerUp: (e: React.PointerEvent) => {
            const s = start.current
            start.current = null
            if (!s) return
            const dx = e.clientX - s.x, dy = e.clientY - s.y
            if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1)
        },
        onPointerCancel: () => { start.current = null },
        style: { touchAction: "pan-y" },
    }
}

// A fat arrow, as on a HyperCard background, drawn on pixelarticons' grid (pointing right).
const Arrow = ({ left }: { left?: boolean }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={left ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M2 8h10V2h2v2h2v2h2v2h2v2h2v4h-2v2h-2v2h-2v2h-2v2h-2v-6H2V8z" fill="currentColor" />
</svg>

// On the background of every card: arrows to the cards either side, and where this one is in the
// stack (which opens the deck).
export function StackNav({ deck, current, step, openDeck }: { deck: DeckCard[], current: string | null, step: (direction: 1 | -1) => void, openDeck: () => void }) {
    const index = deck.findIndex(card => card.code === current)
    const nowhere = deck.length === 0 || (deck.length === 1 && index === 0)
    const stepRef = useRef(step)
    stepRef.current = step
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return
            if (e.key === "ArrowLeft") stepRef.current(-1)
            else if (e.key === "ArrowRight") stepRef.current(1)
        }
        document.addEventListener("keydown", key)
        return () => document.removeEventListener("keydown", key)
    }, [])
    return <div className="stack-nav">
        <button disabled={nowhere} title="Previous card" aria-label="Previous card" onClick={() => step(-1)}><Arrow left /></button>
        <button className="stack-count" title="Show the deck" onClick={openDeck}>{index < 0 ? "–" : index + 1} of {deck.length}</button>
        <button disabled={nowhere} title="Next card" aria-label="Next card" onClick={() => step(1)}><Arrow /></button>
    </div>
}
