// On-page audio debug overlay, enabled with `?debug` in the URL.
// Shows AudioContext state, whether currentTime is advancing, worklet heartbeat, and recent events.
// In the dev server, log lines are also POSTed to /__debuglog (see vite.config.ts) so they can be
// read on the dev machine without a remote Web Inspector.

export const DEBUG = new URLSearchParams(window.location.search).has("debug")

type Snapshot = () => Record<string, unknown>

const lines: string[] = []
const t0 = performance.now()
let snapshot: Snapshot = () => ({})
let panel: HTMLPreElement | null = null
let outbox: string[] = []

function stamp() {
    return ((performance.now() - t0) / 1000).toFixed(2).padStart(7)
}

export function dlog(...args: unknown[]) {
    if (!DEBUG) return
    const line = `${stamp()} ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`
    console.log("[audio]", line)
    lines.push(line)
    if (lines.length > 14) lines.shift()
    outbox.push(line)
    render()
}

function render() {
    if (!panel) return
    let state: Record<string, unknown>
    try { state = snapshot() } catch (e) { state = { snapshotError: String(e) } }
    panel.textContent = Object.entries(state).map(([k, v]) => `${k}: ${typeof v === "number" ? +v.toFixed(3) : v}`).join("\n")
        + "\n---\n" + lines.join("\n")
}

function flush() {
    if (!import.meta.env.DEV || outbox.length === 0) return
    const body = outbox.join("\n")
    outbox = []
    fetch("__debuglog", { method: "POST", body, keepalive: true }).catch(() => {})
}

export function initDebug(getSnapshot: Snapshot) {
    if (!DEBUG) return
    snapshot = getSnapshot
    panel = document.createElement("pre")
    Object.assign(panel.style, {
        position: "fixed", left: "0", top: "0", zIndex: "1000", margin: "0", padding: "4px",
        maxWidth: "100vw", maxHeight: "45vh", overflow: "hidden", pointerEvents: "none",
        font: "11px/1.25 monospace", background: "rgba(255,255,220,0.92)", color: "black", textAlign: "left",
        whiteSpace: "pre-wrap",
    })
    document.body.appendChild(panel)
    setInterval(render, 250)
    setInterval(flush, 1000)
    // Periodic state line, so the remote log shows what happened while nobody was tapping.
    setInterval(() => dlog("tick", snapshot()), 2000)
    document.addEventListener("visibilitychange", () => { dlog("visibility", document.visibilityState); flush() })
    window.addEventListener("pagehide", () => { dlog("pagehide"); flush() })
    window.addEventListener("pageshow", e => dlog("pageshow persisted=" + (e as PageTransitionEvent).persisted))
    window.addEventListener("error", e => dlog("window.error", e.message))
    window.addEventListener("unhandledrejection", e => dlog("unhandledrejection", String(e.reason)))
    dlog("ua", navigator.userAgent)
}
