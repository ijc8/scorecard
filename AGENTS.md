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

There is **no test suite and no lint script** (ESLint is in `devDependencies` but not wired up).
Verify changes by building and by playing a card in a browser.

Fastest dev loop: `npm run dev`, then drag a `.wasm` from `examples/` onto the page. Scan, Create
and drag-and-drop all go through the same `loadBinary` path. To make a card URL from a `.wasm`,
base43-encode it (`base43.py`) into `?c=…`.

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

The player also accepts the legacy names (`process`/`setup`/`title`/`memory`) for old cards. Keep
that fallback in `extractTitle` (`src/App.tsx`) and in `public/worklet.js`.

## Architecture

- `src/App.tsx`: the UI (Listen / Deck / Scan / Create / About tabs) and most app logic.
  1. URL load, the Deck tab, QR scan, drag-and-drop and Create-tab assembly all call `loadBinary(Uint8Array)`.
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
  using `zxing-wasm`, loaded lazily. It was picked with `scripts/scanbench` because score cards are
  very dense codes; rerun that benchmark before changing decoders.
- `src/wasmTracer.ts`: the bullseye toggle reassembles the binary with a `scorecard.log(i32)`
  import at basic-block boundaries; the worklet posts counts back and the Listen tab draws a
  heatmap over a bit-grid of the binary.
- `wabt/` is vendored and loaded lazily through `src/lazyWabt.ts` (it's large). Use `getWabt()`
  rather than importing it directly.
- `vite.config.ts` sets `base: "./"`, which the `ijc8.me/s` subpath deployment depends on.

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

## Deck and starter pack

The Deck tab lists the user's collected cards (`src/deck.ts`, kept in localStorage under
`scorecard-deck`, keyed by each card's base43 code, with any saved seeds) above a built-in starter
pack. Cards are collected when scanned or opened from a link, or by hand with the heart on Listen;
drag-and-drop and Create don't collect, so work-in-progress builds stay out.

`examples/library/*.c` are the starter pack. `examples/library/build.sh`
builds them all and runs `index.py`, which writes `src/library.json` (title, description, size and
base43 code per card); the web build only reads that JSON, so it doesn't need Emscripten. The JSON
is committed: rerun `build.sh` after touching a library card or `deck.h`. Each card's first line is
a `//` comment that becomes its description in the tab.

## Conventions

- `*.wasm` and `*.bin` are gitignored, but some example `.wasm` files are committed on purpose.
  Don't delete them reflexively, and don't `git add -f` fresh build output without thought.
- When changing examples or the strip pipeline, check the resulting `.wasm` size.
- Short export names (`p`/`s`/`d`/`m`) exist to save bytes in the export section, not for looks.
- Commit messages: short one-line subjects, matching the existing history.
