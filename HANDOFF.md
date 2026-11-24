# Handoff

State of the branch `claude/scorecard-library-n3huaj` at the end of a long session (19 commits on
top of `3b5eb2a`, not merged, no pull request opened). `AGENTS.md` describes how the code works;
this file is about what was done, what has and hasn't been checked, and what to do next.

## The one thing to know first

**Nothing on this branch has run on a real phone, and none of the music has been heard by the
agent that wrote it.** Everything was built and checked in headless desktop Chromium, and the
cards were checked by measurement (levels, note lists, spectra). Ian listened to the first,
transcribed version of Return True ("not bad") and to nothing else that is recorded here.

So the first job is a pass on real devices, iOS Safari above all, with the branch served over
https (AudioWorklet, the camera and the microphone all need a secure context).

## What the branch adds

Roughly in the order it was built:

- **Starter cards**: eight cards in `examples/library/`, built into `src/library.json`, plus DSP
  helpers in `examples/deck.h` (sine approximation, filters, delay, soft clip, plucked string,
  a small PRNG).
- **Deck**: collected cards and saved seeds in localStorage, shown as a pile of cards beside the
  player (a drawer on narrow screens). Sealed packs, with import and export as JSON files.
- **Scanner**: a plain viewfinder decoding full camera frames with `zxing-wasm`; photos and dropped
  images too. Chosen with `scripts/scanbench` (synthetic frames only so far).
- **Tracing**: memory reads and writes as well as execution; a band for memory outside the card's
  data; on the source side, heat on the lines of WebAssembly text.
- **Card faces**: the big card flips between QR, bits and source. Icon tabs. A Settings tab
  (volume, collecting, animations, stay awake, echo cancellation, fresh starter pack, empty deck).
- **Writing cards in the player**, on the source face:
  - C, compiled in the browser by `@yowasp/clang` and `binaryen` (no Emscripten);
  - Beat: a bytebeat expression, straight to WebAssembly;
  - Pattern: a subset of Tidal/Strudel mini-notation, as data for a prebuilt player;
  - Wasm: the card's disassembly, editable.
  Play on the source face rebuilds first if the text has changed.
- **Links**: `SCHEME://HOST/path#[seed]program`, capitals for scheme and host. Old `?c=&s=` links
  still load. This was done with a move to `scr.cards` in mind.
- **Input cards**: a `p` that takes an `f32` gets the microphone. `examples/canyon.c` is one.
- **Converters**: `scripts/song2card.py` (recording to card, by transcription) and
  `scripts/als2card.py` (Ableton set to card, exact). `examples/return-true.c` is the latter's
  output for Ian's "Return True": all 1,458 MIDI notes, 2,862 bytes.
- **Housekeeping**: `App.tsx` split into modules, `npm run lint`, `print.py` on the new link form.

## What was checked, and how

- Each feature was exercised in headless Chromium with Playwright. The scripts that survive are in
  `scripts/browser-checks/` (ad hoc; read its README). Others were throwaway.
- Tracing does not change a card's output: instrumented and plain builds of all eight starter
  cards gave identical samples for five seconds.
- Return True plays exactly the notes in the set (a native build logs every note; compared with
  the parsed set). Four notes have their lengths rounded.
- The bytebeat compiler matches JavaScript's result sample for sample on eight expressions.
- Input cards: with Chromium's fake microphone, samples reach the card, and the microphone is
  held only while such a card is playing.
- Old-form links, new-form links, locked seeds and fragment-only navigation all load.

## What was not checked

- **iOS anything.** Specific worries:
  - Play on the source face awaits a build between the tap and the sound. `startAudio()` is
    still called synchronously in the tap, as `docs/IOS-PLAYBACK.md` requires, but the path is new.
  - Input cards switch the audio session to play-and-record. On iPhones that can change output
    routing and volume. Whether echo cancellation really stops speaker-to-microphone feedback for
    Web Audio output is unknown; it is on by default, and headphones are the safe way to try it.
  - Whether camera apps open `HTTPS://HOST/#…` links, and whether iOS's long-URL truncation
    behaves the same with a fragment. Check before printing cards in the new form.
  - The scanner on a real camera, with printed cards. Near-maximum cards (QR version 40) were
    never in the benchmark; Return True now is one.
  - Tracing's cost on a phone (it calls out to JavaScript on every memory access).
