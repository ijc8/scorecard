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
- `p`: `() -> f32`, called once per sample at 44.1 kHz. **Required** of the card that ends up
  playing (see `s`, below: a card may hand the player another card instead). It may instead be
  `(f32) -> f32`, which makes the card an effect: the argument is a sample from the microphone
  (in C: `#define INPUT` before including `deck.h`). The player tells the two apart by the
  exported function's `length`, and only asks for the microphone for cards that take input,
  while they're playing (`setInputWanted` in `src/audio.ts`). **Not settled**: only a build made with
  `VITE_LISTENING_CARDS=1` does this (the demo is); otherwise such a card hears silence.
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
  pack a card smaller: a 408-byte unpacker (context-mixing arithmetic decoder, in WebAssembly text
  in that script) plus the packed card. `examples/seed-beat.c` is a card that writes a different
  program for each seed (a bytebeat). Not settled: whether this stays, and generating during play.
- **Gas metering** (Settings > "Guard against stuck cards", on by default; without it, on iOS, one
  card stuck in `p` leaves the page without audio): the worklet rewrites every card it runs
  (`meterWat` in `src/wasmTracer.ts`, through the same second worklet module as tracing). Each
  function counts its passes through loops in a local, and every 64th takes 64 from an exported
  global, `gas`, which the worklet tops up before each block; a card that runs out traps and is
  stopped (`failed`). `scripts/gas-check.ts` checks it and measures the cost; Settings has a button
  that measures the loaded card on the device (only with `?debug`).

The player also accepts the legacy names (`process`/`setup`/`title`/`memory`) for old cards. Keep
that fallback in `src/generate.ts` and in `public/worklet.js`.

## Architecture

- `src/App.tsx`: the app's state and the music card (`Listen`). The other pieces of the UI live in
  `Pile.tsx`, `Spread.tsx`, `Scan.tsx`, `Workbench.tsx` and `Settings.tsx`; `card.ts` has what
  concerns cards themselves (links, size limit, titles, faces), `deck.ts` the deck and `packs.ts` packs.
  1. URL load, the deck, QR scan, drag-and-drop and builds on the workbench all call `loadBinary(Uint8Array)`.
  2. The binary goes to the AudioWorklet (`public/worklet.js`), which instantiates it and calls
     `p` per sample. **Send the binary, not a `WebAssembly.Module`**: posting a Module breaks on
     iOS Safari.
  3. The binary is base43-encoded back into the URL and rendered as a QR (`qrcode` lib). The link
     is `https://host/path?c=program`, with `s=seed&` before the `c` for a locked seed: the form
     on printed cards and on main. `history.pushState` keeps the address bar in sync, so the page
     itself is the shareable card (and back and forward go through the cards loaded: `popstate`).
     A newer form, `SCHEME://HOST/path#[seed]program`, is always read (`parseCardURL`) but only
     drawn by a build made with `VITE_FRAGMENT_LINKS=1`: scheme and host in capitals so they share
     QR's alphanumeric mode, and the program after `#` so it isn't sent to the server; a locked seed
     is six base43 digits in front (offset so it never starts with `0`, which every program does).
     It's held back until it's known how phone cameras treat it (an iPad's dropped the fragment
     once); it only gains 5 bytes (2,896 against 2,891 at ijc8.me/s).
  4. The title is read by instantiating the module a second time on the main thread.
- `src/audio.ts`: owns the AudioContext and worklet node, and keeps playback working on iOS.
  Read `docs/IOS-PLAYBACK.md` before touching it. In short: `startAudio()` must run synchronously
  inside the Play gesture (and from `mousedown`, not `touchstart`, when audio needs (re)starting);
  a context that was interrupted or whose clock is frozen is replaced, not resumed; a watchdog
  pauses the player if the clock stalls. Don't call `resume()` while the state is `"interrupted"`.
