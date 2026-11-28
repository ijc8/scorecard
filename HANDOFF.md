# Handoff

State of the branch `claude/brave-wilson-b37a5f` on 2026-11-26: 75 commits on top of `origin/main`
(`3b5eb2a`), through `d9324cf` (the contract draft). It is pushed to GitHub as a branch only.
Nothing is merged or deployed, and there is no pull request. `AGENTS.md` describes how the code
works; `docs/CONTRACT.md` drafts what main would hold; this file is about what was done, what has
and hasn't been checked, and what to do next.

(Until 11-23 this work lived on `claude/scorecard-library-n3huaj`, 19 commits; this branch carries
those and everything since.)

## The one thing to know first

**Testing is uneven, and the newest work has only run headless.**

- Ian has been using the pile-only build on his phone and laptop (as of 11-26) and has reacted to
  it (see decisions below). Earlier parts were tried on devices: tracing in the worklet and the
  guard against stuck cards were verified on the iPad and the Pixel on 11-24, generated and packed
  cards play on the iPad, and the ZXing scanner was used on devices.
- Everything from the last two nights (11-25/26 and 11-26/27, roughly `d9255d1` onwards: view
  buttons, tracing carry-over, scrolling score, globals in tracing, play counts, BLE print, the
  new cards, the spread round 2 mock-ups) was checked in **headless WebKit only**, mostly as still
  frames. None of it has been on a phone.
- The agents that wrote the cards have not heard any of them. Cards were checked by measurement
  and simulation.
- The demo (systemd unit `scorecard-demo`, serving `dist/` on :4917, reachable over the tailnet on
  port 8443) is built with listening cards on: `VITE_LISTENING_CARDS=1 npm run build`, then the
  kit's `pages.sh` to regenerate `dist/qr.html`, `dist/links.html` and `dist/spread.html`.

## Where main stands

Ian (11-25): main should reflect the accepted, finalised ScoreCard contract and match what is
deployed on his website. So nothing merges until it is ready to deploy, and this branch is the
workshop. The plan is to cut a release-candidate branch from it with the unsettled parts switched
off; merging that is the deploy. The branch can't usefully be merged in pieces: later commits
rewrite or delete earlier ones (the pile replaced four other looks).

## What the branch adds

### From the first stretch (to 11-23)

- **Starter cards**: eight cards in `examples/library/`, built into `src/library.json`, plus DSP
  helpers in `examples/deck.h`.
- **Scanner**: full-frame `zxing-wasm` viewfinder; photos and dropped images too. Ian: "a major
  improvement" over main's.
- **Tracing**: memory reads and writes as well as execution, now instrumented in the worklet (the
  tracer is a second worklet module, loaded when first wanted).
- **Writing cards in the player**: C (in-browser `@yowasp/clang` and `binaryen`), Beat (bytebeat),
  Pattern (a subset of Tidal/Strudel mini-notation) and Wasm.
- **Input cards**: a `p` that takes an `f32` gets the microphone. Now off unless the build sets
  `VITE_LISTENING_CARDS=1`.
- **Converters**: `scripts/song2card.py` and `scripts/als2card.py`; `examples/return-true.c` is the
  latter's output for Ian's "Return True".
- **Skip and seek**: tap to skip 10 s, hold to fast-forward, tap the clock to go to a time (going
  back restarts with the same seed and renders up to it).
- **Lock-screen controls** (Media Session), and a locked seed saved with the card.
- **Gas metering guard** against stuck cards, on by default; a card with nothing to play is refused.
- **Cards that generate cards**: setup may return the address of another card (a length, then the
  bytes), which is played in its place. Setup is tried in a worker with 3 s; no limit on rounds.
  `scripts/pack-card.mjs` packs a card with its own 408-byte context-mixing unpacker (Pink
  Trombone packs to 2,792 bytes). `examples/seed-beat.c` writes a different program per seed.
- **Pink Trombone** card: a vocal tract that sings by itself.
- **Printing**: render as printed (576 dots), save or share the picture, or send it to a Bluetooth
  thermal printer over Web Serial (desktop Chrome).

### The pile (11-24 to 11-25)

