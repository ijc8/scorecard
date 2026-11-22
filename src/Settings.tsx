import Volume from "pixelarticons/svg/volume-2.svg?react"

// Settings, kept in localStorage.
export const defaultSettings = { collect: true, motion: true, volume: 1, awake: false }
export type Settings = typeof defaultSettings

export function loadSettings(): Settings {
    try {
        return { ...defaultSettings, ...JSON.parse(localStorage.getItem("scorecard-settings") ?? "{}") }
    } catch {
        return defaultSettings
    }
}

// Animations can be turned off in Settings (which sets this class), or by the system.
export function motionOff() {
    return document.documentElement.classList.contains("still") || window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function SettingsTab({ settings, setSettings, deckSize, hasStarter, freshStarter, emptyDeck }: {
    settings: Settings, setSettings: (s: Settings) => void, deckSize: number, hasStarter: boolean, freshStarter: () => void, emptyDeck: () => void
}) {
    const toggle = (key: "collect" | "motion" | "awake", label: string, hint: string) =>
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
        {toggle("collect", "Collect cards", "Add cards to your deck when you scan them or open their links.")}
        {toggle("motion", "Animations", "Cards that deal, fly and flip.")}
        {"wakeLock" in navigator && toggle("awake", "Stay awake", "Keep the screen on while a card is playing.")}
        <button disabled={hasStarter} onClick={freshStarter}>Get a fresh starter pack</button>
        <button disabled={deckSize === 0} onClick={() => window.confirm(`Throw away all ${deckSize} cards in your deck, and their saved seeds?`) && emptyDeck()}>Empty my deck</button>
    </div>
}