- Playback extras, in the worklet: `{cmd: "skip", samples}` makes samples silently, up to 64x
  real time per render quantum (even while paused); `{cmd: "speed", value}` is fast-forward, as a CD player
  searches: 60 ms of the card at its own pitch, then a silent jump over `value - 1` times as much; `{cmd: "reset", seed, skip}`
  starts again and skips. The skip button (tap: 10 s, hold: 4x) and the clock (tap it to go to a
  time; going back restarts with the same seed) use these.
- `src/mediaSession.ts`: lock-screen controls. Non-iOS browsers only show them while a media
  element plays, so a silent looping `<audio>` plays alongside a card (`holdMediaSession`, called
  in the Play gesture); iOS has `audio.ts`'s own silent element.
- `src/print.ts`: a card drawn as printed (576 dots, black and white), saved or shared as a PNG,
  or sent to a Phomemo-style thermal printer over Web Serial (Bluetooth RFCOMM; the printer must be
  paired with the device). It waits for the printer's `1a 0f 0c` before closing the port: closing
  early stops the print. Works from desktop Chrome (Ian, 11-25); Chrome on Android has no Web
  Serial, so there it's Save picture and the printer's own app. Firefox offers no serial ports.
  Where there's no Web Serial but there is Web Bluetooth, Print tries Bluetooth Low Energy instead
  (`printOverBLE`): **written blind on 11-26 and never tried against a printer**; the services it
  looks for are guesses from other small thermal printers, and its message says what the printer
  offers if none fits.
- The pile (`src/Pile.tsx`; background in `docs/CARD-DESIGN.md`): the panel is the top card of a
  pile, which is the deck. Flick it aside for the next card; Scan, Create, Settings and About are
  cards at the back of the pile whose index tabs stick out below, and the music cards share the
  headphones tab (back to the music, and from there, spread the pile). React only draws the top
  card; what moves, and what shows under a dragged card, are DOM copies of it (`snapshot`, `dress`:
  keep those in step with the card's markup). Tapping the table, or the pile itself (its edges, or the music card on top away from its controls), spreads the pile out
  (`src/Spread.tsx`): small copies of every card, the tabbed cards and sealed packs. Turning
  tracing on first plays the QR code being read into the card's bits, and for a card that
  generates another, those giving way to the bits of the card it wrote (`src/decodeAnimation.ts`,
  from the module-by-module account in `src/qrDecode.ts`; `npx tsx scripts/qr-decode-check.ts
  <cards>.wasm` checks that account by reading the link back off the modules). This is the only
  look: the drawer, the rolodex and the "printed" and "classic" looks were removed on 11-25.
- `src/Score.tsx`: the card's score, one of the card's four views. It's a spectrogram of the
  performance (this card, this seed) going by: 128 columns of about a tenth of a second (twelve
  seconds across), 128 bands of pitch from 40 Hz to 14 kHz, dithered to black and white. A line a
  third of the way across marks now: to its left what has been heard, to its right what's coming.
  Tapping goes to that moment (`seekTo`, as the clock does). `src/score.worker.ts` runs the card
  ahead in silence (setting it up as the player does, generated cards included) and is kept about
  five seconds past the right-hand edge; it's abandoned if nothing comes for 5 s when there's work
  to do, the guard against a stuck card. A card that listens is scored as if the room were silent.
- `src/base43Encoder.ts` (mirrored by `base43.py`): base43 over the QR alphanumeric set minus `%`
  and space, so the binary shares the QR's dense alphanumeric mode with the URL and stays valid in
  a query string.
- A music card shows one of four things, chosen by the buttons at its corner (`VIEWS`, `setView` in
  `src/App.tsx`): its QR code; its bits (the trace view); its score (`src/Score.tsx`); or what it
  holds, as WebAssembly text (`CardBack` in `src/Workbench.tsx`; read-only), with Print and Save
  picture under it. The QR code and the bits share a side, so that one can be read into the other
  (the decode animation); any other change turns the card over. The card is traced while its bits
  or its text show, and not otherwise. The text is the
  tracer's own disassembly (`disassembleWasm`), so that the lines that are running
  can be lit up, and the bytes of data being read and written (`showHeat`, drawn on a canvas behind the text). Nothing that isn't in the card is
  shown as the card. Writing happens on the Create tab's card, the `Workbench`, which `Listen`
  draws in the card's place (same layout and transport, an editor where the QR code goes). It
  keeps its own text whatever card is loaded; "from <card>" in its menu starts from the loaded
  card: from what it was written in when that's known (`src/sources.ts`: the starter pack's
  sources ship with the app, and anything built here is remembered in localStorage under
  `scorecard-sources`), from its disassembly otherwise. There are four modes:
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
  - **Wasm**: WebAssembly text, assembled with watr.

  Pressing Play on the workbench builds what's written first, if that isn't the loaded card
  already. Syntax colours (`src/highlight.tsx`) come from a
  highlighted copy of the text drawn behind a transparent textarea, so the two must keep identical
  text and metrics; `startAudio()` is still called synchronously
  in that gesture, before the (asynchronous) build.