- **The pile is the only look**; drawer, rolodex, printed and classic looks are gone. Flick the top
  card aside for the next; dragging right draws the bottom card in from the left and lays it on top
  (the reverse of flicking left). Scan, Create, Settings and About are tabbed cards at the back; the
  headphones tab returns to the music, or spreads the pile when already there.
- **Spread**: tapping the pile spreads it; the top card is dealt first and every card gathers back.
  On long decks (tried with 36 and 120) it opens at the current card.
- **Workbench**: Create is its own card, with the editor where the QR code goes and the language as
  a menu.
- **Card back**: read-only WebAssembly text with Save picture (and Print where available) under it.
- **Link test page** `/links.html` (from `scripts/link-test-page.mjs`): the same cards as `#` and as
  `?c=` links, for testing phone cameras.
- **Three more cards** in `examples/`, not in the starter pack: Changes (Plain Bob on six to eight
  bells, 1,100 bytes), and two listening cards, Sitting in a Card (after Lucier, 385 bytes) and
  Fireflies (phones that fall into time by ear, 849 bytes).

### The last two nights (11-25/26 and 11-26/27)

- **Links back to `?c=`**: QR codes and the address bar use `?c=` again; `#` links are still read,
  and `VITE_FRAGMENT_LINKS=1` draws the new form. Back and forward step through the cards loaded.
- **Fast-forward** is heard as snatches at the card's own pitch (like a CD player searching); the
  icon stays put.
- **Settings pruned**: starter-pack and empty-deck buttons moved to the spread; the speed test is
  behind `?debug`.
- **View buttons**: four buttons at the card's bottom right choose QR code, bits, score or text.
  The "over" arrow, the bullseye tracing toggle and the separate score button are gone. QR and
  bits share a side and keep the encode/decode animation; every other change turns the card over.
  The chosen view stays as you flick between cards.
- **Tracing without restarts**: tracing is on exactly while bits or text show. Switching copies the
  playing card's memory and globals into the newly instrumented module (`{cmd:"instrument"}` in
  the worklet; `scripts/carry-check.ts`), so the card carries on with no catch-up, sample for
  sample the same on every card tried. **Exception:** with the guard off, the very first switch
  still restarts and catches up, because the tracer wasn't loaded to export the card's state.
- **Scrolling score** (`src/Score.tsx`, `src/score.ts`, `src/score.worker.ts`): a spectrogram of
  the performance to come, computed ahead, about 12 s across with the now-line a third of the way
  in. Tap to go to that moment. It keeps up through fast-forward, skip and seek. Listening cards
  can't be read ahead.
- **Data and globals in tracing**: on the card's back, data bytes are tinted blue when read and
  red when written; globals light up the same way in the bits and the text. Globals are derived
  from which code runs (block counts), so they cost the card nothing.
- **Play counts**: deck cards record performances started and time listened, on this device, kept
  with the deck and not put in packs. Nothing shows them yet.
- **BLE print (experimental, untested)**: where there's no Web Serial (Chrome on Android), Print
  tries Bluetooth LE (`printOverBLE` in `src/print.ts`). Written blind: the printer's BLE services
  are guesses from similar printers. If it fails, the status line lists what the printer offers.
  iOS Safari has neither, so there it stays Save picture.
- **Spread mock-ups, round 2** at `/spread.html` on the demo (generated by the kit's
  `spread-mockups.ts` via `pages.sh`): three card-box variants on top, round 1 (A to E) below. C1
  lifts one card out to show its picture and counts; C2 adds a small sound picture on every edge;
  C3 makes the edge itself a band of the card's sound. **The suggestion is C2.** The real spread is
  unchanged.
- **Contract draft**, `docs/CONTRACT.md`: the card's exports, what a player owes a card, the `?c=`
  link, and cards that write cards, each marked on main, proposed or open. Listening cards and `#`
  links are outside it. The version question has three options laid out.

## What was checked, and how

- Each feature was exercised in headless browsers with Playwright (Chromium early on, WebKit for
  the pile work), at phone and desktop widths (360, 390, 1100 px). Surviving scripts are in
  `scripts/browser-checks/`; the latest night's checks (`check-*.cjs`: swipe, score, views, carry,
  heat, globals, links, big decks) live in the shared `scorecard-kit/` notes folder, not the repo.
