#include "../deck.h"
#include "common.h"

card_title("lead");
setup_rand;

const int scale[] = {-5, -2, 0, 3, 5, 7, 10, 12, 3};

const float dur = 60 / tempo / 2;

float process() {
    static float freq, phase, tri_phase, t = 0;
    gen_begin;
    freq = m2f(choice(scale) + 72);
    for (; t < dur; t += dt) {
        float mod = sqr(&tri_phase, freq / 8) * (1 - env(t, dur));
        yield(sqr(&phase, freq * (1 + mod/2)) * ad(t, 0.01, dur - 0.01));
    }
    gen_end(0);
}
