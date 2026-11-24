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

Fastest dev loop: `npm run dev`, then drag a `.wasm` from `examples/` onto the page. Scan, Create
and drag-and-drop all go through the same `loadBinary` path. To make a card URL from a `.wasm`,
base43-encode it (`base43.py`) and put it after a `#`.

C examples (`examples/`):
- `./build.sh foo.c`: emscripten (`-Oz`, no entry, only `_process` exported), then `strip.sh`.
  Without a local Emscripten, the official container works (binaryen is in `/emsdk/upstream/bin`):
  `podman run --rm -v $PWD/examples:/src:Z -w /src docker.io/emscripten/emsdk:7.0.1 sh -c
  'PATH=/emsdk/upstream/bin:$PATH ./build.sh foo.c'`. Different Emscripten versions give sizes a few
  dozen bytes apart, which matters for cards near the limit.
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
encoder) are standalone scripts, not part of the web build. So are two converters that write a card's C source: `scripts/song2card.py` transcribes a recording
(tempo grid, lead and bass lines, typical drum patterns), and `scripts/als2card.py` converts the
MIDI arrangement of an Ableton Live set exactly (drums, being audio loops, are described by hand).
`examples/return-true.c` is the latter's output for one song, at 2,862 bytes: it only just fits,
so check the size after changing `deck.h` or the converter's player code.

## Score card ABI (don't break it)

A scorecard `.wasm` exports:
- `p`: `() -> f32`, called once per sample at 44.1 kHz. **Required.** It may instead be
  `(f32) -> f32`, which makes the card an effect: the argument is a sample from the microphone
  (in C: `#define INPUT` before including `deck.h`). The player tells the two apart by the
  exported function's `length`, and only asks for the microphone for cards that take input,
  while they're playing (`setInputWanted` in `src/audio.ts`).
- `s`: `(i32) -> ()`, optional setup taking a seed.
- `d`: optional `i32` global pointing to a zero-terminated UTF-8 title. If present, memory must be
  exported as `m`.

- **Experimental** (11-24): `s` may return an `i32`. If it's non-zero, it's an address in `m` where
  the card has written another card (a 32-bit little-endian length, then that many bytes of
  WebAssembly), which is set up and played in its place; that card's `s` may do the same, without
  limit. Nothing carries over but the seed and whatever the generator wrote into the new card, and
  it happens afresh at each setup. A card that does this needn't have `p`. The title is that of the
  last card along the way that has a `d`, found with seed 0 so that it doesn't vary. `src/generate.ts`
  (run in a worker, which is abandoned if a card takes over 3 s: the only guard against a card that
  never settles) and `public/worklet.js` implement it; the trace view and the Wasm source shown are
  the generated card's, the size and QR code the generator's. `scripts/pack-card.mjs` uses it to
  pack a card smaller: a ~450-byte unpacker (context-mixing arithmetic decoder, in WebAssembly text
  in that script) plus the packed card. Not settled: whether this stays, and generating during play.

The player also accepts the legacy names (`process`/`setup`/`title`/`memory`) for old cards. Keep
that fallback in `src/generate.ts` and in `public/worklet.js`.

## Architecture

- `src/App.tsx`: the app's state and the Listen tab. The other pieces of the UI (Listen / Scan /
  Create / Settings / About tabs, shown as icons, plus the deck) live in `Scan.tsx`, `SourceFace.tsx`,
  `Settings.tsx` and `Deck.tsx`; `card.ts` has what concerns cards themselves (links, size limit,
  titles, faces).
  1. URL load, the deck, QR scan, drag-and-drop and builds from the source face all call `loadBinary(Uint8Array)`.
  2. The binary goes to the AudioWorklet (`public/worklet.js`), which instantiates it and calls
     `p` per sample. **Send the binary, not a `WebAssembly.Module`**: posting a Module breaks on
     iOS Safari.
  3. The binary is base43-encoded back into the URL and rendered as a QR (`qrcode` lib). The link
     is `SCHEME://HOST/path#[seed]program`: scheme and host in capitals so they share QR's
     alphanumeric mode, and the program after `#` so it isn't sent to the server. A locked seed is
     six base43 digits in front (offset so it never starts with `0`, which every program does).
     The older `?c=program&s=seed` links, as on printed cards, must keep working (`parseCardURL`); `history.pushState` keeps the address bar in sync, so the
     page itself is the shareable card.
  4. The title is read by instantiating the module a second time on the main thread.
