// Each phone playing this card is a firefly: it blinks a note at its own steady pace, and when it
// hears another one blink, it hurries its next blink a little. Put a few phones round a table (each
// with a different seed: its own pace and its own note) and they drift into time, with no network
// but the air. Alone, or with no microphone, it keeps its own time.
#define INPUT
#include "deck.h"

card_title("fireflies");

const char scale[] = {0, 2, 4, 7, 9};

// `wait` runs from 0 to 1 between blinks; `glow` is how long the current blink has lasted.
float wait, pace, glow = 1, freq, phase, shimmer, fast, slow, deaf;
int blinks, note;

void setup(unsigned int seed) {
    srand(seed);
    pace = uniform(0.72f, 0.88f);
    wait = uniform(0, 1);
    note = rand() % 10;
}

float process(float in) {
    // A blink from somewhere else is a sudden rise in loudness over what the room has been like.
    float loud = fabsf(in);
    lp1(&fast, loud, 0.02f);
    lp1(&slow, fast, 0.0002f);
    deaf -= dt;
    if (deaf < 0 && fast > 0.01f + 3 * slow) {
        // The later it comes in the wait, the bigger the jump (and it can't hear its own blink, or
        // anything just after it, so two that blink together leave each other alone).
        wait += 0.25f * wait;
        deaf = 0.2f;
    }
    wait += pace * dt;
    if (wait >= 1) {
        wait = glow = 0;
        deaf = 0.35f;
        // Its note moves a step along the scale every eighth blink.
        if (!(++blinks % 8)) note = (note + 1 + rand() % 3) % 10;
        freq = m2f(69 + scale[note % 5] + 12 * (note / 5));
    }
    glow += dt;
    if (glow > 0.3f) return 0;
    return (sine(&phase, freq) + 0.3f * sine(&shimmer, freq * 3.01f)) * ad(glow, 0.004f, 0.296f) * 0.5f;
}
