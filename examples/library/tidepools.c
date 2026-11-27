// Slow sine drones drift through a pentatonic scale while droplets echo overhead.
#include "../deck.h"

card_title("tide pools");

#define VOICES 4
#define ECHO 16538 // 3/8 of a second

const char scale[] = {0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24};
int root;

struct {
    float freq, phase[2], t, period;
} voices[VOICES];

float drop_freq, drop_phase, drop_amp, drop_wait;
float echo[ECHO];
int echo_pos;

void setup(unsigned int seed) {
    srand(seed);
    root = 38 + rand() % 8;
    for (int i = 0; i < VOICES; i++) {
        // Stagger the voices so they don't all swell together.
        voices[i].period = uniform(9, 17);
        voices[i].t = voices[i].period * i / VOICES;
        voices[i].freq = m2f(root + scale[i * 2]);
    }
}

float process() {
    float drones = 0;
    for (int i = 0; i < VOICES; i++) {
        float pos = voices[i].t / voices[i].period;
        float amp = 4 * pos * (1 - pos);
        // Two slightly detuned sines per voice, for slow beating.
        drones += amp * amp * (sine(&voices[i].phase[0], voices[i].freq) + sine(&voices[i].phase[1], voices[i].freq * 1.003f));
        voices[i].t += dt;
        if (voices[i].t >= voices[i].period) {
            // The voice has faded out: pick a new note and swell again.
            voices[i].t = 0;
            voices[i].period = uniform(9, 17);
            voices[i].freq = m2f(root + scale[rand() % 8]);
        }
    }

    drop_wait -= dt;
    if (drop_wait < 0) {
        drop_wait = uniform(0.2, 3);
        drop_freq = m2f(root + 36 + choice(scale));
        drop_amp = uniform(0.3, 1);
    }
    float drop = sine(&drop_phase, drop_freq) * drop_amp;
    drop_amp *= 0.9996f;

    float wet = delay(echo, ECHO, &echo_pos, drop + drones * 0.1f, 0.6f);
    return drones * 0.1f + (drop + wet) * 0.2f;
}
