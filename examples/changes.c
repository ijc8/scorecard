// Change ringing: a ring of six to eight bells rings Plain Bob, each row a permutation of the last
// in which no bell moves more than one place. The seed is the tower (how many bells, how heavy, how
// fast) and the conductor (where the bobs are called), so each seed is a different touch.
#include "deck.h"

card_title("changes");

#define MOST 8
#define PARTIALS 5

// A bell's partials: hum, prime, tierce (a minor third: the sound of a bell), quint and nominal.
const float ratios[] = {0.5f, 1, 1.2f, 1.5f, 2}, weights[] = {0.5f, 0.7f, 0.6f, 0.25f, 1}, decays[] = {0.99998f, 0.99994f, 0.9999f, 0.9998f, 0.99985f};
const char major[] = {0, 2, 4, 5, 7, 9, 11, 12};

struct {
    float freq, phase[PARTIALS], amp[PARTIALS];
} bells[MOST];

int bells_n, row[MOST], place, rows = -4, t, beat;

// Bells in adjacent places change places, in pairs from `from` up to (not including) `to`.
void cross(int from, int to) {
    for (; from + 1 < to; from += 2) {
        int bell = row[from];
        row[from] = row[from + 1];
        row[from + 1] = bell;
    }
}

void setup(unsigned int seed) {
    srand(seed);
    bells_n = 6 + rand() % 3;
    beat = 44100 * (17 + rand() % 8) / 100;
    int tenor = 60 + rand() % 8;
    for (int i = 0; i < bells_n; i++) {
        row[i] = i;
        // The treble is the highest bell, and the tenor the lowest.
        bells[i].freq = m2f(tenor + major[bells_n - 1 - i]);
    }
}

float process() {
    if (++t >= beat) {
        t = 0;
        if (place < bells_n) {
            for (int i = 0; i < PARTIALS; i++) bells[row[place]].amp[i] = weights[i];
        }
        // (After every second row, at the handstroke, the bells leave a beat's gap.)
        if (++place >= bells_n + (rows & 1)) {
            place = 0;
            // After a few rows of rounds: all the pairs cross, then all but the bell that leads; and
            // at the end of each lead (when the treble is back in front) the bell in second place stays
            // too. That's a plain lead; if a bob is called, the bell in fourth place stays instead.
            if (++rows > 0) {
                int change = (rows - 1) % (2 * bells_n);
                if (change < 2 * bells_n - 1) cross(change & 1, bells_n);
                else if (rand() % 3) cross(2, bells_n);
                else cross(1, 3), cross(4, bells_n);
            }
        }
    }
    float out = 0;
    for (int b = 0; b < bells_n; b++) {
        for (int i = 0; i < PARTIALS; i++) {
            out += sine(&bells[b].phase[i], bells[b].freq * ratios[i]) * (bells[b].amp[i] *= decays[i]);
        }
    }
    return soft_clip(out * 0.18f);
}
