// An effect: whatever the microphone hears comes back as a ring of metallic, slowly drifting echoes.
// (Defining INPUT makes this a card that listens: process() is handed a sample of incoming sound.)
#define INPUT
#include "deck.h"

card_title("canyon");

#define ECHO 19845 // 0.45 seconds

float echo[ECHO], phase, drift, lp;
int pos;

float process(float in) {
    // Ring modulation: multiply by a sine whose pitch wanders up and down over half a minute.
    float mod = sine(&phase, 180 + 120 * sine(&drift, 1.0f / 30));
    float voice = in * (0.5f + 0.5f * mod);
    // Each echo goes round through the modulator again, a little duller every time.
    float back = lp1(&lp, delay(echo, ECHO, &pos, voice, 0.55f), 0.3f);
    return soft_clip(voice + back * 0.8f);
}
