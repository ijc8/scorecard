// The pile, spread out (see Pile.tsx): every card in the deck dealt across the
// table as a small copy of the whole panel, along with the tabbed cards and any sealed packs. Tap a
// card and the pile is gathered up again with that card on top; tap the table to gather it as it was.
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Play from "pixelarticons/svg/play.svg?react"
import Prev from "pixelarticons/svg/prev.svg?react"
import ClockIcon from "pixelarticons/svg/clock.svg?react"
import Dice from "pixelarticons/svg/dice.svg?react"
import CloseBox from "pixelarticons/svg/close-box.svg?react"
import Bullseye from "pixelarticons/svg/bullseye.svg?react"
import Heart from "pixelarticons/svg/heart.svg?react"
import Close from "pixelarticons/svg/close.svg?react"
import { Forward, HeartFull } from "./icons"
import logoUrl from "./assets/logo.png"
import { DeckCard, Pack } from "./deck"
import { cardFace, formatSeed } from "./card"
import { motionOff } from "./Settings"

// Where something is on the page (rather than in the window, which may scroll).
export interface Place { left: number, top: number, width: number, height: number }
export function placeOf(element: Element): Place {
    const { left, top, width, height } = element.getBoundingClientRect()
    return { left: left + window.scrollX, top: top + window.scrollY, width, height }
}

// The transform that puts a small card over the place where the pile was (or will be).
function toPile(element: Element, pile: Place) {
    const at = placeOf(element)
    const dx = pile.left + pile.width / 2 - at.left - at.width / 2, dy = pile.top + pile.height / 2 - at.top - at.height / 2
    return `translate(${dx}px, ${dy}px) scale(${pile.width / at.width}) rotate(0deg)`
}

// Cards sit a little crooked on the table (each always the same way).
const tilt = (key: string) => ({ "--tilt": `${((key.charCodeAt(1) + key.charCodeAt(2) * 3) % 7 - 3) * 0.6}deg` }) as React.CSSProperties

const Logo = () => <img src={logoUrl} alt="ScoreCard" style={{ display: "block", width: "100%", marginBottom: "20px", imageRendering: "pixelated" }} />

// A music card as it looks on top of the pile, but not live: nothing on it works.
function Face({ card }: { card: DeckCard }) {
    const big = { height: "10cqw", verticalAlign: "middle" }, small = { height: "5cqw", flexShrink: 0, verticalAlign: "middle" }
    const SeedIcon = card.seeds.length ? CloseBox : Dice, KeptIcon = card.seeds.length ? HeartFull : Heart
    return <div style={{ margin: "20px" }}>
        <Logo />
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", margin: "0 0 12px", fontSize: "6cqw", lineHeight: 1.2 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.title}</span>
            <span style={{ whiteSpace: "nowrap" }}>{card.size} bytes <Bullseye style={{ height: "6cqw", verticalAlign: "middle" }} /></span>
        </div>
        <img src={cardFace(card.code)} alt="" style={{ display: "block", width: "100%", aspectRatio: "1", marginBottom: "20px", imageRendering: "pixelated" }} />
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1.6cqw", fontSize: "5cqw" }}>
            <ClockIcon style={small} /><span>0:00</span><Prev style={big} /><Play style={big} /><Forward style={{ ...big, height: "8cqw" }} />
            <SeedIcon style={small} /><span style={{ width: "4.6em" }}>{card.seeds.length ? formatSeed(card.seeds[0]) : "--------"}</span><KeptIcon style={small} />
        </div>
    </div>
}

