#include "deck.h"

card_title("lick spiral");

struct { char pitch; char dur; } notes[] = {
    {62, 1}, {64, 1}, {65, 1}, {67, 1},
    {64, 2}, {60, 1}, {62, 1},
};

float process() {
    static float phases[2];
    static float freq, dur, base_dur = 0.25, t = 0;
    static int offset = 0, i;
    gen_begin;
    for (;; offset = (offset + 1) % 12) {
        for (i = 0; i < SIZEOF(notes); i++) {
            freq = m2f(notes[i].pitch + offset);
            dur = notes[i].dur * base_dur;
            for (; t < dur; t += dt) {
                float pos = t / dur;
                pos = (i + pos) / SIZEOF(notes);
                pos = (offset + pos) / 12;
                float x = pos*tri(&phases[0], freq/2)
                    + (1-pos)*tri(&phases[1], freq);
                yield(x * ad(t, dur/8, dur*7/8));
            }
            t -= dur;
        }
    }
    gen_end(0);
}
