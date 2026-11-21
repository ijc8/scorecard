# ScoreCard

[ScoreCard](https://ijc8.me/s) is a player for "score cards": QR codes containing tiny generative music programs.
A score card looks like this:

![Example card](https://github.com/ijc8/scorecard/assets/99575/47d1fb4b-0b24-450b-bc03-ce00dfa6f575)

Each QR code contains a valid URL (linking to this web app, the score card player) and an entire audio-generating WebAssembly program.
Because the QR code contains the piece itself, even if the link breaks, the code can still be read and played back by an instance of the ScoreCard player hosted somewhere else, or by a player that runs outside of the browser.

This also implies that piece must fit in a QR code, implying an max executable size of just 2,953 bytes (more like 2,900 bytes after encoding it in a URL).

## Creating Score Cards

### What exactly is a score card?
A score card consists of a musical program, assembled or compiled into a WebAssembly binary, encoded in a URL, encoded in a QR Code, displayed on an object (e.g. a paper card or a phone screen). Nothing to it!

The binary needs to export a function named `p` (for "process"), which returns a 32-bit float (the next audio sample). It may optionally export a function named `s` (for "setup"), which takes a 32-bit integer (a seed), and the address of a zero-terminated character array named `d` (for "description"), which may be displayed to the user in the player. (If `d` is exported, the memory must also be exported as `m`.) These export names as short as possible to maximize space for the code.

If you already have a suitable `.wasm` file lying around, you can simply drag it into the ScoreCard web app to load it and get the corresponding QR code.

### How can I make one?
**Try following the along with the [workshop tutorial](https://ijc8.me/nime2024/)**, which includes a series of increasingly-complex examples with explanations.

Score cards can be created in the web app directly in the "Create" tab, which allows you to write WebAssembly directly (in the [WebAssembly text format](https://developer.mozilla.org/en-US/docs/WebAssembly/Understanding_the_text_format)).
It also shows you the disassembly of any program that's currently loaded, allowing you to tweak it by hacking the assembly.
(In the future, we may include some higher-level ways of creating ScoreCards inside the app.)

Score cards can also be written in C, as are most of the examples in this repository.
Writing score cards in C requires a compiler toolchain that can target WebAssembly such as [emscripten](https://emscripten.org/).
Fortunately, **the [ScoreCard Creator](https://ijc8.me/scorecard-creator/) allows you to write score cards in C directly in your browser**, without installing anything, thanks to [emception](https://github.com/jprendes/emception)!

If you'd rather use a local toolchain, some scripts are included in `examples/` for building and debugging C examples; see [`build.sh`](examples/build.sh) and [`debug.sh`](examples/debug.sh).
A modest library for writing scorecards in C is provided in the form of [`deck.h`](examples/deck.h).

The player's Library tab offers a shelf of ready-made cards. Their sources live in [`examples/library`](examples/library); after adding or changing one, run [`examples/library/build.sh`](examples/library/build.sh) to rebuild them all and regenerate the index the tab reads (`src/library.json`).

Other languages you might be interested in exploring for use with ScoreCard include Zig, Rust, Go, and Faust. [`strip.sh`](examples/strip.sh) may also be helpful in these cases for removing or renaming exports.

## Links
- [WAC paper](https://ijc8.me/static/scorecard.pdf)
- [NIME workshop materials](https://ijc8.me/nime2024)

## Credits
Designed and implemented by [Ian Clester](https://ijc8.me).

Libraries:
- [qrcode](https://www.npmjs.com/package/qrcode) (for generating QR codes) by [Ryan Day](https://github.com/soldair)
- [html5-qrcode](https://www.npmjs.com/package/html5-qrcode) (for scanning QR codes) by [Minhaz](https://blog.minhazav.dev/)

Assets:
- [Sysfont](https://sysfont.com/) by [Arne Sava](https://arnesava.com/)
- [Pixel Art Icons](https://pixelarticons.com/) by [Gerrit Halfmann](https://twitter.com/halfmage)
- Tabs from [Mac OS 9: UI Kit](https://www.figma.com/community/file/966779730364082883) by [Michael Feeney](https://swallowmygraphicdesign.com/)

[ScoreCard Creator](https://github.com/ijc8/scorecard-creator) is built on [emception](https://github.com/jprendes/emception) by [jprendes](https://github.com/jprendes)
