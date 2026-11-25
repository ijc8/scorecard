import { useState } from "react"
import Volume from "pixelarticons/svg/volume-2.svg?react"

// Settings, kept in localStorage.
export const defaultSettings = { collect: true, motion: true, volume: 1, awake: false, echo: true, meter: false, deckStyle: "drawer" as "drawer" | "rolodex", look: "pile" as "pile" | "printed" | "classic" }
export type Settings = typeof defaultSettings

export function loadSettings(): Settings {
    try {
        const settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem("scorecard-settings") ?? "{}") }
        // (An earlier mock.)
        if (settings.look === "stack") settings.look = "pile"
        return settings
    } catch {
        return defaultSettings
    }
}

// Animations can be turned off in Settings (which sets this class), or by the system.
export function motionOff() {
    return document.documentElement.classList.contains("still") || window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function SettingsTab({ settings, setSettings, deckSize, hasStarter, freshStarter, emptyDeck, measure }: {
    settings: Settings, setSettings: (s: Settings) => void, deckSize: number, hasStarter: boolean, freshStarter: () => void, emptyDeck: () => void,
    // Times the loaded card, as scanned and guarded, and says how it went.
    measure: () => Promise<string>,
}) {
    const [measured, setMeasured] = useState("")
    const toggle = (key: "collect" | "motion" | "awake" | "echo" | "meter", label: string, hint: string) =>
        <label>
            <input type="checkbox" checked={settings[key]} onChange={e => setSettings({ ...settings, [key]: e.target.checked })} />
            <span>{label}<small>{hint}</small></span>
        </label>
    return <div className="settings">
        <label>
            <Volume style={{ height: "22px", flexShrink: 0 }} />
            <span style={{ flexGrow: 1 }}>Volume
                <input type="range" min="0" max="1" step="0.01" value={settings.volume} onChange={e => setSettings({ ...settings, volume: Number(e.target.value) })} />
            </span>
        </label>
        <label>
            <span style={{ flexGrow: 1 }}>Card look<small>The panel as the top card of a pile, to flick through (a prototype), the card as it's printed, lying on the player (another), or the classic panel.</small></span>
            <select value={settings.look} onChange={e => setSettings({ ...settings, look: e.target.value as Settings["look"] })}>
                <option value="pile">Pile</option>
                <option value="printed">Printed card</option>
                <option value="classic">Classic</option>
            </select>
        </label>
        <label>
            <span style={{ flexGrow: 1 }}>Deck style<small>A drawer of cards beside the player, or (to try out) a rolodex: the next cards stand behind this one; swipe the card down or up to flip through them.</small></span>
            <select value={settings.deckStyle} onChange={e => setSettings({ ...settings, deckStyle: e.target.value as Settings["deckStyle"] })}>
                <option value="drawer">Drawer</option>
                <option value="rolodex">Rolodex</option>
            </select>
        </label>
        {toggle("collect", "Collect cards", "Add cards to your deck when you scan them or open their links.")}
        {toggle("motion", "Animations", "Cards that deal, fly and flip.")}
        {"wakeLock" in navigator && toggle("awake", "Stay awake", "Keep the screen on while a card is playing.")}
        {toggle("echo", "Echo cancellation", "Stops cards that listen from hearing themselves and howling. Sounds cleaner off, with headphones.")}
        {toggle("meter", "Guard against stuck cards", "An experiment: counts each card's loops as it plays, and stops a card that never finishes. Slows cards a little.")}
        <button onClick={async () => { setMeasured("Measuring..."); setMeasured(await measure()) }}>Measure this card's speed</button>
        {measured && <small style={{ marginTop: "-8px" }}>{measured}</small>}
        <button disabled={hasStarter} onClick={freshStarter}>Get a fresh starter pack</button>
        <button disabled={deckSize === 0} onClick={() => window.confirm(`Throw away all ${deckSize} cards in your deck, and their saved seeds?`) && emptyDeck()}>Empty my deck</button>
    </div>
}

