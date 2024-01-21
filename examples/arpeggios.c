#include "deck.h"

card_title("arpeggios");
setup_rand;

const int chords[][5] = {{0, 2, 4, 6, 7}, {0, 2, 3, 5, 7}, {0, 1, 3, 6, 7}, {1, 3, 4, 6, 8}};
const int scale[] = {0, 2, 3, 5, 7, 9, 10, 12, 14};

typedef struct {
    uint8_t length;
    const uint8_t *order;
} pattern_t;

const pattern_t patterns[] = {
    {3, (uint8_t []){0, 1, 2}},
    {3, (uint8_t []){2, 1, 0}},
    {4, (uint8_t []){0, 1, 2, 3}},
    {4, (uint8_t []){4, 3, 2, 1}},
    {4, (uint8_t []){0, 1, 2, 4}},
    {4, (uint8_t []){0, 2, 1, 2}},
    {6, (uint8_t []){0, 1, 2, 3, 2, 1}},
    {8, (uint8_t []){0, 1, 2, 3, 4, 3, 2, 1}},
};

typedef struct {
    int pitch;
    float dur;
} event_t;

event_t arp() {
    const float dur = 60.0 / 110;
    static int c, i, j, octave;
    static pattern_t pattern;
    gen_begin;
    for (;;) {
        octave = rand() % 3;
        pattern = choice(patterns);
        for (c = 0; c < SIZEOF(chords); c++) {
            for (i = 0; i < 4; i++) {
                for (j = 0; j < pattern.length; j++) {
                    yield((event_t){scale[chords[c][pattern.order[j]]] + 48 + octave*12, dur / pattern.length});
                }
            }
        }
    }
    gen_end((event_t){});
}

float process() {
    static event_t event;
    static float t = 0, freq, phase;
    gen_begin;
    for (;;) {
        event = arp();
        if (event.pitch == 0) {
            sleep(t, event.dur);
            continue;
        }
        freq = m2f(event.pitch);
        for (; t < event.dur; t += dt) {
            yield(saw(&phase, freq) * ad(t, 0.03, event.dur - 0.03));
        }
        t -= event.dur;
    }
    gen_end(0);
}