- **How anything sounds**: the starter cards, the pattern mode's built-in sounds, canyon, and
  Return True in its final form with the real drum pattern.
- **`print.py`**: its link form was changed without a printer to try it on.
- The volume setting by ear; the wake lock on a device; animations other than as still frames.
- A real network download of the compiler (27 MB gzipped) and its progress readout.

## Things that will surprise you

- **The build is about 115 MB**, nearly all of it the C compiler's two files (74 MB and 30 MB),
  fetched only on the first compile. Check the host's per-file limit before deploying.
- **The build target is ES2022** (binaryen needs top-level await): roughly Safari 15 and later.
- **Return True has 37 bytes to spare** at `ijc8.me/s` (2,857 bytes with Emscripten 7.0.1, in the
  container described in AGENTS.md; this branch's first build was 2,862 with an unknown version). Changing `deck.h` or the converter's
  player code can push it over; rebuild and check.
- **`src/library.json` is generated and committed.** After touching a starter card or `deck.h`,
  run `examples/library/build.sh` (needs Emscripten and binaryen). The in-browser compiler does
  not need it, and gives sizes within a few percent of Emscripten's.
- **Toggling tracing while a card plays restarts the card** (same seed), because the
  instrumented module only takes hold on a reset.
- **C mode's first build is a 27 MB download** (104 MB if the server doesn't compress, as `vite
  preview` doesn't). Pattern and Bytebeat don't need it.
- The Ableton drum loops used to read Return True's drum pattern are Ableton's and are not in
  the repository; only the hit patterns are, as options in the command below.

To regenerate Return True (the set file is Ian's and is not in the repository either):

    python3 scripts/als2card.py Return_True.als "Return True" \
        --loop 0x40504040405,0x3000409010104090,0x555555545555 \
        --loop-bars 3-12,19-28,35-44,47-79 --shaker-bars 4-44 > examples/return-true.c
    examples/build.sh examples/return-true.c

## Decisions Ian made along the way

- No compression of programs in links: it would let cards lean on deflate instead of being
  clever. Base43 stays.
- Fine with serving tens of megabytes for the compiler.
- The deck is not a tab; it should not look like a desktop window; cards in it should look like
  the big card.
- The program goes after `#`. Noted in passing: that means the server no longer sees which cards
  are opened, and the app reports nothing.
- `scr.cards` is bought and unused; the link form was designed so it costs nothing extra.

## Next steps, in the order I would take them

1. Serve the branch over https somewhere and test on phones (list above).
2. Listen to everything; fix what sounds wrong. For Return True the instruments are four
   plain synth voices and the drums have no dynamics.
3. Open a pull request, or split the branch if 19 commits is too much to review at once.
4. Decide on deploying to `scr.cards`.

Ideas raised and not started: printable sheets of cards from the deck; a pack as a link;
recording a card to a WAV; synchronised starts (clocks alone are too loose for rhythmic cards;
Ian's own earlier idea was ultrasound); chaining input cards; a companion symbol or colour layer
carrying extra data that only the player's scanner reads; album art in the QR; mapping trace
heat back to C lines (needs debug info); more languages (Faust was named in the papers).

## Elsewhere

- A private page of links to the starter cards and Return True, in old-form links that work on
  the currently deployed player: https://claude.ai/artifact/B45Mny6B3SDCZKCoSnGrkN
- A private copy of an early build, published to try on a phone (camera blocked there, and now
  many commits stale): https://claude.ai/artifact/YJuPhugx9NnV9DRoUfdeHQ
- The JAES and WAC papers' future-work sections were read during the session; the list of ideas
  above includes what remains from them.
