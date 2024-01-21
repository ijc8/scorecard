#include "deck.h"

card_title("pluck");
setup_rand;

#define MIN_FREQ 30
regen_vars(strum,
    float buffer[(int)(SAMPLE_RATE / MIN_FREQ)];
    float frac, prev;
    int size, index;
)
float strum(strum_state *self, float freq) {
    regen_begin;
    float delay = SAMPLE_RATE / freq;
    self->prev = 0;
    self->index = 0;
    self->size = (int)delay + 1;
    self->frac = self->size - delay;
    for (int i = 0; i < self->size; i++) {
        self->buffer[i] = noise();
    }
    for (;;) {
        float out = self->buffer[self->index]*(1-self->frac) + self->buffer[(self->index + 1) % self->size]*self->frac;
        self->buffer[self->index] = (self->prev + out) / 2;
        self->prev = out;
        self->index = (self->index + 1) % self->size;
        reyield(out);
    }
    regen_end(0);
}

// Adapted from Bach's Cello Suite No. 1 in G Major BWV 1007
// (by way of https://dittytoy.net/ditty/0c920dd635)
const char d3 = 50, a3 = 57, fs4 = 66, e4 = 64, g4 = 67, b3 = 59, cs4 = 61,
    d4 = 62, fs3 = 54, gs3 = 56, a4 = 69, gs4 = 68, b2 = 47, e3 = 52, a2 = 45;
char notes[] = {
    d3,a3,fs4,e4,fs4,a3,fs4,a3,d3,a3,fs4,e4,fs4,a3,fs4,a3,
    d3,b3,g4,fs4,g4,b3,g4,b3,d3,b3,g4,fs4,g4,b3,g4,b3,
    d3,cs4,g4,fs4,g4,cs4,g4,cs4,d3,cs4,g4,fs4,g4,cs4,g4,cs4,
    d3,b3,fs4,e4,fs4,d4,cs4,d4,b3,d4,cs4,d4,fs3,a3,gs3,fs3,
    gs3,d4,e4,d4,e4,d4,e4,d4,gs3,d4,e4,d4,e4,d4,e4,d4,
    cs4,e4,a4,gs4,a4,e4,d4,e4,cs4,e4,d4,e4,a3,cs4,b3,a3,
    b2,fs3,d4,cs4,d4,fs3,d4,fs3,b2,fs3,d4,cs4,d4,fs3,d4,fs3,
    b2,gs3,a3,b3,a3,gs3,fs3,e3,d4,cs4,b3,a4,gs4,fs4,e4,d4,
    a2,b3,cs4,a4,e4,a4,cs4,e4,g4,b3,cs4,e4,g4,e4,cs4,a3,
};

float process() {
    static strum_state state;
    static float freq, dur, amp, t;
    static int i = 0;
    gen_begin;
    for (;; i = (i + 1) % SIZEOF(notes)) {
        regen_init(state);
        freq = m2f(notes[i]) + uniform(-1, 1);
        dur = 0.25 + uniform(0, 0.02);
        amp = (uniform(0, 1) + 0.5 + (i % 8 == 0 ? 0.8 : 0)) * 0.5;
        for (; t < dur; t += dt) {
            yield(strum(&state, freq) * amp);
        }
        t -= dur;
    }
    gen_end(0);
}
