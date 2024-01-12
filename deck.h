// deck: a utility library for writing score cards

#ifdef __EMSCRIPTEN__
    #include <emscripten.h>
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

#include <math.h>

#define SIZEOF(arr) (sizeof(arr) / sizeof(*arr))
#define choice(arr) (arr[rand() % SIZEOF(arr)])

const float dt = 1.0 / 44100.0;

float m2f(int pitch) {
    // This approach saves 458 bytes compared to using powf(),
    // with the downside that it only handles 12TET.
    float freq = 440;
    pitch -= 69;
    while (pitch-- > 1) freq *= 1.0594630943592953;
    while (pitch++ < 0) freq *= 0.9438743126816935;
    return freq;
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
float env(float *t, float dur) {
    float x = 1 - *t / dur;
    *t += dt;
    return x * x;
}