- `src/compiler.ts` / `src/compiler.worker.ts`: compiling C for the workbench. A worker runs Clang and
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
- `src/wasmTracer.ts`: tracing reassembles the binary with a `scorecard.log(i32)`
  import at basic-block boundaries, and with every load/store address passed through
  `scorecard.read`/`scorecard.write`. This happens in the worklet, on the card it's about to play
  (so a card that generates another is traced as what it generated this time): the tracer is a
  second worklet module (`src/instrument.worklet.ts`, bundled with watr and wasmparser, ~150 KB),
  added by `needTracer` in `audio.ts` before the first card is loaded; `workletPolyfill.ts` gives that
  scope the TextEncoder/TextDecoder it lacks. The worklet tells the page which card it instrumented
  (`{traced: {binary, map}}`), then posts block counts and touched addresses back, and
  the Listen tab draws a heatmap over a bit-grid of the binary: green for executed code, blue/red
  for data-segment bytes read/written. Memory outside the data segments (`src/memoryTrace.ts`) is
  drawn in a band under the card. Globals aren't watched themselves: each counts as read
  or written as much as the code that reads or writes it is running (`findGlobalUses`,
  `globalHeat`), and is tinted the same blue and red, in the bits and in the text. Instrumentation must not change a card's output.
  Every rewriting (traced, metered or neither: once the tracer module is there, the worklet
  rewrites every card) also exports the card's state: its memory as `scorecard.memory` and each
  mutable global as `scorecard.globalN`. So turning tracing or the guard on or off
  (`{cmd: "instrument", trace, meter}`) doesn't restart a card that's playing: `carryOver` in the
  worklet instantiates the new rewriting and copies the state across. (The page fetches the tracer
  before it loads any card, for this. Only if it couldn't be fetched is a card restarted instead,
  and run unheard to where it was.) `npx tsx scripts/carry-check.ts <cards>.wasm` checks that a carried-over card plays on
  sample-for-sample the same.
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

The deck is the pile (above): the user's collected cards (`src/deck.ts`, kept in localStorage
under `scorecard-deck`, keyed by each card's base43 code, with any saved seeds). Cards are
collected when scanned or opened from a link, or by keeping a performance with the heart (which
saves the seed with the card); drag-and-drop and the workbench don't collect, so work-in-progress
builds stay out. Cards are removed in the spread.

In the spread are sealed packs (`scorecard-packs` in localStorage): bundles of cards that join the
deck when opened. The starter pack is there until opened. "Wrap as a pack" exports the deck as a
JSON pack file (`format: "scorecard-pack"`); "Add a pack", or dropping the file on the page,
imports one. Imported cards are validated, and their titles and sizes are read from the binaries.

Settings (`scorecard-settings` in localStorage) cover volume (applied in the worklet, and re-sent
by `audio.ts` when the context is rebuilt), auto-collecting, animations and a screen wake lock.

The motion is the Web Animations API in `Pile.tsx` and `Spread.tsx`, plus CSS for packs, and
honours `prefers-reduced-motion` and the Animations setting (`motionOff`).

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
