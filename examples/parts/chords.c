#include "../deck.h"
#include "common.h"

card_title("chords");
setup_rand;

const int chords[][4] = {{0, 2, 4, 6}, {0, 2, 3, 5}};
const int scale[] = {0, 2, 3, 5, 7, 9, 10};

const float dur = 60 / tempo / 2;

float process() {
    static struct {
        float freq;
        float sqr_phase;
    } notes[SIZEOF(chords[0])];
    static int c, i, j;
    static int degrade = 12;
    static float t = 0;
    gen_begin;
    for (c = 0;; c = (c + 1) % SIZEOF(chords)) {
        debug("degrade %d\n", degrade);
        for (int k = 0; k < SIZEOF(notes); k++) {
            notes[k].freq = m2f(scale[chords[c][k]] + 60);
        }
        for (j = 0; j < 8; j++) {
            if (j > 0 && (rand() % degrade) > 0) {
                // Sit this one out.
                sleep(t, dur);
                continue;
            }
            for (int k = 0; k < SIZEOF(notes); k++) {
                notes[k].sqr_phase = 0;
            }
            for (; t < dur; t += dt) {
                float x = 0;
                for (i = 0; i < SIZEOF(notes); i++) {
                    x += sqr(&notes[i].sqr_phase, notes[i].freq) * env(t, dur);
                }
                yield(x / SIZEOF(notes));
            }
            t -= dur;
        }
        if (degrade > 2) degrade--;
    }
    gen_end(0);
}
