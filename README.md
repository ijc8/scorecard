# ScoreCard

[ScoreCard](https://ijc8.me/s) is a player for "score cards": QR codes containing tiny generative music programs.
A score card looks like this:

![Example card](assets/example-card.png)

Each QR code contains a valid URL (linking to this web app, the score card player) and an entire audio-generating WebAssembly program.
Because the QR code contains the piece itself, even if the link breaks, the code can still be read and played back by an instance of the ScoreCard player hosted somewhere else, or by a player that runs outside of the browser.

This also implies that piece must fit in a QR code, implying an max executable size of just 2,953 bytes (more like 2,900 bytes after encoding it in a URL).

## Creating ScoreCards

A ScoreCard consists of a WebAssembly binary, encoded in a URL, encoded in a QR Code.
The binary needs to export a function named `process`, which returns a 32-bit float.
It may optionally export a function named `setup`, which takes a 32-bit integer, and the address of a zero-terminated character array named `title`.
If you already have a suitable `.wasm` file lying around, you can simply drag it into the ScoreCard web app to load it and get the corresponding QR code.

ScoreCards can be created in the web app directly in the "Create" tab.
At the moment, this allows you to write WebAssembly directly (in the [WebAssembly text format](https://developer.mozilla.org/en-US/docs/WebAssembly/Understanding_the_text_format)), and it shows you the disassembly of any program that's currently loaded - allowing you to tweak it by hacking the assembly.
In the future, we may include some higher-level ways of creating ScoreCards inside the app.

Most of the examples in this repository are written in C.
Writing ScoreCards in C requires a compiler toolchain that can target WebAssembly such as [emscripten](https://emscripten.org/). Some scripts are included in `examples/` for building and debugging C examples; see `build.sh` and `debug.sh`.
A modest library for writing scorecards in C is provided in the form of `deck.h`.
Other languages you might be interested in exploring for use with ScoreCard include Zig, Rust, Go, and Faust.

## Credits
Designed and implemented by [Ian Clester](https://ijc8.me).

Libraries:
- [qrcode](https://www.npmjs.com/package/qrcode) (for generating QR codes) by [Ryan Day](https://github.com/soldair)
- [html5-qrcode](https://www.npmjs.com/package/html5-qrcode) (for scanning QR codes) by [Minhaz](https://blog.minhazav.dev/)

Assets:
- [Sysfont](https://sysfont.com/) by [Arne Sava](https://arnesava.com/)
- [Pixel Art Icons](https://pixelarticons.com/) by [Gerrit Halfmann](https://twitter.com/halfmage)
- Tabs from [Mac OS 9: UI Kit](https://www.figma.com/community/file/966779730364082883) by [Michael Feeney](https://swallowmygraphicdesign.com/)
