# AGENTS.md

Guidance for coding agents (and humans) working in this repository.

## What this is

ScoreCard is a player for "score cards": QR codes containing tiny generative music programs. Each
QR code holds a URL to the player plus an entire audio-generating WebAssembly binary, so a card is
self-contained and still plays if the linked player goes away. The hard limit is ~2,953 bytes per
QR (≈2,900 after URL encoding), so byte count matters everywhere: in the examples, in the
`strip.sh` post-build pass, and in the export names. Deployed at https://ijc8.me/s.

## Commands

Web app (Vite + React + TypeScript):
- `npm run dev`: dev server.
- `npm run build`: typecheck (`tsc`), then `vite build`.
- `npm run preview`: serve the production build.

- `npm run lint`: ESLint over `src/`.

There is **no test suite**. Verify changes by building and by playing a card in a browser.

Fastest dev loop: `npm run dev`, then drag a `.wasm` from `examples/` onto the page (a picture of
a card works too). Scan, Create and drag-and-drop all go through the same `loadBinary` path. To
make a card URL from a `.wasm`, base43-encode it (`base43.py`) into `?c=…`.

C examples (`examples/`):
- `./build.sh foo.c`: emscripten (`-Oz`, no entry, only `_process` exported), then `strip.sh`.
- `./debug.sh foo.c`: native build (`foo.bin`) piped as raw f32 to `sox` for live playback (uses the
  non-Emscripten branch of `deck.h`).
- `./strip.sh foo.wasm`: binaryen (`wasm-dis`/`wasm-as`/`wasm-opt`) pass that drops
  Emscripten/Rust boilerplate exports and renames `process`→`p`, `setup`→`s`, `title`→`d`,
  `memory`→`m`. It prints before/after byte counts; keep that. **Anything that produces a card
  must end with this rename pass** (or emit the short names directly).
- `./print.sh foo.c`: build, then `print.py` (BLE thermal-printer pipeline, many external deps).

Other languages (`assemblyscript/`, `faust/`, `rust/`, `zig/`) each have their own build files and
must produce the same exports.

Root-level `print.py`, `convert-score.py` (In C score importer) and `base43.py` (Python port of the
encoder) are standalone scripts, not part of the web build.

## Score card ABI (don't break it)

A scorecard `.wasm` exports:
- `p`: `() -> f32`, called once per sample at 44.1 kHz. **Required.**
- `s`: `(i32) -> ()`, optional setup taking a seed.
- `d`: optional `i32` global pointing to a zero-terminated UTF-8 title. If present, memory must be
  exported as `m`.

