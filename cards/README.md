# cards/: "most impressive ScoreCard" experiments (branch `impressive-fable`)

Three cards written in freestanding C, plus the tools used to build and check them without
emscripten or a pair of ears.

| card | what | wasm bytes | QR |
| --- | --- | --- | --- |
| `scat-radio.c` | endless generated pop songs: scat singer, harmony singer, choir, plucked strings, FM bass, drums, echo, reverb | 2842 | 40-L |
| `choir.c` | endless ambient piece: eight formant singers on loops of different lengths, a harp, long reverb | 1405 | 27-L |
| `acid.c` | endless acid-techno jam: 303-style line with a mutating pattern, kick, clap, hats | 1168 | 25-L |

## Tools

- `build.sh foo.c`: zig (clang) to wasm32-freestanding, `wasm-ld`, binaryen `wasm-opt -Oz`, then
  `globalize.py`. Cards export `p`/`s`/`d`/`m` directly, so there is no rename pass. Needs `zig`
  on the path and `npm i` in `tools/` (binaryen).
- `globalize.py`: size pass that moves 4-byte scalars from linear memory into wasm globals
  (a global access is 2 bytes, a constant-address load/store about 6). Output is sample-identical;
  check with `GLOBALIZE=0 ./build.sh foo.c`.
- `render.mjs card.wasm out.wav [seconds] [seed] [start]`: offline render the way the worklet
  plays it, with peak/RMS/NaN stats.
- `qr.mjs card.wasm [out.png]`: base43 URL and QR exactly as `src/App.tsx` makes them; fails if
  the card does not fit. (Uses the repo's `qrcode` dependency, so run `npm ci` in the repo root.)
- `verify-qr.py card.png card.wasm`: decodes the PNG with ZXing and compares the payload
  byte-for-byte (needs `zxing-cpp`, `pillow`).
- `browser-test.mjs card.wasm [chromium|webkit]`: loads the card URL in the real player under
  Playwright (muted), presses Play, checks title, clock, audio level and the trace toggle.
- `trace.sh foo.c [seed] [seconds]`: native debug build of `scat-radio.c` that prints the score
  (key, tempo, chords, melody) instead of playing.
- `stems.sh foo.c`, `peaks.mjs`, `bands.sh`: per-stem levels, spectral peaks with note names, and
  band energy; used to tune and balance by measurement.

## Things that bit

- There is no stack (`-z stack-size=0`): a local array silently overlaps the globals. Keep arrays static.
- Big buffers sit at fixed addresses above the linker's data (`--initial-memory` is 1 MiB), so
  they cost no bytes.
- `wasm-opt --low-memory-unused` breaks these builds (LLVM uses negative loop offsets). Don't add it.
- 2892 bytes is the most that fits with the `https://ijc8.me/s?c=` prefix; 2884 leaves room for a
  locked seed (`s=...&`).
