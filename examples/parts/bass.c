#include "../deck.h"
#include "common.h"

card_title("bass");
setup_rand;

const int chords[][4] = {{0, 2, 4}, {3, 5, 7}};
const int scale[] = {0, 2, 3, 5, 7, 9, 10, 12};

const float dur = 60 / tempo;
const float hold_dur = dur / 2;
const float walk_dur = dur / 4;

#define filter_n (100)

float process() {
    static int degree, next_degree;
    static float phase, sleep_dur, prev[filter_n];
    static int c, walk_dir, walk_steps;
    static float t = 0;
    gen_begin;
    next_degree = choice(chords[c]);
    degree = next_degree;
    for (c = 0;; c = (c + 1) % SIZEOF(chords)) {
        next_degree = choice(chords[c]);
        walk_dir = next_degree < degree ? -1 : 1;
        walk_steps = abs(degree - next_degree) - 1;
        if (walk_steps < 0) walk_steps = 0;
        sleep_dur = dur*4 - hold_dur - walk_steps * walk_dur;
        debug("%d %d\n", degree, next_degree);
        debug("hey %f %f %f\n", hold_dur, sleep_dur, hold_dur + sleep_dur + walk_steps * walk_dur);
        // Chord tone
        for (; t < hold_dur; t += dt) {
            float x = saw(&phase, m2f(scale[degree] + 36));
            for (int i = 0; i < filter_n * env(t, hold_dur); i++) {
                x = lpf(&prev[i], x);
            }
            yield(x * ad(t, 0.02, hold_dur - 0.02));
        }
        t -= hold_dur;
        // Rest
        sleep(t, sleep_dur);
        // Walk into next measure
        degree += walk_dir;
        for (; walk_steps > 0; walk_steps--) {
            for (; t < walk_dur; t += dt) {
                float x = saw(&phase, m2f(scale[degree] + 36));
                // TODO: pull this out into a utility function
                for (int i = 0; i < filter_n * env(t, walk_dur); i++) {
                    x = lpf(&prev[i], x);
                }
                yield(x * ad(t, 0.02, walk_dur - 0.02));
            }
            t -= walk_dur;
            degree += walk_dir;
        }
        degree = next_degree;
    }
    gen_end(0);
}
