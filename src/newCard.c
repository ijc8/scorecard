#include "deck.h"

card_title("my card");
setup_rand;

// A wandering tune: random notes from a pentatonic scale.
const char scale[] = {0, 2, 4, 7, 9, 12};

float process() {
    static float phase, freq, dur, t;
    gen_begin;
    for (;;) {
        freq = m2f(60 + choice(scale));
        dur = rand() % 2 ? 0.25 : 0.5;
        for (; t < dur; t += dt) {
            yield(tri(&phase, freq) * env(t, dur));
        }
        t -= dur;
    }
    gen_end(0);
}
