// emcc test.c --no-entry -lm -o test.wasm
#include <emscripten.h>
#include <math.h>

float t = 0;
float dt = 1.0 / 44100.0;

EMSCRIPTEN_KEEPALIVE
float process() {
    float x = t * 2 - 1;
    t = fmodf(t + 300.0 * dt, 1);
    return x;
}
