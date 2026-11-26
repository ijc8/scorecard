# The score card contract (draft)

A draft, written 2026-11-26 for Ian to accept, change or throw out. It sets down what a score card
is and what any player owes it, so that `main` can hold exactly this and nothing unsettled. Each
part says where it stands: **on main** (what the deployed player does today), **proposed** (on the
working branch, and Ian has said yes in conversation), or **open**.

## 1. The card

A score card is a WebAssembly binary. It imports nothing.

| Export | Type | Required | Meaning | Status |
|---|---|---|---|---|
| `p` | `() -> f32` | yes, of the card that plays | The next sample. Called once per sample. | on main |
| `s` | `(i32) -> ()` | no | Setup, called once with the seed before the first `p`. | on main |
| `d` | global `i32` | no | Address of the card's title: UTF-8, zero-terminated. | on main |
| `m` | memory | if `d` is present | The card's memory. | on main |

A player also accepts the older names `process`, `setup`, `title` and `memory`. (on main)

## 2. What the player owes a card

- **Sound**: 44,100 samples a second, one channel. The value `p` returns is the sample, with 1.0
  as full scale. What happens beyond full scale is up to the player; cards should stay within it. (on main)
- **A fresh start**: each performance is a new instance of the card. Nothing carries over from one
  performance to the next but the card itself. (on main)
- **The seed**: an unsigned 32-bit number, drawn afresh for each performance unless the listener
  has locked it. The same card with the same seed is the same performance, sample for sample. A
  card that ignores its seed (or has no `s`) plays the same way every time. (on main)
- **Time**: `p` is called once for every sample, in order, none skipped. A player that lets the
  listener jump ahead does it by calling `p` for the samples in between and discarding them; going
  back means starting again with the same seed. (proposed: main has no skipping)
- **Nothing else**: no imports, no clock, no network, no input. Everything a card does follows
  from its bytes and its seed. (on main)

## 3. The link

A card travels as a link, usually in a QR code:

    https://<player>?c=<program>
    https://<player>?s=<seed>&c=<program>

- `<program>` is the binary in base 43: the digits `0-9 A-Z $ * + - . / :` (QR's alphanumeric set
  without the space and `%`), the binary read as one big-endian number, with a `0` in front for each
  leading zero byte (every binary starts with one). (on main)
- `<seed>`, if present, is the seed in the same base 43, and means the seed is locked: this link
  is one performance. (on main)
- The player's address is part of the link but not of the card. Any player can read the program
  out of any card's link. (on main)
- **Size**: the link has to fit in one QR code (version 40, error correction L). At
  `https://ijc8.me/s` that leaves 2,891 bytes for the binary, or 2,882 with a locked seed. (on main)

**Open**: a second form, `SCHEME://HOST/path#[seed]program`, keeps the program off the server and
gains 5 bytes. The player on the working branch reads it but doesn't draw it. It waits on knowing
how phone cameras treat a long fragment (an iPad dropped one once), and on whether not sending the
program to the server is wanted.

## 4. Cards that write cards (proposed)

`s` may return an `i32`. If it's not zero, it's an address in `m` where the card has written
another card: a 32-bit little-endian length, then that many bytes of WebAssembly. The player sets
that card up with the same seed and plays it in place of the first; its `s` may do the same.

- Nothing passes from one card to the next but the seed and whatever was written into the new card.
- It happens afresh at the start of every performance, so the card written may differ with the seed.
- A card that does this needs `m`, and needn't have `p`. The last card must have `p`.
- The title is that of the last card along the way that has a `d`.

This is what lets a card carry itself packed, with its own unpacker (`scripts/pack-card.mjs`: 408
bytes of unpacker), or be a different program for every seed (`examples/seed-beat.c`).

**To settle before it's contract:**
- **Limits.** The working player gives the whole chain 3 seconds and no limit on rounds. Is a
  limit part of the contract (say, a number of rounds and a size of memory), or each player's own
  business?
- **Old players.** The player on main ignores what `s` returns. It plays a generating card that
  has its own `p` as that card, and can't play one that hasn't. Ian isn't worried about this.
- **Which seed names the title.** The working player finds the title with seed 0, so that it
  doesn't change from one performance to the next.
- **Writing a new card during play** is left out.

## 5. Not in the contract

- **Cards that listen** (`p` taking a sample of the microphone): built on the working branch and
  switched off by default. Ian wants to play with the idea first. See `docs/INPUT-IDEAS.md`.
- **Anything the player shows**: the pile, the views of a card, tracing, the guard against stuck
  cards, the deck and packs. A player may stop a card that never returns from `p` or `s`.
- **Descriptions and sources**: they aren't in the card, so they aren't the card.

## 6. Open: should a card say which contract it was made for?

Ian wondered. Three ways, none adopted:

1. **In the link's path**: `https://ijc8.me/s/2?c=...`. Costs two characters of the link and no
   bytes of the binary, and lets an old printed card keep reaching a player that understands it.
   But the version then belongs to the link, and a card loaded as a bare `.wasm` has none.
2. **In the export names**: a change that old players would misread gets a new letter, as `s`
   returning a card could have been `g`. Costs nothing until it's needed. This is what has been
   done so far.
3. **A marker in the binary** (an export, or a custom section): costs bytes in every card.

So far every addition has been one an old card doesn't notice (old cards still play) and that an
old player fails on visibly or ignores. As long as that holds, 2 is enough.