// A sealed pack of cards, waiting on the table to be torn open.
function SealedPack({ pack, open }: { pack: Pack, open: () => void }) {
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

// A card with a tab: `face` is what's on it (drawn small, and not to be used there).
export interface TabbedCard { index: number, name: string, face: React.ReactNode, Icon: React.FunctionComponent<React.SVGProps<SVGSVGElement>> }

export function Spread({ deck, packs, tabbed, current, pile, pick, pickTab, close, discard, openPack, importPack, exportPack }: {
    deck: DeckCard[], packs: Pack[], tabbed: TabbedCard[], current: string | null,
    // Where the pile is when gathered: the cards are dealt from there, and go back there.
    pile: Place | null,
    pick: (code: string, seed?: number) => void, pickTab: (index: number) => void, close: () => void,
    discard: (code: string) => void, openPack: (pack: Pack) => void, importPack: (file: File) => void, exportPack: () => void,
}) {
    const table = useRef<HTMLDivElement>(null)
    const gathering = useRef(false)

    // Deal the cards out from the pile.
    useLayoutEffect(() => {
        if (!pile || motionOff()) return
        table.current!.querySelectorAll<HTMLElement>(".mini, .pack").forEach((card, i) => {
            if (!card.animate) return
            card.animate([{ transform: toPile(card, pile), offset: 0 }], { duration: 330, delay: Math.min(i, 16) * 24, easing: "cubic-bezier(.2, .8, .3, 1.08)", fill: "backwards" })
        })
    }, [])

    // Gather the pile up again, around the chosen card (or as it was), and then do something with it.
    const gather = (chosen: Element | null | undefined, then: () => void) => {
        if (gathering.current) return
        if (!pile || motionOff() || !(chosen instanceof HTMLElement) || !chosen.animate) return then()
        gathering.current = true
        table.current!.classList.add("gathering")
        chosen.classList.add("chosen")
        chosen.animate([{ transform: toPile(chosen, pile), offset: 1 }], { duration: 260, easing: "cubic-bezier(.4, 0, .5, 1)", fill: "forwards" }).onfinish = then
    }
    const closeRef = useRef(close)
    closeRef.current = close
    const gatherRef = useRef(gather)
    gatherRef.current = gather
    useEffect(() => {
        // A tap on the table (not on anything lying on it) gathers the pile as it was. So does Escape.
        const back = () => gatherRef.current(table.current!.querySelector(".mini.current"), () => closeRef.current())
        const click = (e: MouseEvent) => {
            if (e.target instanceof Element && e.target.matches("html, body, #root, #layout, #app, .spread, .spread-cards, .spread h3")) back()
        }
        const key = (e: KeyboardEvent) => { if (e.key === "Escape") back() }
        document.addEventListener("click", click)
        document.addEventListener("keydown", key)
        return () => {
            document.removeEventListener("click", click)
            document.removeEventListener("keydown", key)
        }
    }, [])

    const activate = (action: (target: HTMLElement) => void) => ({
        role: "button", tabIndex: 0,
        onClick: (e: React.MouseEvent<HTMLElement>) => action(e.currentTarget),
        onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => { if (e.key === "Enter") action(e.currentTarget) },
    })
    return <div className="spread" ref={table}>
        <h3>{deck.length === 0 ? "Cards you scan or open from a link land here." : `${deck.length} ${deck.length === 1 ? "card" : "cards"}`}</h3>
        <div className="spread-cards">
            {deck.map(card =>
                <div key={card.code} className={"mini" + (card.code === current ? " current" : "")} style={tilt(card.code)}>
                    <div className="mini-scale pile-card" title={`Play ${card.title}`} {...activate(target => gather(target.parentElement, () => pick(card.code)))}><Face card={card} /></div>
                    <button className="mini-x" title="Remove from deck" onClick={() => discard(card.code)}><Close /></button>
                    {card.seeds.length > 0 && <div className="mini-seeds">
                        {card.seeds.map(seed => <button key={seed} title="Play with this seed" onClick={e => gather(e.currentTarget.closest(".mini"), () => pick(card.code, seed))}>{formatSeed(seed)}</button>)}
                    </div>}
                </div>
            )}
            {packs.map(pack => <SealedPack key={pack.id} pack={pack} open={() => openPack(pack)} />)}
        </div>
        <div className="spread-cards tabbed">
            {tabbed.map(({ index, name, face, Icon }, slot) =>
                <div key={index} className="mini" style={{ ...tilt(name + name), "--slot": slot } as React.CSSProperties}>
                    <div className="mini-scale pile-card" title={name} {...activate(target => gather(target.parentElement, () => pickTab(index)))}>
                        <div style={{ margin: "20px" }}>
                            <Logo />
                            <div className="mini-face" {...{ inert: "" }}>{face}</div>
                        </div>
                    </div>
                    {/* Its tab, where it sticks out of the pile. */}
                    <span className="mini-tab"><Icon /></span>
                </div>
            )}
        </div>
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
}
