// deck: a utility library for writing score cards

#ifdef __EMSCRIPTEN__
    #include <emscripten.h>

    EMSCRIPTEN_KEEPALIVE void setup(unsigned int seed);
    EMSCRIPTEN_KEEPALIVE float process();
#else
    // This supports debugging by running natively.
    // To use this, just do an ordinary (non-Emscripten) build,
    // and run the program with the output piped into `sox -tf32 -r 44.1k - -d`.
    // (To generate debug output, just print to stderr instead of stdout.)
    #define EMSCRIPTEN_KEEPALIVE
    #include <stdio.h>
    #include <time.h>

    void setup(unsigned int seed) __attribute__((weak));
    float process();

    int main() {
        if (setup) {
            setup(time(NULL));
        }
        for (;;) {
            float x = process();
            fwrite(&x, 4, 1, stdout);
        }
        return 0;
    }
#endif

#include <stdlib.h>
#include <math.h>
#include "generator.h"

#define card_title(s) EMSCRIPTEN_KEEPALIVE char title[] = s
#define setup_rand void setup(unsigned int seed) { srand(seed); }

#define SIZEOF(arr) (sizeof(arr) / sizeof(*arr))

float dt = 1.0 / 44100.0;

// Randomness
#define choice(arr) (arr[rand() % SIZEOF(arr)])

float uniform(float a, float b) {
    return rand() / (float)RAND_MAX * (b - a) + a;
}

float noise() {
    return rand() / (float)RAND_MAX * 2 - 1;
}

// Oscillators
typedef float (*osc_func)(float *state, float freq);

#define define_osc(name, expression) \
    float name(float *pphase, float freq) { \
        const float phase = *pphase; \
        float x = expression; \
        *pphase += freq * dt; \
        *pphase -= truncf(*pphase); \
        return x; \
    }

define_osc(sqr, phase < 0.5 ? -1 : 1)
define_osc(saw, phase * 2 - 1)
define_osc(tri, (phase < 0.5 ? phase : 1 - phase) * 2 - 1)

// Envelopes
float env(float t, float dur) {
    float x = 1 - t / dur;
    return x * x;
}

float env_gen(float *t, float dur) {
    float x = 1 - *t / dur;
    *t += dt;
    return x * x;
}

float ad(float t, float attack, float decay) {
    return t < attack ? (t / attack) : (1 - (t - attack) / decay);
}

float ramp(float t, float dur, float start, float end) {
    return t / dur * (end - start) + start;
}

// Misc
float m2f(int pitch) {
    // This approach saves 458 bytes compared to using powf(),
    // with the downside that it only handles 12TET.
    float freq = 440;
    pitch -= 69;
    while (pitch-- > 1) freq *= 1.0594630943592953;
    while (pitch++ < 0) freq *= 0.9438743126816935;
    return freq;
}

#define sleep(t, dur) for (; t < dur; t += dt) yield(0); t -= dur
#define resleep(t, dur) for (; t < dur; t += dt) reyield(0); t -= dur
