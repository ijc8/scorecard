# What a score card is, and what it looks like

A working note (2026-11-24) behind the "printed card" look in the player (Settings > Card look).
It's a proposal, not a decision.

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
in decks, piles, boxes and wallets, and pass them around. That's what the deck, the packs and the
rolodex in the player are about.

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
- **Name and size together under the code**, as a caption. Above the code (as the player used to
  have them) they read like a window title.

A **back**, for double-sided or folded cards, could carry what's for people rather than phones:
the source (the score in the Fluxus sense), "scan with your phone's camera", and the player's
address written out. The source face in the player is already this back.

Sizes: a thermal strip makes 72 mm x ~115 mm cards; four to a Letter page (the Halloween PDF)
is about playing-card size. Packs could have a **rules card** (in the printed look, the About tab
is drawn as one).

## In the player

The question Ian asked about the rolodex: where does the card end and the player begin? The
classic look blurs it. The whole app is a white panel with the wordmark on top and tabs along its
foot, so it reads as one big card, with a smaller "card" (title, size, QR) inside it, and
controls on both.

Two coherent answers:

- **A. The panel is the card.** Make the whole thing one card, with its controls printed on it,
  like a control card.
- **B. The card lies on a player.** The card is drawn just as it's printed; the player is
  everything else: a surface, a transport, a tray of things to do with the card, and tabs that are
  the player's modes.

The prototype tries **B** (the default for now; switch back in Settings). Your printed cards
have no buttons, and in B a screenshot of the card is the card. In detail:

- **The card**: wordmark, QR code, "name | bytes", description (from the deck or the starter pack),
  with an edge and a slight shadow. Nothing on it can be pressed, except swiping it in the rolodex.
- **Turning it over** shows the back: name, then the source. Tracing ("Inside") fades the front to
  the card's bits: looking inside the card, not turning it.
- **The player**: the clock, transport and seed in one row; below it a tray: Keep, Inside, Turn
  over, Print. The tabs are the player's modes: Listen (the card on the player), Scan (the slot
  cards come in by), Create (the card turned over, to write on), Settings, and About, drawn as a rules card.
- **The deck** holds the same cards, small. In a pile, cards show an index strip on top (name and
  size), as index cards in a box do; the rolodex shows those strips behind the current card.
- **Print** makes the card as drawn on screen, black and white at the printer's width. You can
  save it as a picture, share it to the printer's app, or send it straight to a Bluetooth thermal
  printer over Web Serial.

## Open questions

- Should a locked seed be printed on the card (it's already in the link)? Perhaps as a small
  "performance no. 3XK9QZ" under the name.
- Does the lavender "table" read as a surface, or would white paper on a dark table be clearer?
- The deck minis still put the name above the QR (it's their index strip). Fine for piles, but
  different from the big card.
- A sealed pack's look and a rules card's look for printing.
- Model A deserves a sketch before B is settled.
