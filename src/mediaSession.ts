// Lock-screen (and headphone, and notification) controls, through the Media Session API: the card's
// title and QR code, play and pause, skip ahead, and the next or previous card in the deck.
import { useEffect, useRef } from "react"
import { iOS } from "./audio"
import { dlog } from "./debug"

export interface MediaControls {
    play: () => void
    pause: () => void
    skip: () => void
    next: () => void
    previous: () => void
}

// Browsers other than Safari only show these controls while a media element is playing (Web Audio
// alone doesn't count), and only for one longer than a few seconds. So while a card plays, so does
// this: ten seconds of silence, on a loop. (On iOS, audio.ts's own silent element does the job.)
let keepAlive: HTMLAudioElement | null = null
function silence(seconds: number) {
    const rate = 8000, n = rate * seconds
    const wav = new DataView(new ArrayBuffer(44 + n))
    const text = (at: number, s: string) => [...s].forEach((c, i) => wav.setUint8(at + i, c.charCodeAt(0)))
    text(0, "RIFF"); wav.setUint32(4, 36 + n, true); text(8, "WAVEfmt ")
    wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true)
    wav.setUint32(24, rate, true); wav.setUint32(28, rate, true); wav.setUint16(32, 1, true); wav.setUint16(34, 8, true)
    text(36, "data"); wav.setUint32(40, n, true)
    for (let i = 0; i < n; i++) wav.setUint8(44 + i, 128)
    return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }))
}

// Call synchronously from the gesture that starts playback (as with startAudio).
export function holdMediaSession(playing: boolean) {
    if (!("mediaSession" in navigator) || iOS()) return
    if (playing) {
        if (!keepAlive) {
            const audio = keepAlive = Object.assign(document.createElement("audio"), { src: silence(10), loop: true })
            // (These don't show on a Pixel 9 as of 11-24, and it isn't known why: say what the element does, for ?debug.)
            for (const event of ["playing", "pause", "error", "stalled", "suspend"]) {
                audio.addEventListener(event, () => dlog("media element", event, audio.error?.message ?? "", `t=${audio.currentTime.toFixed(1)}`))
            }
        }
        keepAlive.play().then(() => dlog("media element play() ok"), e => dlog("media element play() refused", e?.name))
    } else {
        keepAlive?.pause()
    }
}

export function useMediaSession(title: string, playing: boolean, artwork: HTMLCanvasElement | null, binary: Uint8Array | null, controls: MediaControls) {
    const latest = useRef(controls)
    latest.current = controls
    useEffect(() => {
        if (!("mediaSession" in navigator)) return
        const handlers: [MediaSessionAction, () => void][] = [
            ["play", () => latest.current.play()],
            ["pause", () => latest.current.pause()],
            ["stop", () => latest.current.pause()],
            ["seekforward", () => latest.current.skip()],
            ["nexttrack", () => latest.current.next()],
            ["previoustrack", () => latest.current.previous()],
        ]
        for (const [action, handler] of handlers) {
            try {
                navigator.mediaSession.setActionHandler(action, handler)
            } catch {
                // (Not every browser knows every action.)
            }
        }
    }, [])
    useEffect(() => {
        if (!("mediaSession" in navigator) || !binary) return
        // The QR code is drawn a little after the card loads.
        const timer = setTimeout(() => {
            navigator.mediaSession.metadata = new MediaMetadata({
                title, artist: `ScoreCard · ${binary.length} bytes`,
                artwork: artwork && artwork.width > 1 ? [{ src: artwork.toDataURL(), sizes: `${artwork.width}x${artwork.height}`, type: "image/png" }] : [],
            })
        }, 100)
        return () => clearTimeout(timer)
    }, [title, binary])
    useEffect(() => {
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused"
    }, [playing])
}