**Guard against stuck cards** (gas metering, on unless the URL has `?noguard`; without it, on iOS,
one card stuck in `p` leaves the page without audio): the worklet rewrites every card it runs
(`meterWat` in `src/wasmTracer.ts`, through the same second worklet module as tracing). Each
function counts its passes through loops in a local, and every 64th takes 64 from an exported
global, `gas`, which the worklet tops up before each block and before setup; a card that runs out
traps and is stopped (`{failed}`). The card's output must not change: `npx tsx scripts/gas-check.ts
<cards>.wasm` checks that and measures the cost. A card the rewriter can't handle plays unguarded.
If a card hangs the audio thread anyway (guard off), `audio.ts` pings the worklet when the clock
freezes: no answer twice at the same place means the card is stuck, and it isn't loaded again.

The player also accepts the legacy names (`process`/`setup`/`title`/`memory`) for old cards. Keep
that fallback in `extractTitle` (`src/card.ts`) and in `public/worklet.js`.

## Architecture

- `src/App.tsx`: the player's state and logic, and the frame around the tabs. Each tab is its own
  module (`Listen.tsx`, `Scan.tsx`, `Create.tsx`, `About.tsx`; indices in `tabs.ts`). `card.ts` has
  what belongs to cards themselves (links, seeds, titles); `trace.ts` holds the tracing state that
  `App` and `Listen` share.
  1. URL load, QR scan, drag-and-drop and Create-tab assembly all call `loadBinary(Uint8Array)`.
  2. The binary goes to the AudioWorklet (`public/worklet.js`), which instantiates it and calls
     `p` per sample. **Send the binary, not a `WebAssembly.Module`**: posting a Module breaks on
     iOS Safari.
  3. The binary is base43-encoded back into the URL (`?c=…`, plus `s=…` for a locked seed) and
     rendered as a QR (`qrcode` lib); `history.pushState` keeps the address bar in sync, so the
     page itself is the shareable card.
  4. The title is read by instantiating the module a second time on the main thread.
- `src/audio.ts`: owns the AudioContext and worklet node, and keeps playback working on iOS.
  Read `docs/IOS-PLAYBACK.md` before touching it. In short: `startAudio()` must run synchronously
  inside the Play gesture (and from `mousedown`, not `touchstart`, when audio needs (re)starting);
  a context that was interrupted or whose clock is frozen is replaced, not resumed; a watchdog
  pauses the player if the clock stalls. Don't call `resume()` while the state is `"interrupted"`.
- `src/base43Encoder.ts` (mirrored by `base43.py`): base43 over the QR alphanumeric set minus `%`
  and space, so the binary shares the QR's dense alphanumeric mode with the URL and stays valid in
  a query string.
- `src/qrReader.ts`: QR decoding for the Scan tab (live camera frames, photos, dropped images)
  using `zxing-wasm`, loaded lazily. Score cards are very dense codes, and it reads them far better
  than the pure-JS decoders. `Scan.tsx` decodes the whole camera frame at full resolution, not just
  what the viewfinder shows.
- `src/wasmTracer.ts`: tracing reassembles the binary with a `scorecard.log(i32)` import at
  basic-block boundaries, and with every load/store address passed through
  `scorecard.read`/`scorecard.write`. This happens in the worklet, on the card it's about to play: the tracer
  is a second worklet module (`src/instrument.worklet.ts`, bundled with watr and wasmparser,
  ~150 KB), added by `needTracer` in `audio.ts` when tracing or the guard is first wanted; `workletPolyfill.ts`
  gives that scope the TextEncoder/TextDecoder it lacks. The worklet tells the page which card it
  instrumented (`{traced: {binary, map}}`), then posts block counts and touched memory back, and
  the Listen tab draws a heatmap over a bit-grid of the binary: green for code that runs, blue/red
  for data (and globals) read and written, with a band underneath for the rest of memory the card
  has touched. Globals aren't watched themselves: a global is read (or written) as much as the
  code that does so runs (`findGlobalUses`, `globalHeat`).
- Touched memory comes from the worklet as runs (`[start, length, ...]`), and
  `src/memoryTrace.ts` keeps them as runs: a card with a delay line touches tens of thousands of
  bytes an update, and there are 43 updates a second. `npx tsx scripts/memory-trace-check.ts
  <cards>.wasm` runs the real worklet and says what each update costs the page. A traced card
  runs several times slower (it calls out of WebAssembly at every block and memory access).
- Turning tracing on or off doesn't restart the card. The page fetches the tracer before loading
  any card, so every card the worklet runs is a rewriting (traced, metered, or neither:
  `plainWat`) that exports its memory and mutable globals as `scorecard.memory` and
  `scorecard.globalN`. `{cmd: "instrument"}` makes the worklet build the other rewriting, copy that
  state across and play on (`carryOver` in `public/worklet.js`). If the tracer couldn't be
  fetched, it falls back to starting again with the same seed and skipping to where it was.
  `npx tsx scripts/carry-check.ts <cards>.wasm` checks that a carried-over card plays on
  sample-for-sample the same.
- WebAssembly text is assembled by `watr` (`src/assemble.ts`, ~50 KB, loaded when first needed)
  and disassembled by `wasmparser`. After touching the tracer or the disassembly, run
  `npx tsx scripts/watr-check.ts <cards>.wasm`: reassembled and instrumented cards must play
  sample-for-sample the same.
- `vite.config.ts` sets `base: "./"`, which the `ijc8.me/s` subpath deployment depends on.

Skipping and seeking happen in the worklet, and a card can only get anywhere by being run: `skip`
makes samples unheard (at up to 64 times real time, a bounded amount per render quantum),
fast-forward (`speed`) alternates a 60 ms snatch of the card with a silent jump, and going back is a
`reset` with the same seed and a `skip` to the time wanted. The forward button is tap to skip 10 s,
hold to fast-forward; tapping the clock takes a time to go to. Before the first Play the context
is suspended, so the worklet can't skip or report its position yet: the page shows the time the
card will be at (`showPending` in `Listen.tsx`), and the worklet catches up when Play starts it.

Transport buttons handle `touchstart` and `mousedown` separately (with de-duplication) so play and
reset respond instantly: cards are meant to be started in sync or played rhythmically. Don't
"simplify" this without testing on iOS.

## Debugging audio, especially on iOS

- Add `?debug` to the URL for an overlay with AudioContext state, `currentTime`, whether the clock
  is advancing, worklet position and recent events (`src/debug.ts`). Under `npm run dev` the lines
  are also POSTed to the dev server and appended to `$SCORECARD_DEBUGLOG` (default
  `debuglog.txt`), so you can read a phone's log from the dev machine.
- `$SCORECARD_CARDS=<dir>` makes the dev server redirect `/<letter>` to `?debug&c=<contents of
  <dir>/<letter>.b43>`: short URLs for typing on a phone.
- AudioWorklet needs a secure context, so serve the dev server over https when testing on a
  device.
- `scripts/ipad.py` drives Safari on a USB-connected iPad through Web Inspector (pymobiledevice3;
  enable Settings → Apps → Safari → Advanced → Web Inspector): list tabs, navigate, and evaluate
  JS with an emulated user gesture. Real taps (and Siri, lock, etc.) still need a person.

## Examples

`examples/deck.h` is a small C helper layer: oscillators, envelopes, `m2f` (pitch→frequency by
repeated multiplication, to avoid pulling in `powf`), and a coroutine-style `sleep` macro pair. Its
two `__EMSCRIPTEN__` branches let the same source build as a card or as a native binary for `sox`.

## Conventions

- `*.wasm` and `*.bin` are gitignored, but some example `.wasm` files are committed on purpose.
  Don't delete them reflexively, and don't `git add -f` fresh build output without thought.
- When changing examples or the strip pipeline, check the resulting `.wasm` size.
- Short export names (`p`/`s`/`d`/`m`) exist to save bytes in the export section, not for looks.
- Commit messages: short one-line subjects, matching the existing history.
