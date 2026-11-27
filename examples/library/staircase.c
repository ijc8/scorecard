// An endless glissando: octave-spaced sines that seem to rise (or fall) forever.
#include "../deck.h"

card_title("endless staircase");

#define PARTIALS 8
#define LOW 30.0f

// Each partial glides through eight octaves, fading in at the bottom and out at the top
// (or vice versa), so the ear never finds the place where it wraps around.
float freqs[PARTIALS], phases[PARTIALS], pos[PARTIALS];
float rate, step = 1;

void setup(unsigned int seed) {
    srand(seed);
    // Octaves per second; sometimes going down instead.
    rate = uniform(0.05, 0.2) * dt;
    // 2^(rate) per sample, via a few terms of the exponential series.
    float x = rate * 0.6931472f;
    step = 1 + x + x * x / 2;
    if (seed & 1) {
        rate = -rate;
        step = 1 / step;
    }
    float freq = LOW;
    for (int i = 0; i < PARTIALS; i++) {
        freqs[i] = freq;
        pos[i] = i;
        freq *= 2;
    }
}

float process() {
    float out = 0;
    for (int i = 0; i < PARTIALS; i++) {
        float x = pos[i] / PARTIALS;
        float amp = 4 * x * (1 - x);
        out += sine(&phases[i], freqs[i]) * amp * amp;
        freqs[i] *= step;
        pos[i] += rate;
        if (pos[i] >= PARTIALS) {
            pos[i] -= PARTIALS;
            freqs[i] = LOW;
        } else if (pos[i] < 0) {
            pos[i] += PARTIALS;
            freqs[i] = LOW * (1 << PARTIALS);
        }
    }
    return out * 0.2f;
}
