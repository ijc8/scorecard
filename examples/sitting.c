// After Alvin Lucier's "I am sitting in a room": the card records what the room hears, plays it
// back into the room while recording that, and so on, until only the room's own resonances are left.
// (For a loudspeaker rather than headphones, with echo cancellation turned off in Settings. The seed
// sets how long each turn lasts: 5 to 12 seconds. Speak during the first one.)
#define INPUT
#include "deck.h"

card_title("sitting in a card");

#define LONGEST (12 * 44100)

float tape[LONGEST], peak, gain, target;
int length = 8 * 44100, pos;

void setup(unsigned int seed) {
    length = (5 + seed % 8) * 44100;
}

float process(float in) {
    // What was recorded on the last turn comes off the tape as this turn goes on to it.
    float out = tape[pos] * (gain += 0.0005f * (target - gain));
    tape[pos] = in;
    if (fabsf(in) > peak) peak = fabsf(in);
    if (++pos == length) {
        // Every turn is played back as loud as the first, however quietly it reached the microphone
        // (but a silent room isn't turned up until it roars).
        target = peak > 0.0125f ? 0.5f / peak : 40;
        if (peak < 0.0005f) target = 0;
        peak = pos = 0;
    }
    return soft_clip(out);
}
