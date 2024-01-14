#include "deck.h"

card_title("Quirky FM ramps");

float t, dur, start, end, phase;
float mod_depth, mod_phase, mod_ratio;
float dur_options[] = {0.25, 0.5, 1.0, 2.0, 4.0};

void setup(unsigned int seed) {
    srand(seed);
    dur = choice(dur_options);
    start = uniform(0, 1000);
    end = uniform(0, 1000);
    mod_ratio = uniform(1, 100);
    mod_depth = uniform(0, 1);
}

float process() {
    if (t > dur) return 0;
    float freq = ramp(t, dur, start, end);
    float mod_freq = freq / mod_ratio;
    freq += mod_depth*sqr(&mod_phase, mod_freq);
    float out = sqr(&phase, freq) * env(t, dur);
    t += dt;
    return out;
}
