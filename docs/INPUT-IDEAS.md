# Cards that listen: ideas

A page of ideas (2026-11-25), none of them built. Today a card whose `p` takes a sample is handed
the microphone, one sample at a time, and returns what's played (`#define INPUT` in C; `canyon.c`
is the one example, a ring-modulated echo). Ian isn't sure such cards should ship: they widen what
a score card is. So the first question for each idea is whether it's still a *score*.

## What the form gives a listening card

- **One sample in, one out, 44.1 kHz, mono.** No look-ahead; any memory is the card's own.
- **A seed**, as for any card. A listening card can still be generative: the seed picks the tuning,
  the delay times, the rules.
- **About 2,900 bytes** (or ~4,300 of program, packed). An FFT doesn't fit comfortably; filters,
  delays, envelope followers, zero-crossing counters and autocorrelation over a short window do.
- **Latency**: the browser's input plus output buffers, tens of milliseconds at best and much more
  on some phones, with echo cancellation mangling the input unless it's turned off. Anything that
  needs tight timing against the player's own playing (a looper in time, a harmonizer you sing
  with) will feel late through a phone speaker. Ideas that like delay are safer.
- **Feedback**: speaker to microphone is a loop. Mostly a hazard, sometimes the instrument.

## Scores for a room (the card is still a piece)

These treat the input as material for a composition that the card fixes, in the line of Lucier and
Oliveros. They seem closest to the project's spirit: the card says how the music goes, and the
room supplies the notes.

1. **Sitting in a card.** After *I am sitting in a room*: record a few seconds, play it back into
   the room while recording again, for ever. The room's resonances take over. The card is tiny (a
   delay line and a level control), needs a speaker rather than headphones, and wants echo
   cancellation off. The seed could choose the loop length.
2. **Slow echo.** Everything heard comes back a minute later, and again a minute after that, more
   quietly and an octave down each time. A piece for a dinner table.
3. **Drone from the room.** A bank of a dozen sharp resonators (tuned by the seed to a chord);
   whatever happens in the room rings them. Silence when the room is silent.
4. **Shadow.** The card follows the loudness of the room and plays its own generative music only
   in the gaps, getting out of the way when anyone speaks: a card that's polite. Or the opposite.
5. **Canon with yourself.** Sing a line; the card answers with it a bar later, then two voices,
   then three, each a fifth apart (a varispeed delay does the transposing). The seed sets the
   intervals and the spacing.
6. **Feedback study.** The card deliberately closes the loop through the room and tames it: a
   slow limiter and a wandering notch keep it singing at the edge without howling. Each room (and
   each phone) gives a different piece. Risky for ears; needs a hard ceiling on level.

## Instruments (the card is something you play)

7. **Vocoder by envelope.** The card's own generative chords, shaped by the loudness of your
   voice in three or four bands. Cheap: band filters and followers, no FFT.
8. **Clap sequencer.** Claps (onsets above a threshold) are the clock: each one steps a seeded
   melody on. Clap faster and it speeds up. Latency matters less because the clap is the downbeat.
9. **Hum to bass.** Track the pitch of a hummed note (zero crossings after a low-pass, or a short
   autocorrelation) and double it an octave or two down with a synthesized bass.
10. **Whistle organ.** A whistle is nearly a sine, so its pitch is easy to follow: the card
    harmonizes it with stacked fifths, or quantizes it to a seeded scale and holds the note.
11. **Sampler.** The first second of sound after pressing play becomes the card's only
    instrument, played back by a seeded sequencer at different speeds. Every performance has a
    different timbre: a cough, a door, a word.

## Cards that talk to each other

12. **Acoustic handshake.** Two phones playing the same card listen for each other's pulses and
    drift into time (fireflies). No network: the room is the wire. A group piece for a table of
    phones, which is how score cards are already handed round.
13. **Telephone.** Each phone repeats what it hears a few seconds later, transposed by its seed.
    A phrase sung into the first comes back changed from the last.
14. **A card that reads cards.** One card plays a slow sequence of tones that another card hears
    as data: a seed, or a few parameters, passed by sound from phone to phone.

## Things to settle before any of them ship

- **Is the microphone part of the form?** A printed card that asks for the microphone when scanned
  is a different proposition from one that just plays. The card already shows a "listens" mark,
  and the player only asks for the microphone when such a card is played.
- **What does a listening card do with no microphone** (permission refused, or a player without
  one)? Today it gets silence in. Good listening cards should still be pieces then (4, 8 and 12
  degrade well; 1 and 11 are nothing without input).
- **Echo cancellation** is on by default (Settings) to stop howling, and it wrecks 1, 6 and 12.
  A card can't say which it wants. Should it be able to (a flag in the card), or is that the
  performer's job, like choosing headphones?
- **iOS** switches the audio session to play-and-record when the microphone opens, which changes
  the route and the level. Not yet tried.
- **Stereo, or a second input** (line in, another tab) would open more, and is more ABI.

If one were to be built first, **12 (the handshake)** says the most about what score cards are for,
and **1 (sitting in a card)** is the smallest and the most plainly a score.

## Built since (11-25), as things to try

- **1** is `examples/sitting.c` (385 bytes). Each turn is played back as loud as the first, so the
  level neither dies away nor runs off; a silent room stays silent.
- **12** is `examples/fireflies.c` (849 bytes). Each blinks a note about every 1.2 s and hurries its
  next blink when it hears another. Tried only in simulation (phones that hear each other 120 ms
  late): three or five fall within 30 to 60 ms of each other in under half a minute, and keep their
  own time if they can't hear each other. Not yet tried with real phones in a real room.
