// emcc -Oz test.c -Wall --no-entry -s SUPPORT_ERRNO=0 -s SUPPORT_LONGJMP=0 -o test.wasm
#include <emscripten.h>
#include <math.h>

#define SIZEOF(arr) (sizeof(arr) / sizeof(*arr))

float dt = 1.0 / 44100.0;

float notes[][2] = {{60, 0.5}, {64, 0.25}, {67, 0.25}, {70, 1.0}};

EMSCRIPTEN_KEEPALIVE
float process() {
    // Let's pretend we're a coroutine!
    // Boilerplate
    static int state = 0;
    switch (state) {
        case 0: goto label0;
        case 1: goto label1;
    }
    // Persistent locals
    static int i;
    static float t, freq, dur;
    // Start of function
    label0:
    for (i = 0; i < SIZEOF(notes); i++) {
        freq = powf(2, (notes[i][0] - 69) / 12) * 440;
        dur = notes[i][1];
        for (t = 0; t < dur; t += dt) {
            float x = t * freq;
            x = (x - truncf(x)) * 2 - 1;
            state = 1; return x; label1:;
        }
    }
    return 0;
}