- `src/audio.ts`: owns the AudioContext and worklet node, and keeps playback working on iOS.
  Read `docs/IOS-PLAYBACK.md` before touching it. In short: `startAudio()` must run synchronously
  inside the Play gesture (and from `mousedown`, not `touchstart`, when audio needs (re)starting);
  a context that was interrupted or whose clock is frozen is replaced, not resumed; a watchdog
  pauses the player if the clock stalls. Don't call `resume()` while the state is `"interrupted"`.
- Playback extras, in the worklet: `{cmd: "skip", samples}` makes samples silently, up to 64x
  real time per render quantum (even while paused); `{cmd: "speed", value}` makes `value` samples
  per output sample and averages them (fast-forward, heard sped up); `{cmd: "reset", seed, skip}`
  starts again and skips. The skip button (tap: 10 s, hold: 4x) and the clock (tap it to go to a
  time; going back restarts with the same seed) use these.
- `src/mediaSession.ts`: lock-screen controls. Non-iOS browsers only show them while a media
  element plays, so a silent looping `<audio>` plays alongside a card (`holdMediaSession`, called
  in the Play gesture); iOS has `audio.ts`'s own silent element.
- `src/print.ts`: a card drawn as printed (576 dots, black and white), saved or shared as a PNG,
  or sent to a Phomemo-style thermal printer over Web Serial (Bluetooth RFCOMM; the printer must be
  paired with the device). It waits for the printer's `1a 0f 0c` before closing the port: closing
  early stops the print. Only tried against a saved image so far, not a printer.
- Looks (Settings): the pile look (default, a prototype; `src/Pile.tsx`) makes the classic panel the
  top card of a pile: flick it aside for the next card in the deck, and Scan, Create, Settings and
  About are cards at the back of the pile whose index tabs stick out below. React only draws the top
  card; what moves, and what shows under a dragged card, are DOM copies of it. Tapping the table
  spreads the pile out (`src/Spread.tsx`): small copies of every card, the tabbed cards and sealed
  packs, which stands in for the deck drawer in this look. Turning tracing on there first plays the
  QR code being read into the card's bits (`src/decodeAnimation.ts`, from the module-by-module
  account in `src/qrDecode.ts`; `npx tsx scripts/qr-decode-check.ts <cards>.wasm` checks that
  account by reading the link back off the modules). The printed look
  (another prototype) draws the card as printed and puts
  every control on the player around it; the classic look is the earlier panel. The rolodex deck
  style (`src/Rolodex.tsx`) is the other prototype. Background in `docs/CARD-DESIGN.md`.
- `src/base43Encoder.ts` (mirrored by `base43.py`): base43 over the QR alphanumeric set minus `%`
  and space, so the binary shares the QR's dense alphanumeric mode with the URL and stays valid in
  a query string.
- The big card has three faces: its QR code, its bits (the trace view, via the bullseye) and its
  source (the Create tab, which shows the Listen tab's card turned over, so the transport stays
  put). `SourceFace` shows what the card was written in when that's known (`src/sources.ts`: the
  starter pack's sources ship with the app, and anything built here is remembered in localStorage
  under `scorecard-sources`) and the card's disassembly otherwise. There are four modes:
  - **C**, compiled by `src/compiler.ts` (below).
  - **Beat** (`src/bytebeat.ts`): one bytebeat expression in `t`, translated straight to
    WebAssembly text and assembled with watr. No compiler download; division by zero gives 0.
  - **Pattern** (`src/pattern.ts`): a subset of Tidal/Strudel mini-notation (sequences, `[ ]`,
    `< >`, `,`, `~`, `*n /n !n @n`; one `sound: pattern` line per layer). The pattern is evaluated
    in the editor for as many cycles as it takes to repeat, into a list of events. These are added
    as a data segment (plus the title export) to a prebuilt player, `examples/pattern-player.c`,
    which ships as `src/patternPlayer.ts` (rebuild with `examples/build-pattern-player.sh`). No
    compiler download. The player reads the pattern from a fixed address (`PATTERN`); keep that
    and the layout in step with `patternToCard`.
  - **Wasm**: the tracer's own disassembly (`disassembleWasm`), so that with tracing on, the lines
    that are running can be lit up (`showHeat`, drawn on a canvas behind the text). Pressing Play on the source face
  rebuilds the card first if the editor has changed. Syntax colours (`src/highlight.tsx`) come from a
  highlighted copy of the text drawn behind a transparent textarea, so the two must keep identical
  text and metrics; `startAudio()` is still called synchronously
  in that gesture, before the (asynchronous) build.
