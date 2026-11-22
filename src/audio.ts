// Audio engine: owns the AudioContext and the worklet node, and keeps them alive on iOS.
//
// Root cause of "Play is silent on iOS" (see docs/IOS-PLAYBACK.md): after an audio interruption
// (Siri, a call, another app's audio, ...) WebKit can leave the AudioContext as a zombie that
// reports state "running" after resume() while its clock (currentTime) never advances again
// (https://bugs.webkit.org/show_bug.cgi?id=263627). suspend()/resume() doesn't reliably revive it,
// but a brand-new AudioContext created inside a user gesture works. So:
//
// - `startAudio()` must be called synchronously from the Play gesture handler. If the current
//   context isn't verifiably producing audio (running AND clock advancing) and it has been
//   interrupted, or claims to run while frozen, it is replaced by a fresh context (new worklet
//   node, same binary and seed), and resumed inside the gesture.
// - A watchdog checks the clock while the user wants sound. If it stays frozen (outside an
//   interruption, which iOS ends by itself), playback is paused and `onStall` listeners are told, so
//   the player shows "paused" instead of failing silently; the next Play then rebuilds the context.

import { DEBUG, dlog } from "./debug"

type Listener = () => void

let ctx: AudioContext
let nodePromise: Promise<AudioWorkletNode>
// Saw "interrupted", a failed resume, or a stall since this context was created.
let wasInterrupted = false
// Last loadModule message, re-sent to each new worklet node.
let moduleMessage: any = null
let wantPlaying = false
let seed = 0
let volume = 1
// For cards that take sound in: whether the loaded card does, and the microphone while it's in use.
let inputWanted = false
let echoCancellation = true
let micStream: MediaStream | null = null
let micRequest = 0
let micSource: MediaStreamAudioSourceNode | null = null
let inputPeak = 0
let lastPos = 0
let onWorkletMessage: (e: MessageEvent) => void = () => {}
// Last sample of the audio clock, taken by the watchdog.
let sample = { at: 0, ct: 0, advancing: false }
let frozenSince: number | null = null
const stallListeners = new Set<Listener>()

function createContext() {
    const old = ctx
    if (old) {
        old.onstatechange = null
        old.close().catch(() => {})
    }
    const c = new AudioContext({ sampleRate: 44100 })
    ctx = c
    wasInterrupted = false
    frozenSince = null
    sample = { at: performance.now(), ct: c.currentTime, advancing: false }
    dlog("createContext", c.state, old ? "(replacing " + old.state + ")" : "")
    c.onstatechange = () => {
        dlog("statechange", c.state)
        if (c.state === "interrupted") {
            wasInterrupted = true
        } else if (c.state === "suspended" && wantPlaying && wasInterrupted) {
            // Interruption ended; try to pick up again without a gesture (allowed on iOS once the
            // page has played). The watchdog asks for a tap if this doesn't really work.
            tryResume()
        }
    }
    nodePromise = c.audioWorklet.addModule("worklet.js").then(() => {
        const node = new AudioWorkletNode(c, "custom-processor")
        node.connect(c.destination)
        node.port.onmessage = e => {
            if (typeof e.data === "number") lastPos = e.data
            if (e.data?.inputPeak !== undefined) {
                inputPeak = e.data.inputPeak
                return
            }
            onWorkletMessage(e)
        }
        // Bring a replacement node to where the old one was: same binary, same seed.
        node.port.postMessage({ cmd: "volume", value: volume })
        if (moduleMessage) node.port.postMessage(moduleMessage)
        if (moduleMessage && wantPlaying) node.port.postMessage({ cmd: "play", seed })
        return node
    })
    // A microphone that was feeding the old context has to be plugged into the new one.
    micSource = null
    attachMic()
}

function attachMic() {
    const stream = micStream, c = ctx, p = nodePromise
    if (!stream) return
    p.then(node => {
        if (p !== nodePromise || stream !== micStream) return
        micSource?.disconnect()
        micSource = c.createMediaStreamSource(stream)
        micSource.connect(node)
    })
}

function releaseMic() {
    micRequest++ // (so that a request still in flight is dropped when it arrives)
    micSource?.disconnect()
    micSource = null
    micStream?.getTracks().forEach(track => track.stop())
    micStream = null
    inputPeak = 0
}

// The microphone is only held while a card that listens is playing.
function acquireMic() {
    if (micStream || !navigator.mediaDevices?.getUserMedia) return
    const request = ++micRequest
    // Echo cancellation keeps the card from hearing itself through the speaker (and howling). The
    // other "call" processing would only get in the way of sound that isn't speech.
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation, noiseSuppression: false, autoGainControl: false } }).then(stream => {
        if (request !== micRequest) return stream.getTracks().forEach(track => track.stop())
        micStream = stream
        attachMic()
    }).catch(e => dlog("microphone unavailable", String(e)))
}

// Tell the engine whether the loaded card takes sound in.
export function setInputWanted(wanted: boolean) {
    inputWanted = wanted
    if (!wanted) releaseMic()
    else if (wantPlaying) acquireMic()
}

export function setEchoCancellation(on: boolean) {
    if (on === echoCancellation) return
    echoCancellation = on
    if (micStream) {
        releaseMic()
        acquireMic()
    }
}

function tryResume() {
    ctx.resume().catch(e => {
        wasInterrupted = true
        dlog("resume failed", String(e))
    })
}

