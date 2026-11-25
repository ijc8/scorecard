# What a score card is, and what it looks like

A working note behind the player's look: the pile (2026-11-25; it replaces a note of the day
before that argued for a "printed card" lying on a separate player).

## What it is

A score card is a **score**: instructions for a performance, small enough to hand to someone.
The lineage is the event score printed on a card (George Brecht's *Water Yam*, a box of small
printed cards, 1963), crossed with the punched card that drives a machine (the Jacquard loom, the
music box and the player-piano roll). A ScoreCard is an event score that a machine can perform:

- **The program is the score.** It says how the music goes, not what the samples are.
- **The player is a performer**, and only one possible performer. The link on the card points to
  one, but the card holds the whole piece and outlives any player.
- **A seed is a performance.** Generative cards differ each time; locking a seed keeps one
  realization, and saving a seed is like keeping a recording of it.
- **The byte count is the card's one statistic**, like the number on a trading card, and the
  2,953-byte limit is the form's constraint, like a sonnet's fourteen lines.

It's also a **card**: small, physical, cheap, giftable, collectable, tradable. People keep cards
in decks, piles, boxes and wallets, and pass them around. That's what the pile and the packs in the player are about.

## On paper

The cards printed so far (`print.py` for the cat printer, the Halloween `make-cards.py` for the
Phomemo M02 Pro, and screenshots of the player) all have the same layout:

```
+---------------------------+
|        S c o r e C a r d  |   wordmark: says what this is to someone who's never seen one
|  +---------------------+  |
|  |                     |  |
|  |       QR code       |  |   the piece itself (and a link to a player)
|  |                     |  |
|  +---------------------+  |
|    Haunted Organ | 2840   |   name | bytes
|  Bach's Toccata, then an  |   one line of liner notes (optional)
|  endless improvised one   |
+---------------------------+
```

Things that follow from paper, thermal paper especially:

- **Black and white only.** Thermal heads, photocopiers and screenshots all print best without
  greys, so nothing on the card relies on a grey or a colour.
- **The QR code gets a quiet zone** (two modules or more of white) and whole-pixel modules: at
  576 dots across, a version-40 code is 3 dots a module.
- **The wordmark goes on every card.** A card found on a table has to explain itself; the QR code
  alone looks like a payment link.
- **Name and size together under the code**, as a caption. (On screen they're above it: see below.)

A **back**, for double-sided or folded cards, could carry what's for people rather than phones:
the source (the score in the Fluxus sense), "scan with your phone's camera", and the player's
address written out. On screen, the back of a card is its WebAssembly text.

Sizes: a thermal strip makes 72 mm x ~115 mm cards; four to a Letter page (the Halloween PDF)
is about playing-card size.

## In the player

Where does the card end and the player begin? Two answers were tried. In the first, the card was
drawn as it's printed, with no buttons, lying on a player that had them all (the "printed look").
Its controls never made visual sense: they floated off the card with nothing to belong to. The
second is the one kept:

**The panel is the card, and the phone is the player.** The original panel (wordmark, name and
size, QR code, transport) is one card, a real object lying on a table, with its controls printed on
it. Nothing on screen is drawn as a device, because the device is the one in your hand. The look
is the original's: black and white, pixels, classic Mac. The feel is meant to be that of handling
cards (Balatro was the reference): weight, tilt, a little overshoot.

- **There is one kind of card.** A small card (in the spread) is the same panel, shrunk.
- **The deck is the pile under the top card.** Flick the top card aside and it goes to the bottom;
  the next is already under it. A couple of card edges and a hard shadow show at the corner.
- **Spreading the pile is the overview.** Tap the table (or the pile's own tab) and every card is
  dealt out, along with any sealed packs; tap one and the pile is gathered with it on top.
- **Tabs belong to cards.** Scan, Create, Settings and About are four other cards kept at the back
  of the pile, as a deck has jokers and a rules card. Each has an index tab that sticks out below
  the pile; tapping it pulls the card out and lays it on top, and tapping it again (or flicking the
  card away) sends it back. The music cards share one tab, the headphones: from any of the four
  it's the way back to the music, and from the music it spreads the pile.
- **A card has a front and a back, and the front has an inside.** The front is the QR code. The
  bullseye looks through it to the card's bits, lit up as they run: first the code is read,
  module by module, into those bits (and written back out when tracing is turned off). The back is
  what the card holds, as WebAssembly text. A small arrow at the corner, as index cards say "over",
  turns the whole card.
- **Only what the card holds is shown as the card.** What a card was written in (its C, say) isn't
  in the card, so it isn't on its back. Writing happens on the Create tab's card, the workbench,
  which is laid out like a music card with an editor where the QR code goes. It can start from the
  card on the pile ("from ..." in its menu), from that card's source when the app happens to have
  it (the starter pack's ships with the app; what's built here is remembered).
- **Printing** is on the back, with saving the card as a picture: the card as a thing. What's
  printed is the paper layout above, not the panel.
- **A seed is a performance**: the dice locks it, and the heart keeps it with the card.

## Open questions

- The workbench: is "a card like a music card, with an editor on it" right? What it builds is
  loaded as the top card of the pile, but isn't in the deck until its heart is tapped.
- Turning a card over by a small arrow is easy to miss, and has no gesture. (A sideways drag
  already means "next card", which is also how a card turning about its upright axis moves.)
- Descriptions (a line of liner notes from the starter pack or a pack file) aren't in the card
  either. They're kept, and still printed, but shown nowhere on screen. Should the card's own
  title (`d`) carry more, or should they go?
- Should a locked seed be printed on the card (it's already in the link)?
- Things are found by trying them: the spread, the arrow, holding skip, tapping the clock. The
  About card lists them. Is that enough?
- A scanned card just appears on top of the pile; it could be dealt from the Scan card.