- Repo checks: `npx tsc`, `npm run lint`, `npx tsx scripts/watr-check.ts`, `scripts/gas-check.ts`,
  `scripts/qr-decode-check.ts`, `scripts/carry-check.ts`. Reported passing at `d9324cf`.
- Tracing does not change a card's output; carried-over cards match the untraced run sample for
  sample.
- The packer verifies its round trip; packed cards load, play and trace in the player.
- Changes: the first lead matches real Plain Bob Minor and it returns to rounds correctly.
- Sitting in a Card and Fireflies were checked in simulation only (a simulated room; phones
  hearing each other 120 ms late synced within 30 to 60 ms in under half a minute).

## What was not checked

- **Anything from the last two nights on a real device** (list above).
- **How anything sounds**, to the agents: no card has been listened to by an agent.
- **BLE printing** against the real printer (an M02 Pro; framework's `bluetoothctl` only knows its
  serial profile).
- **Lock-screen controls on Android**: still don't appear. `?debug` lines for the silent audio
  element are in; it needs a run with the Pixel awake.
- **`#` links with the iPad camera**: the camera dropped the fragment once; `/links.html` is
  waiting for that test.
- Listening cards in a real room; echo cancellation and iOS audio-session routing with them.
- A real network download of the C compiler (about 27 MB gzipped, about 100 MB uncompressed).
- `print.py` on a printer since its link form changed.

## Known rough edges

- Seeking (clock or score) does nothing before the first Play, since the worklet isn't running.
- The guard-off first-switch exception above.
- In a long spread, lower rows slightly overlap the saved-seed labels of the row above; the first
  120-card spread took about a second to open headless.
- `scripts/watr-check.ts` can't take packed cards ("p is not a function").
- `src/library.json` is generated and committed; after touching a starter card or `deck.h`, run
  `examples/library/build.sh` (needs Emscripten and binaryen).
- The build is large (about 115 MB, nearly all the C compiler, fetched only on first compile) and
  targets ES2022 (roughly Safari 15 and later).

## Decisions Ian made along the way

- No compression of programs in links; Base43 stays. Fine with serving tens of MB for the compiler.
- The deck is not a tab or a desktop window; the pile is the direction.
- The generated-card ABI (setup returns a card) over a separate `g` export.
- Hold off on `#` links (considered separately; affects server-side logging). Draw `?c=`.
- Leave listening cards out for the moment.
- Not worried about old players.
- Consolidate view switches into one button group; flip for every change except QR and bits, which
  share a side for the decode animation.
- Tracing should carry the card over (a checkpoint) instead of restarting and catching up, which
  had been surprising him in practice.
- Main = accepted contract = what's deployed.

His reactions to the pile build (11-26): likes the flipping, swiping and tab animations, the
scanner, skip ahead, and cards that generate cards. Not yet satisfied with the spread, deck and
packs: too much repetition on each mini card (wordmark and controls), mini QR codes of doubtful
use, and missing information (date scanned, a hash to tell same-named cards apart). Thinks
Settings has more than it needs. Would like printing from a mobile browser.

## Waiting on Ian

1. **Spread direction**: pick from `/spread.html` (round 2 C1 to C3, or round 1 A and D, which he
   was tempted by for the spectrograms). C2 is the suggestion.
