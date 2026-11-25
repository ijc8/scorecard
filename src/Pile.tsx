// The pile. The panel is a card, lying on top of a pile of cards like it: the deck. Flick the top
// card aside and it goes to the bottom of the pile; the next one is under it. Scan, Create, Settings
// and About are cards too, kept at the back of the pile, each with an index tab that sticks out
// below; tapping a tab brings its card to the top. (The music cards share a tab: see App.)
//
// React only ever draws the top card (`.pile-top`). The rest is done here with copies of it: what
// moves is a snapshot of the card, and what shows beneath a card being dragged is another copy,
// dressed up as the card that's next.
import { useEffect, useRef, useState } from "react"
import { DeckCard } from "./deck"
import { cardFace } from "./card"
import { motionOff } from "./Settings"

const pileTop = () => document.querySelector<HTMLElement>(".pile-top")

// A copy of the top card as it looks now, laid exactly over it.
function snapshot(top: HTMLElement) {
    const copy = top.cloneNode(true) as HTMLElement
    // (Canvases don't clone with their pictures.)
    const canvases = top.querySelectorAll("canvas"), copies = copy.querySelectorAll("canvas")
    canvases.forEach((canvas, i) => {
        const img = document.createElement("img")
        for (const { name, value } of canvas.attributes) if (name !== "width" && name !== "height") img.setAttribute(name, value)
        img.src = canvas.toDataURL()
        // (Keeping the canvas's own styles: one that's hidden stays hidden.)
        img.style.cssText += ";image-rendering:pixelated;width:100%;height:100%"
        copies[i].replaceWith(img)
    })
    copy.classList.remove("pile-top")
    copy.classList.add("pile-ghost")
    copy.setAttribute("inert", "")
    copy.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"))
    return copy
}

// Makes a copy of the top card look like another music card, face up.
function dress(copy: HTMLElement, card: DeckCard | undefined) {
    copy.querySelectorAll<HTMLElement>("[data-pane]").forEach(pane => {
        pane.style.visibility = pane.dataset.pane === "listen" ? "visible" : "hidden"
    })
    // (A music card's tab is the first.)
    copy.querySelectorAll<HTMLElement>(".own-tab > button").forEach(tab => { tab.style.visibility = tab.dataset.tab === "0" ? "visible" : "hidden" })
    copy.querySelector<HTMLElement>(".xray")?.style.setProperty("opacity", "0")
    // (Face up, even if the card it was copied from is turned over.)
    copy.querySelectorAll<HTMLElement>(".faces > .side").forEach(side => { side.style.visibility = side.classList.contains("front") ? "inherit" : "hidden" })
    copy.querySelector(".over")?.classList.remove("turned")
    if (!card) return
    const set = (selector: string, text: string) => copy.querySelectorAll(selector).forEach(element => { element.textContent = text })
    set("[data-card-title]", card.title)
    set("[data-card-size]", String(card.size))
    const qr = copy.querySelector<HTMLImageElement>("img[data-qr]")
    if (qr) qr.src = cardFace(card.code)
}

const OFF = { left: "translate(-115%, 4%) rotate(-10deg)", right: "translate(115%, 4%) rotate(10deg)", down: "translate(3%, 85%) rotate(3deg)" }

// A copy of a card goes off to one side (from wherever it is) and is tucked in at the bottom of the pile.
// (`haste` is how many times quicker than usual: a card that was thrown hard keeps its speed.)
function tuck(ghost: HTMLElement, direction: keyof typeof OFF, from = "none", haste = 1) {
    const pile = ghost.parentElement!
    ghost.animate([{ transform: from }, { transform: OFF[direction] }], { duration: 160 / haste, easing: haste > 1 ? "linear" : "cubic-bezier(.4, 0, .9, .6)", fill: "forwards" }).onfinish = () => {
        pile.prepend(ghost)
        ghost.style.zIndex = "0"
        ghost.animate([{ transform: OFF[direction] }, { transform: "none" }], { duration: 200 / Math.sqrt(haste), easing: "cubic-bezier(.2, .8, .3, 1)", fill: "forwards" }).onfinish = () => ghost.remove()
    }
}

