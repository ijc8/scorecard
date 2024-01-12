#include <math.h>

#define SIZEOF(arr) (sizeof(arr) / sizeof(*arr))

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
typedef float (*osc_func)(void *state, float freq);

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
