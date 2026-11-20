# iOS playback: silent Play

Status (2026-11-19): root cause reproduced on the iPad (iPad11,3, iOS 26.7.3, Safari), fix
implemented and verified on the device across the scenarios below.

## Root cause

After an audio interruption (reproduced with Siri; calls, alarms, other apps' audio work the same
way) WebKit can leave the AudioContext as a **zombie**: `state` reports `"running"` after
`resume()`, but `currentTime` never advances again, so the worklet's `process()` is never called.
This is WebKit bug [263627](https://bugs.webkit.org/show_bug.cgi?id=263627).

Observed on iPad11,3 (iOS 26.7.3), old code, `?debug` log:

```
15.33 setState playing suspended 0
15.50 statechange running
23.47 statechange interrupted        <- Siri
23.86 statechange running            <- auto-resume from onstatechange (no gesture)
23.88 statechange suspended
23.99 statechange running
27.67 statechange interrupted
27.67 statechange suspended
27.70 unhandledrejection InvalidStateError: Failed to start the audio device
50.84 setState paused   suspended 11.2588
53.63 setState playing  suspended 11.2588
53.68 statechange running
... state "running", currentTime stuck at 11.2588 forever: Pause/Play can't revive it
```

Why the existing workarounds missed it:
- `maybeRestartContext()` (suspend + resume if the clock is frozen) only ran when the state was
  already `"running"` when Play was pressed. Here it was `"suspended"`, so Play called plain
  `resume()`, which "succeeded" into the zombie.
- The `onstatechange` handler called `resume()` outside a gesture on every suspend/interrupt,
  including mid-interruption, which produced the "Failed to start the audio device" rejection.
- Nothing ever checked that sound was actually flowing after Play, so the failure was silent; a
  reload (= a new AudioContext) was the only fix users had.

A **new** AudioContext created while the old one was a zombie ran fine (clock advancing), so
recreating the context is the fix, not more suspend/resume.

### Second bug: stuck at 0:00 right after load (opening a card from the Camera app)

When a card is opened by scanning its QR with the Camera app, the page's AudioContext goes to
`"interrupted"` ~0.3 s after load, before any tap. The old touchstart handler only deferred to
mousedown in the `"suspended"` state, so in `"interrupted"` it called `resume()` from touchstart,
which iOS doesn't count as a gesture. The icon switched to pause, the clock stayed at 0:00, no
sound; Pause+Play fixed it. Reproduced on the iPad with the old code (current `main`) via a real
Camera scan.

Not a cause, checked on the device:
- First Play after a normal load (context `"suspended"`): fine (touchstart defers to mousedown).
- Backgrounding (Home button) and screen lock while playing: audio continues; fine on return.

## What changed

- `src/audio.ts` (new) owns the AudioContext + worklet node:
  - `startAudio()` runs synchronously in the Play gesture. If the context isn't verifiably
    producing audio (running **and** clock advancing) and it was interrupted, or claims to run
    while frozen, it's replaced with a fresh context and worklet node. The same binary and seed are
    replayed into it (the piece restarts from the top). It's resumed inside the gesture.
  - Watchdog (100 ms): while the user wants sound and the page is visible, if the clock is frozen
    for over 1 s, the player switches to **paused** (and the worklet is paused too, in case the
    context comes back by itself), and the context is marked untrusted, so the next Play rebuilds
    it. No more silent "playing". Time spent `"interrupted"` doesn't count: iOS resumes by itself
    when the interruption ends (e.g. Siri), however long it lasted.
  - No `resume()` while `"interrupted"`; one attempt when the interruption ends (state goes to
    `"suspended"`).
  - Sets `navigator.audioSession.type = "playback"` (Safari 16.4+), keeps the silent-mp3 unmute
    hack as a fallback (with a TODO on when it could go).
- `src/App.tsx`: uses the engine; the touchstart→mousedown deferral now applies whenever Play
  needs to (re)start audio (`!audioHealthy()`), not just in the `"suspended"` state (the old code
  started audio from touchstart when `"interrupted"`, which iOS doesn't count as a gesture).
- `?debug` overlay (`src/debug.ts`): state, currentTime, advancing, worklet position, events. In
  `npm run dev` the lines are also POSTed to `/__debuglog` (written to `$SCORECARD_DEBUGLOG`).
- `vite.config.ts`: that dev-only log sink, plus short links `/<letter>` → `?debug&c=<card>` from
  `$SCORECARD_CARDS/<letter>.b43` (for typing URLs on a tablet).
- `scripts/ipad.py`: drive Safari on a USB-attached iPad through Web Inspector (pymobiledevice3;
  needs Settings → Apps → Safari → Advanced → Web Inspector). `tabs`, `nav`, `eval` (with
  `emulateUserGesture`). Run with pymobiledevice3's Python.

## Test matrix

Real finger taps on the iPad unless noted; state read from the `?debug` log.

| Scenario | Old code | New code |
|---|---|---|
| iPad: first Play after load | ok | ok |
| iPad: Home button while playing, return | ok (keeps playing) | ok (keeps playing) |
| iPad: screen lock while playing, unlock | ok (keeps playing) | ok (keeps playing) |
| iPad: Siri while playing | **silent; Pause/Play didn't help** (1 of 1) | comes back by itself (4 of 4) |
| iPad: Siri + old-style resume-during-interruption injected (forces the stuck state) | — | stuck as expected; an earlier tap-to-recover build: **tap → sound back** |
| same, recovering with Pause/Play | — | Play rebuilt the context → **sound back** |
| iPad: open card via Camera-app QR scan, tap Play | **stuck at 0:00, silent**; Pause+Play fixed it | plays on first tap (context was `"interrupted"` at load; Play rebuilt it) |
| Forced stall (`ctx.suspend()` behind the app's back), headless Firefox / WebKit / Chromium | — | flips to paused within ~1 s; Play rebuilds and plays |
| iPad: card switch while playing (Create → Assemble, driven via inspector) | — | ok, keeps playing the new instance |
| Desktop Chromium (Electron 156): click Play | ok | ok |
| Desktop Firefox (Playwright, headless) | — | ok (running, clock advancing) |
| Linux WebKit (Playwright, headless) | — | ok |
| `npm run build` | — | ok |

Note: on the new code, Siri alone never produced the stuck state in 4 tries. The one failure on the
old code followed its `onstatechange` handler calling `resume()` mid-interruption. Not calling resume
while interrupted is probably most of the fix; recreate-on-Play and pause-on-stall are the safety net,
verified by injecting the old behavior.

## Still unverified

- iPhone (mute switch / ringer routing): no iPhone available. `audioSession.type = "playback"` plus
  the silent-mp3 tag should cover it.
- Other interruption sources (phone call, alarm, another app's audio) and long idle (hours); only
  Siri was tested.
- Older iOS versions (no `navigator.audioSession` before Safari 16.4; the mp3 hack is still there).
- After a recreate the piece restarts from 0. The worklet could fast-forward to the old position
  (call `p()` N times) if that matters.

Testing on a device:

```
SCRATCH=<dir with m.b43/o.b43 card files>
SCORECARD_CARDS=$SCRATCH SCORECARD_DEBUGLOG=$SCRATCH/debuglog.txt npx vite --host 127.0.0.1 --port 5190 --strictPort
tailscale serve --bg --https=8455 http://127.0.0.1:5190   # any https proxy works; AudioWorklet needs a secure context
python scripts/ipad.py nav <tab-url-substring> https://<host>.ts.net:8455/m
```