// The whole top card turns over, becoming whatever `change` makes of it once it's edge-on.
// Meanwhile the card under it (`beneath`, if there is one) shows.
export function turn(change: () => void, beneath?: DeckCard) {
    const top = pileTop()
    if (!top || !top.animate || motionOff()) return change()
    let under: HTMLElement | undefined
    if (beneath) {
        under = snapshot(top)
        dress(under, beneath)
        under.style.zIndex = "1"
        top.parentElement!.append(under)
    }
    const at = (degrees: number) => ({ transform: `perspective(1400px) rotateY(${degrees}deg)` })
    top.animate([at(0), at(90)], { duration: 150, easing: "cubic-bezier(.5, 0, 1, .7)" }).onfinish = () => {
        change()
        top.animate([at(-90), at(0)], { duration: 210, easing: "cubic-bezier(.2, .9, .3, 1.15)" }).onfinish = () => under?.remove()
    }
}

// The top card goes to the bottom of the pile, showing what `change` puts in its place.
export function throwTop(direction: keyof typeof OFF, change: () => void) {
    const top = pileTop()
    if (!top || !top.animate || motionOff()) return change()
    const ghost = snapshot(top)
    top.parentElement!.append(ghost)
    change()
    tuck(ghost, direction)
}

// A card (whatever `change` makes the top card) is pulled out from under the top card by its tab, and laid on top.
export function raise(change: () => void) {
    const top = pileTop()
    if (!top || !top.animate || motionOff()) return change()
    const ghost = snapshot(top)
    top.parentElement!.append(ghost)
    change()
    const out = "translate(2%, 80%) rotate(2deg)"
    top.animate([{ transform: "none" }, { transform: out }], { duration: 190, easing: "cubic-bezier(.4, 0, .9, .6)" }).onfinish = () => {
        ghost.style.zIndex = "1"
        top.animate([{ transform: out }, { transform: "none" }], { duration: 230, easing: "cubic-bezier(.2, .8, .3, 1)" }).onfinish = () => ghost.remove()
    }
}

interface Drag { x: number, y: number, pointer: number, ghost?: HTMLElement, under?: HTMLElement, direction?: number, dx: number, trail: { t: number, x: number }[] }

