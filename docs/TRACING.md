# How tracing works

While a card's bits or its text are showing, the player shows which code is running and which
memory is being read and written. The worklet does this by rewriting the card it's about to play
(`instrumentWat` in `src/wasmTracer.ts`) so that the card keeps an account of itself, which the
worklet reads and clears about 43 times a second (`postTrace` in `public/worklet.js`) and posts to
the page. Nothing here is part of the score card contract: a card never knows it's being traced.

## The account

- **Code.** The card's text is cut into blocks at `if`, `else`, `loop`, `end`, `br_if` and the start
  of each function. Each block gets a global of its own, `scorecard.blockN` (exported), and four
  instructions at its start that add one to it. The worklet reads each global and sets it to zero.
- **Memory.** The card's memory is declared a little over three times its size. Above the card's
  own part are a flag byte for every byte read, then a flag byte for every byte written, then, for
  each, a flag for every 4,096 bytes that have any flags set, so that the worklet only looks at
  the parts touched. In front of each load and store, the rewriting sets the flags (one store for
  the bytes, one for the 4,096) and checks that the address is within the card's own part, failing
  as the load or store would have failed if it isn't. The worklet reads the flags through the
  exported memory, turns them into runs of bytes and clears them.
- **Globals** aren't watched: a global counts as read or written as much as the code that reads or
  writes it runs (`findGlobalUses`, `globalHeat`).

What the page receives is `{traced: {binary, map}}` once, then `{reads, writes}` (runs of bytes,
as `[start, length, ...]`) and an array of block counts at each update.

## The other way: calling out

A card that asks how big its memory is or grows it (`memory.size`, `memory.grow`) would notice the
extra, so its memory is left alone and each address is passed through an imported `scorecard.read`
or `scorecard.write` instead, with a tracker in the worklet (`makeTouchTracker`). Blocks are still
counted in globals. This is how all memory was traced until 11-27, and it's slow: a call out of
WebAssembly for every load and store.

## Why not something else

- **Calling out for everything** (until 11-27): a traced card ran some twenty times slower than a
  guarded one (Pink Trombone at 1.1 times real time on a laptop). Keeping the account in the card
  brings that to within about two times.
- **A second memory for the flags** would leave the card's own memory alone, so no check of
  addresses and no second way for cards that grow. Chrome (120) and Firefox (125) have multiple
  memories; Safari on iOS was still listed without them in November 2026, and the iPad matters.
  Worth doing when it has them, with the present scheme for browsers that don't.

## Cost

A traced card's memory is three times the size (most cards declare 16 to 19 MB, of which they touch
little; untouched pages cost nothing). Carrying a card over between rewritings (`carryOver`)
copies only the card's own part.

## Checking it

`npx tsx scripts/trace-check.ts <cards>.wasm` runs the real worklet on each card guarded, traced,
and traced calling out: all three must make the same samples and the two traced ones must give
exactly the same account. It also tries a card that reads past its memory, one that grows it and
one with none. `scripts/watr-check.ts`, `carry-check.ts` and `memory-trace-check.ts` cover
reassembly, carrying over and the page's side.