2. **The contract draft**: accept, change or throw out `docs/CONTRACT.md`; in particular the
   limits on generated cards (rounds, memory, whether 3 s is contract or one player's patience)
   and whether a card declares a version (one option: in the link's path, such as `/s/2?c=`).
3. **BLE print test on the Pixel**: open a card's text view, press Print, report the status line.
4. **Where Save picture and Print should live** (now under the disassembly; options: the card's
   front, or the spread beside "Wrap as a pack").
5. **iPad camera test** of `/links.html`, and the Pixel `?debug` run for lock-screen controls.
6. **C compiler hosting** for a deploy, and what goes into the first release candidate.

## Next steps, in the order I would take them

1. Once the spread is picked: build it for real, showing date scanned, a short hash, and the play
   counts already being collected.
2. A device pass on the demo (iPad and Pixel) over the last two nights' work.
3. Settle the contract; then cut a release candidate with listening cards, `#` drawing and
   probably C mode off, and deploy it by merging to main.
4. Fix the guard-off first-switch restart and seeking before the first Play.

Ideas raised and not started: printable sheets of cards; a pack as a link; recording a card to
WAV; synchronised starts; chaining input cards; a live (not read-ahead) spectrogram for listening
cards; mapping trace heat back to C lines; more languages (Faust); more ideas for listening cards
in `docs/INPUT-IDEAS.md`.

## Notes for scorecard-cloud

From the local session on this branch, 11-27 (also sent over the Duet bridge). You port settled
pieces onto `ccr-f4a940d7-59li0v`; new work stays here; neither writes to the other's branch.

- **The tracing toggle is gone** (so "the toggle beside the size" is superseded): four buttons at
  the card's corner choose the view (`VIEWS`, `setView`, `dd8a126`; Ian: "View buttons look
  good"). Tracing is on while the bits or the text show. The transport row is unchanged.
- **Port the guard and worklet tracing together with carry-over** (`463b5a7`, then `d889868`):
  switching tracing or the guard copies a playing card's state into the new rewriting, in place of
  restarting and catching up, which Ian found surprising. `scripts/carry-check.ts` checks it.
- **Hold**: Media Session (nothing shows on Android); `#` links (drawn only with
  `VITE_FRAGMENT_LINKS=1`); listening cards (`VITE_LISTENING_CARDS=1`).
- **Not settled**: the spread, deck and packs (Ian is choosing among mock-ups:
  `npx tsx scripts/spread-mockups.ts > dist/spread.html` after a build); the workbench; printing
  over Bluetooth LE (never tried); the limits on cards that write cards (`docs/CONTRACT.md`, 4).
- **Checks in the repo**: `scripts/watr-check.ts`, `gas-check.ts`, `carry-check.ts`,
  `qr-decode-check.ts`. The browser walk-throughs are ad hoc Playwright scripts outside the repo
  (they hold local paths); ask if one would help and it can be tidied and added.
- Nothing has been tried on a device since 11-25. `d889868` wasn't run in a browser at all.

## Merge prep, from 11-28

The cloud session stopped at `a2c676e` (main + 18). From the night of 11-27/28 the local session
works on both branches: this one, and `ccr-f4a940d7-59li0v` in a second checkout
(`~/GT/scorecard/sc-merge-prep`). Added there, each its own commit, in order of settledness:

- `d1aa044` the tracer rework (below), with `scripts/trace-check.ts` and `docs/TRACING.md`;
- `57e500d` the score view, and three buttons beside the size (QR code, bits, score) in place of
  the tracing toggle. No fourth button: in main's look the card's text is already on the Create tab;
- `a9fd0d2` a typed seed restarts the card once.

Not ported, on purpose: cards that write cards (the limits are Ian's open question), the pile,
spread, deck and packs, the workbench, listening cards, `#` links, lock-screen controls, Bluetooth
LE printing. The merge-prep build is served beside the demo at `/rc/` (the kit's `pages.sh` copies
its `dist/` there).

**The tracer rework** (`69a408c` here): a traced card keeps its own account, block counters in
exported globals and flags for touched memory above its own memory, in place of calling out for
every block, load and store. Design and trade-offs in `docs/TRACING.md`. The impressive-fable acid
card that sticks at 0.84 s is that branch's own `cards/acid.c` (`while (note--)` with a negative
note), not the starter pack's acid drip, which plays.

## Sibling branches

`impressive-fable` (5 commits) and `impressive-opus` (8 commits) also branch from `3b5eb2a` and are
pushed. They are separate card-making experiments (scat radio, choir, acid, guitar and radio
cards, with build and verification tools). The packed Scat Radio card in `examples/packed/` here
comes from `impressive-fable`'s `cards/scat-radio.c`. Neither branch is merged into this one, and
the session transcripts for this branch don't say more about how they relate.

## Elsewhere

- Per-night hand-over notes with more detail are in Ian's shared side-session notes folder:
  `scorecard-handover-2026-11-24-night.md`, `-2026-11-25-overnight.md` and
  `-2026-11-26-overnight.md`. The test kit, `scorecard-kit/`, is beside them.
- `docs/CARD-DESIGN.md` (the pile, with open questions) and `docs/INPUT-IDEAS.md` (fourteen ideas
  for cards that listen).
