# Browser checks

Ad hoc Playwright scripts used while building the deck, the source face and input cards. They
are not a test suite: they print what they find for a person (or agent) to read, and a few
selectors may have drifted. They are kept because there is nothing else that exercises the app.

    npm run build && npx vite preview --port 4173 &
    node scripts/browser-checks/face.cjs /tmp/out     # the argument is a directory for screenshots

- `face.cjs`: write a card in C, play it, break it, fix it, flip between the card's faces.
- `modes.cjs`: bytebeat and pattern modes, and that a built card's source is remembered.
- `heat.cjs`: tracing from the source side lights up lines of WebAssembly text.
- `packs.cjs`: open the starter pack, export the deck as a pack, import it again.
- `settings.cjs`: the Settings tab's switches and buttons.
- `mic.cjs`: a card that takes input gets the (fake) microphone only while it plays. It expects
  the base43 code of `examples/canyon.wasm` in `<directory>/canyon.b43`.

They need Playwright with Chromium (`require('playwright')`), and they drive the transport with
real mouse events, which matters: the player's buttons act on mousedown.