// Is the audio clock moving right now? (Synchronous, so it can be used inside a gesture handler.)
function clockAdvancing() {
    const now = performance.now()
    const ct = ctx.currentTime
    // currentTime advances every render quantum (~3ms); if the last sample is old enough, compare
    // against it directly, otherwise trust the watchdog's last verdict.
    if (now - sample.at > 50) return ct > sample.ct
    return sample.advancing
}

export function audioHealthy() {
    return ctx.state === "running" && clockAdvancing()
}

// For iOS: play Web Audio through the "playback" session, i.e. ignore the ringer/mute switch.
// `navigator.audioSession` (Safari 16.4+) is the official way to do this. The silent looping <audio>
// tag is the older hack for the same thing (Web Audio is treated like a ringer, media tags aren't):
// https://stackoverflow.com/questions/21122418/ios-webaudio-only-works-on-headphones/46839941#46839941
// TODO: Once iOS < 16.4 no longer matters, try dropping the tag (test the mute switch on an iPhone,
// and that playback continues in the background / with the screen locked).
function iOS() {
    return ['iPad Simulator', 'iPhone Simulator', 'iPod Simulator', 'iPad', 'iPhone', 'iPod'].includes(navigator.platform)
        // iPad on iOS 13+ reports itself as a Mac
        || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
}
let unmuteTag: HTMLAudioElement | null = null
function unmute() {
    const session = (navigator as any).audioSession
    // (Listening as well as playing needs the other kind of session.)
    const type = inputWanted ? "play-and-record" : "playback"
    if (session && session.type !== type) session.type = type
    if (!iOS()) return
    if (!unmuteTag) {
        unmuteTag = document.createElement("audio")
        unmuteTag.controls = false
        unmuteTag.preload = "auto"
        unmuteTag.loop = true
        unmuteTag.src = "data:audio/mp3;base64,//MkxAAHiAICWABElBeKPL/RANb2w+yiT1g/gTok//lP/W/l3h8QO/OCdCqCW2Cw//MkxAQHkAIWUAhEmAQXWUOFW2dxPu//9mr60ElY5sseQ+xxesmHKtZr7bsqqX2L//MkxAgFwAYiQAhEAC2hq22d3///9FTV6tA36JdgBJoOGgc+7qvqej5Zu7/7uI9l//MkxBQHAAYi8AhEAO193vt9KGOq+6qcT7hhfN5FTInmwk8RkqKImTM55pRQHQSq//MkxBsGkgoIAABHhTACIJLf99nVI///yuW1uBqWfEu7CgNPWGpUadBmZ////4sL//MkxCMHMAH9iABEmAsKioqKigsLCwtVTEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVV//MkxCkECAUYCAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV"
    }
    unmuteTag.play().catch(e => dlog("unmute tag play failed", String(e)))
}

// Call synchronously from the user gesture that starts playback.
export function startAudio() {
    unmute()
    if (audioHealthy()) return
    const zombie = ctx.state === "running" // running but the clock is frozen
    dlog("startAudio", ctx.state, "interrupted=" + wasInterrupted, "zombie=" + zombie)
    if (wasInterrupted || zombie || ctx.state === "closed") createContext()
    tryResume()
}

export function sendToWorklet(message: any) {
    if (message.cmd === "loadModule") moduleMessage = message
    else if (message.cmd === "reset" || message.cmd === "play") seed = message.seed
    else if (message.cmd === "volume") volume = message.value
    if (message.cmd === "play") {
        wantPlaying = true
        frozenSince = null
        if (inputWanted) acquireMic()
    } else if (message.cmd === "pause") {
        wantPlaying = false
        releaseMic()
    }
    const p = nodePromise
    p.then(node => {
        // A message for a node that has since been replaced is covered by the replay in createContext.
        if (p === nodePromise) node.port.postMessage(message)
    })
}

export function setWorkletMessageHandler(handler: (e: MessageEvent) => void) {
    onWorkletMessage = handler
}

// Called when playback was paused because the audio clock stalled.
export function onStall(listener: Listener) {
    stallListeners.add(listener)
    return () => { stallListeners.delete(listener) }
}

export function audioDebugSnapshot() {
    return {
        state: ctx.state, currentTime: ctx.currentTime, advancing: sample.advancing, workletPos: lastPos,
        wantPlaying, wasInterrupted, session: (navigator as any).audioSession?.type,
        mic: micStream ? `live (peak ${inputPeak.toFixed(3)})` : inputWanted ? "wanted" : "none",
        unmuteTag: unmuteTag ? (unmuteTag.paused ? "paused" : "playing") : "none",
    }
}

// Watchdog: sample the clock. If the user wants sound and the clock has been frozen for a second
// (resume/recreate need a user gesture on iOS), pause, so the next Play tap can rebuild the context.
setInterval(() => {
    const now = performance.now()
    const ct = ctx.currentTime
    sample = { at: now, ct, advancing: ct > sample.ct }
    // Not counted: while hidden, and while "interrupted" (e.g. Siri is up): iOS resumes by itself
    // when the interruption ends, however long it lasted.
    if (!wantPlaying || sample.advancing || document.visibilityState !== "visible" || ctx.state === "interrupted") {
        frozenSince = null
    } else if (frozenSince === null) {
        frozenSince = now
    } else if (now - frozenSince > 1000) {
        dlog("stalled", ctx.state)
        wasInterrupted = true // don't trust this context again: the next Play rebuilds it
        // Also stop the worklet, in case the context comes back by itself while we show "paused".
        sendToWorklet({ cmd: "pause" })
        stallListeners.forEach(l => l())
    }
}, 100)

createContext()

// For on-device testing (`?debug`): poke the current context from Web Inspector.
if (DEBUG) (window as any).__audio = { get ctx() { return ctx } }
