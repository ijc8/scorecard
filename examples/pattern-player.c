// The player behind the source face's Pattern mode, built once (examples/build-pattern-player.sh)
// and shipped with the app, so that writing a pattern doesn't need the C compiler.
//
// The pattern itself is data: src/pattern.ts lays it out at PATTERN, as below, and adds it to
// this module as a data segment, along with the title export. In the module that's built, there's
// nothing at PATTERN, so playing it as it is gives silence.
#include "deck.h"

#define PATTERN 0x20000
// float tick duration (seconds), uint16 ticks before it repeats, uint16 number of events, then
// the events in order (below); the title comes last.
typedef struct __attribute__((packed)) {
    uint16_t when;   // when it starts, in ticks
    uint8_t what;    // a pitch or a drum
    uint8_t length;  // how long it lasts, in ticks
    uint8_t sound;   // how it sounds
} event_t;
#define TICK_DUR (*(const float *)PATTERN)
#define TICKS (*(const uint16_t *)(PATTERN + 4))
#define EVENTS (*(const uint16_t *)(PATTERN + 6))
#define events ((const event_t *)(PATTERN + 8))

#define VOICES 8
enum { SAW, SQR, TRI, SINE, DRUMS };

typedef struct {
    float freq, phase, t, dur;
    int sound;
} voice_t;

voice_t voices[VOICES];
// Each drum's level falls from 1 (when it's hit) to 0.
float timer = 1e9, drums[4], kick_phase;
int next_voice, tick = -1, event;
unsigned int rng;

float process() {
    if (timer >= TICK_DUR) {
        timer -= TICK_DUR;
        if (timer >= TICK_DUR) timer = 0;
        if (++tick == TICKS) tick = event = 0;
        for (; event < EVENTS && events[event].when == tick; event++) {
            const event_t *e = &events[event];
            if (e->sound == DRUMS) {
                drums[e->what] = 1;
            } else {
                voice_t *v = &voices[next_voice++ % VOICES];
                v->sound = e->sound;
                v->freq = m2f(e->what);
                v->dur = e->length * TICK_DUR;
                v->t = 0;
            }
        }
    }
    timer += dt;

    float out = 0;
    for (int i = 0; i < VOICES; i++) {
        voice_t *v = &voices[i];
        float left = (v->dur - v->t) * 30;
        if (left <= 0) continue;
        float x = v->sound == SINE ? sine(&v->phase, v->freq) : saw(&v->phase, v->freq);
        if (v->sound == SQR) x = x < 0 ? -0.6f : 0.6f;
        if (v->sound == TRI) x = fabsf(x) * 2 - 1;
        // Fade in quickly, and out at the end of the note.
        float e = v->t * 200;
        if (e > 1) e = 1;
        if (left < 1) e *= left;
        out += x * e * 0.15f;
        v->t += dt;
    }

    // Drums: a falling triangle for the kick, and noise bursts of different lengths for the rest.
    rng = rng * 1664525 + 1013904223;
    float n = (int)rng * 4.656613e-10f, e = drums[0] * drums[0];
    out += (fabsf(saw(&kick_phase, 45 + 160 * e * e)) * 2 - 1) * e * 0.4f;
    out += n * (drums[1] * drums[1] * 0.2f + drums[2] * drums[2] * 0.08f + drums[3] * drums[3] * 0.15f);
    const float fall[] = {5, 9, 25, 14};
    for (int i = 0; i < 4; i++) {
        drums[i] -= dt * fall[i];
        if (drums[i] < 0) drums[i] = 0;
    }
    return out;
}
