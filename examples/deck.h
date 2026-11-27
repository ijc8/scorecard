// deck: a utility library for writing score cards

#ifdef __EMSCRIPTEN__
    #include <emscripten.h>

    EMSCRIPTEN_KEEPALIVE void setup(unsigned int seed);
    // A card that defines INPUT before including this file is an effect: its process() is handed
    // a sample of incoming sound (from the microphone) each time, as `float process(float in)`.
    #ifdef INPUT
        EMSCRIPTEN_KEEPALIVE float process(float in);
    #else
        EMSCRIPTEN_KEEPALIVE float process();
    #endif

    #define debug(...)
#else
    // This supports debugging by running natively.
    // To use this, just do an ordinary (non-Emscripten) build,
    // and run the program with the output piped into `sox -tf32 -r 44.1k - -d`.
    // (To generate debug output, just print to stderr instead of stdout.)
    #define EMSCRIPTEN_KEEPALIVE
    #include <stdio.h>
    #include <time.h>

    #define debug(...) fprintf(stderr, __VA_ARGS__)

    void setup(unsigned int seed) __attribute__((weak));
    #ifdef INPUT
        float process(float in);
    #else
        float process();
    #endif

    int main() {
        if (setup) {
            setup(time(NULL));
        }
        for (;;) {
            #ifdef INPUT
                // An effect reads its input (raw f32 samples, like its output) from stdin.
                float in = 0;
                if (!fread(&in, 4, 1, stdin)) return 0;
                float x = process(in);
            #else
                float x = process();
            #endif
            fwrite(&x, 4, 1, stdout);
        }
        return 0;
    }
#endif

#include <stdlib.h>
#include <math.h>
#include <inttypes.h>
#include "generator.h"

#define card_title(s) EMSCRIPTEN_KEEPALIVE char title[] = s
#define setup_rand void setup(unsigned int seed) { srand(seed); }

#define SIZEOF(arr) (sizeof(arr) / sizeof(*arr))

#define SAMPLE_RATE (44100.0)
float dt = 1.0 / SAMPLE_RATE;

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
define_osc(tri, (phase < 0.5 ? phase : 1 - phase) * 4 - 1)

// One cycle of a sine for phase in [0, 1), approximated with parabolas.
// (Saves pulling in sinf(); the error is under 0.1%.)
float sin1(float phase) {
    float x = phase * 2 - 1;
    float y = 4 * x * (fabsf(x) - 1);
    return 0.225f * (y * fabsf(y) - y) + y;
}

define_osc(sine, sin1(phase))

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

// Filters & effects
// One-pole lowpass. `a` is the smoothing coefficient in (0, 1]: roughly 2*pi*cutoff/SAMPLE_RATE.
float lp1(float *state, float x, float a) {
    return *state += a * (x - *state);
}

// Resonant lowpass (Chamberlin state-variable filter).
// `f` is roughly 2*pi*cutoff/SAMPLE_RATE (keep it below ~1); `damp` is 1/Q (2 = no resonance).
typedef struct { float lp, bp; } svf_t;

float svf(svf_t *s, float x, float f, float damp) {
    s->lp += f * s->bp;
    s->bp += f * (x - s->lp - damp * s->bp);
    return s->lp;
}

// Feedback delay line: returns the delayed signal. `buf` should be zero-initialized
// (static buffers cost no bytes in the binary).
float delay(float *buf, int size, int *pos, float x, float feedback) {
    float out = buf[*pos];
    buf[*pos] = x + out * feedback;
    *pos = (*pos + 1) % size;
    return out;
}

// Soft clipper: roughly linear when quiet, saturating smoothly at +/-1.
float soft_clip(float x) {
    if (x > 1) return 1;
    if (x < -1) return -1;
    return x * (1.5f - 0.5f * x * x);
}

// Plucked string (Karplus-Strong). Call `pluck` to (re)start a note, then `string` once per sample.
#define STRING_MIN_FREQ 40
typedef struct {
    float buffer[44100 / STRING_MIN_FREQ + 2];
    float frac, prev;
    int size, index;
} string_t;

void pluck(string_t *s, float freq) {
    float period = SAMPLE_RATE / freq;
    s->size = (int)period + 1;
    s->frac = s->size - period;
    s->index = 0;
    for (int i = 0; i < s->size; i++) s->buffer[i] = noise();
}

float string(string_t *s) {
    if (!s->size) return 0;
    int next = (s->index + 1) % s->size;
    float out = s->buffer[s->index] * (1 - s->frac) + s->buffer[next] * s->frac;
    s->buffer[s->index] = (s->prev + out) / 2;
    s->prev = out;
    s->index = next;
    return out;
}

// Small PRNG with explicit state (xorshift32), for when several voices
// need their own reproducible random streams. The state must be nonzero.
uint32_t xorshift(uint32_t *state) {
    uint32_t x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return *state = x;
}

// Misc
// float m2f(float pitch) {
//     return powf(2, (pitch - 69)/12.0) * 440;
// }

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