- `src/compiler.ts` / `src/compiler.worker.ts`: compiling C for the source face. A worker runs Clang and
  LLD (`@yowasp/clang`, ~100 MB of assets, ~27 MB gzipped, fetched on the first compile; the
  worker fetches it with `runLLVM` on its own first, because `clang` drops `fetchProgress`; a
  download with no progress for 30 s is abandoned, and Play pressed again stops a build) against the
  repository's own `examples/deck.h` and `generator.h`, then uses `binaryen` to rename the exports
  and optimize for size, mirroring `examples/build.sh` + `strip.sh` without Emscripten. Output is
  within a few percent of the Emscripten build. Keep the two pipelines' flags and export names in
  step. Binaryen needs top-level await, hence `build.target: "es2022"` in `vite.config.ts`.
- `src/qrReader.ts`: QR decoding for the Scan tab (live camera frames, photos, dropped images)
  using `zxing-wasm`, loaded lazily. It was picked with `scripts/scanbench` because score cards are
  very dense codes; rerun that benchmark before changing decoders.
- `src/wasmTracer.ts`: the bullseye toggle reassembles the binary with a `scorecard.log(i32)`
  import at basic-block boundaries, and with every load/store address passed through
  `scorecard.read`/`scorecard.write`. The worklet posts block counts and touched addresses back, and
  the Listen tab draws a heatmap over a bit-grid of the binary: green for executed code, blue/red
  for data-segment bytes read/written. Memory outside the data segments (`src/memoryTrace.ts`) is
  drawn in a band under the card. Instrumentation must not change a card's output.
- WebAssembly text is assembled by `watr` (`src/assemble.ts`, ~50 KB; it replaced a vendored 1.2 MB
  wabt) and disassembled by `wasmparser`. After touching the tracer or the disassembly, run
  `npx tsx scripts/watr-check.ts <cards>.wasm`: reassembled and instrumented cards must play
  sample-for-sample the same.
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

The deck sits beside the player (a slide-out drawer below 800px wide, pulled out by the card
edges peeking from the left of the screen). It shows the user's collected cards (`src/deck.ts`, kept in localStorage
under `scorecard-deck`, keyed by each card's base43 code, with any saved seeds) as a pile of
overlapping cards; the playing card is pulled out. Cards are collected when scanned or opened from
a link, by hand with the heart (Keep), or by locking a seed (a locked seed is saved with its card;
unlocking forgets it); drag-and-drop and Create don't collect, so work-in-progress builds stay out.
Mini cards keep their title and size on top, as an index strip for the pile.

Below the pile are sealed packs (`scorecard-packs` in localStorage): bundles of cards that join the
deck when opened. The starter pack is there until opened. "Wrap as a pack" exports the deck as a
JSON pack file (`format: "scorecard-pack"`); "Add a pack", or dropping the file on the page,
imports one. Imported cards are validated, and their titles and sizes are read from the binaries.

Settings (`scorecard-settings` in localStorage) cover volume (applied in the worklet, and re-sent
by `audio.ts` when the context is rebuilt), auto-collecting, animations and a screen wake lock.

The motion is CSS (`.pcard`, `.pack`, `.flip` in `App.css`) plus `flyToPlayer`, and honours
`prefers-reduced-motion`.

`examples/library/*.c` are the starter pack. `examples/library/build.sh`
builds them all and runs `index.py`, which writes `src/library.json` (title, description, size and
base43 code per card); the web build only reads that JSON, so it doesn't need Emscripten. The JSON
is committed: rerun `build.sh` after touching a library card or `deck.h`. Each card's first line is
a `//` comment that becomes its description in the deck.

## Conventions

- `*.wasm` and `*.bin` are gitignored, but some example `.wasm` files are committed on purpose.
  Don't delete them reflexively, and don't `git add -f` fresh build output without thought.
- When changing examples or the strip pipeline, check the resulting `.wasm` size.
- Short export names (`p`/`s`/`d`/`m`) exist to save bytes in the export section, not for looks.
- Commit messages: short one-line subjects, matching the existing history.