// Handlers for the top card: drag it sideways and let go to send it to the bottom of the pile.
// `next` is the card that would turn up (if any) going one way or the other; `go` makes it the top
// card. With a tabbed card on top (`dismiss` given), the card under it is the one that's loaded.
export function usePile({ enabled, current, next, go, dismiss }: {
    enabled: boolean, current: string | null, next: (direction: 1 | -1) => DeckCard | undefined, go: (card: DeckCard) => void, dismiss?: () => void,
}) {
    const drag = useRef<Drag | null>(null)
    const latest = useRef({ enabled, next, go, dismiss })
    latest.current = { enabled, next, go, dismiss }
    // (Left and right arrow keys flick through the pile, too.)
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return
            const direction = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
            const { enabled, next, go, dismiss } = latest.current
            if (!direction || !enabled) return
            const card = next(direction as 1 | -1)
            if (dismiss) throwTop(direction > 0 ? "left" : "right", dismiss)
            else if (card) throwTop(direction > 0 ? "left" : "right", () => go(card))
        }
        document.addEventListener("keydown", key)
        return () => document.removeEventListener("keydown", key)
    }, [])
    const [, redraw] = useState(0)
    useEffect(() => {
        // Once the card that was under a thrown one has become the top card, its stand-in can go.
        document.querySelectorAll(".pile-under.done").forEach(under => under.remove())
    }, [current, dismiss === undefined])

    const transform = (d: Drag) => {
        const { next, dismiss } = latest.current
        // (With nothing to turn up, the card resists.)
        const dx = dismiss || next(d.dx < 0 ? 1 : -1) ? d.dx : d.dx * 0.25
        return `translate(${dx}px, ${Math.abs(dx) * 0.04}px) rotate(${dx / 22}deg)`
    }
    const end = (commit: boolean) => {
        const d = drag.current
        drag.current = null
        if (!d?.ghost) return
        pileTop()?.classList.remove("lifted")
        // (Letting go of a card that was picked up by a link, such as the wordmark, isn't a click on it.)
        const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation() }
        window.addEventListener("click", swallow, true)
        setTimeout(() => window.removeEventListener("click", swallow, true))
        const { next, go, dismiss } = latest.current
        const forward = d.dx < 0
        const card = dismiss ? undefined : next(forward ? 1 : -1)
        // How fast it was let go, in pixels a millisecond (the way it was dragged counting as positive).
        const first = d.trail[0], last = d.trail[d.trail.length - 1]
        const speed = last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) * Math.sign(d.dx) : 0
        // A card goes if it's let go far enough out, or thrown.
        if (commit && (Math.abs(d.dx) > 70 || (speed > 0.5 && Math.abs(d.dx) > 15)) && speed > -0.3 && (dismiss || card)) {
            d.under?.classList.add("done")
            const under = d.under
            // (In case nothing changes to clear it away.)
            setTimeout(() => under?.remove(), 600)
            tuck(d.ghost, forward ? "left" : "right", transform(d), Math.min(Math.max(speed / 0.5, 1), 3))
            if (dismiss) dismiss()
            else go(card!)
            redraw(n => n + 1)
        } else {
            const { ghost, under } = d
            ghost.animate([{ transform: transform(d) }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.3, 1.5, .5, 1)" }).onfinish = () => {
                ghost.remove()
                under?.remove()
            }
        }
    }
    return {
        onPointerDown: (e: React.PointerEvent) => {
            if (drag.current || motionOff()) return
            if ((e.target as HTMLElement).closest("button, input, textarea, select, label, video, .source")) return
            drag.current = { x: e.clientX, y: e.clientY, pointer: e.pointerId, dx: 0, trail: [] }
        },
        onPointerMove: (e: React.PointerEvent) => {
            const d = drag.current
            if (!d || e.pointerId !== d.pointer) return
            d.dx = e.clientX - d.x
            // (Where the pointer has been in the last tenth of a second, to tell how fast the card is let go.)
            d.trail.push({ t: e.timeStamp, x: e.clientX })
            while (d.trail[0].t < e.timeStamp - 100) d.trail.shift()
            const dy = e.clientY - d.y
            const top = e.currentTarget as HTMLElement
            if (!d.ghost) {
                if (Math.abs(d.dx) < 10 || Math.abs(d.dx) < Math.abs(dy)) return
                top.setPointerCapture(e.pointerId)
                d.under = snapshot(top)
                d.under.classList.add("pile-under")
                d.ghost = snapshot(top)
                top.parentElement!.append(d.under, d.ghost)
                // (The card's own tab goes with the copy that moves.)
                top.classList.add("lifted")
            }
            const direction = d.dx < 0 ? 1 : -1
            if (direction !== d.direction) {
                d.direction = direction
                const { next, dismiss } = latest.current
                dress(d.under!, dismiss ? undefined : next(direction as 1 | -1))
            }
            d.ghost.style.transform = transform(d)
        },
        onPointerUp: () => end(true),
        // (Links and pictures on the card aren't to be dragged off it.)
        onDragStart: (e: React.DragEvent) => e.preventDefault(),
        onPointerCancel: () => end(false),
    }
}

// The dissolve (HyperCard's): a tile of cells that switch on in a scattered order, used as a mask in STEPS stages.
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

// Styles for something that dissolves in (when `on`) and out again: the card's bits, over its QR code.
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
