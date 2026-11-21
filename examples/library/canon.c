// A wandering melody chases itself: three voices, each entering later and lower.
#include "../deck.h"

card_title("canon in three");

#define VOICES 3

// Pentatonic, so the voices agree with each other wherever they land.
const char scale[] = {0, 2, 4, 7, 9};
const char durs[] = {1, 1, 1, 2, 2, 3, 4};
const osc_func oscs[VOICES] = {tri, sqr, saw};
const float amps[VOICES] = {0.5f, 0.15f, 0.3f};

int root;
float beat;
unsigned int melody_seed;

regen_vars(voice,
    uint32_t rng;
    int degree;
    float t, dur, freq, phase, lp;
)
// Every voice draws from its own copy of the same random stream,
// so each plays the same melody: just later, and `drop` scale steps lower.
float voice(voice_state *self, float wait, int drop, osc_func osc, float amp) {
    regen_begin;
    self->rng = melody_seed;
    self->degree = 12;
    resleep(self->t, wait);
    for (;;) {
        // Random walk, bouncing off the ends of the range.
        self->degree += xorshift(&self->rng) % 5 - 2;
        if (self->degree < 8) self->degree += 3;
        if (self->degree > 20) self->degree -= 3;
        self->dur = durs[xorshift(&self->rng) % SIZEOF(durs)] * beat;
        if (xorshift(&self->rng) % 8 == 0) {
            resleep(self->t, self->dur);
            continue;
        }
        int d = self->degree - drop;
        self->freq = m2f(root + d / 5 * 12 + scale[d % 5]);
        for (; self->t < self->dur; self->t += dt) {
            float x = osc(&self->phase, self->freq) * ad(self->t, 0.01f, self->dur - 0.01f);
            reyield(lp1(&self->lp, x, 0.2f) * amp);
        }
        self->t -= self->dur;
    }
    regen_end(0);
}

void setup(unsigned int seed) {
    srand(seed);
    melody_seed = seed | 1;
    root = 36 + rand() % 12;
    beat = uniform(0.16, 0.24);
}

float process() {
    static voice_state states[VOICES];
    float out = 0;
    for (int i = 0; i < VOICES; i++) {
        out += voice(&states[i], i * 16 * beat, i * 4, oscs[i], amps[i]);
    }
    return out;
}
