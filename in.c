// emcc -Oz in.c -Wall --no-entry -s SUPPORT_ERRNO=0 -s SUPPORT_LONGJMP=0 -o in.wasm
#include <stdlib.h>
#include "generator.h"
#include "in.h"
#include "deck.h"

EMSCRIPTEN_KEEPALIVE
const char title[] = "in.c";

float play_pulse() {
    const int freq = m2f(84);
    const float dur = 0.25f;
    static float t = 0;
    static float env_time;
    static float sqr_phase;
    gen_begin;
    for (;;) {
        env_time = 0;
        for (; t < dur; t += dt) {
            yield(env(&env_time, dur) * sqr(&sqr_phase, freq));
        }
        // Subtract `dur` (rather than resetting `t` to 0 before the loop)
        // in order to avoid accumulating rounding error from truncating dur/dt.
        t -= dur;
    }
    gen_end(0);
}

osc_func osc_funcs[] = {sqr, saw, tri};

float play_score() {
    static osc_func osc;
    static int num_reps, rep, fragment_index, fragment_start, fragment_end, note_index;
    static float freq, dur, amp, t;
    static float env_time, osc_phase;
    static const float grace_note_frac = 0.05f;
    static const float amplitudes[] = {0.44f, 0.66f, 1.0f};
    gen_begin;
    t = 0;
    osc = choice(osc_funcs);
    for (fragment_index = 0; fragment_index < SIZEOF(fragments); fragment_index++) {
        fragment_start = fragments[fragment_index][0];
        fragment_end = fragments[fragment_index][1];
        num_reps = rand() % 4 + 3;
        for (rep = 0; rep < num_reps; rep++) {
            for (note_index = fragment_start; note_index < fragment_end; note_index++) {
                dur = score[note_index].duration / 4.0f;
                if (score[note_index].pitch == 0) {
                    for (; t < dur; t += dt) yield(0);
                    t -= dur;
                    continue;
                }
                env_time = 0;
                freq = m2f(score[note_index].pitch);
                if (dur == 0) {
                    // Grace note
                    dur = (score[note_index + 1].duration / 4.0f) * grace_note_frac;
                } else if (note_index > 0 && score[note_index - 1].duration == 0) {
                    // Last note was a grace note
                    dur *= (1 - grace_note_frac);
                }
                amp = amplitudes[score[note_index].velocity - 1];
                for (; t < dur; t += dt) {
                    yield(env(&env_time, dur) * osc(&osc_phase, freq) * amp);
                }
                t -= dur;
            }
        }
    }
    gen_end(0);
}

EMSCRIPTEN_KEEPALIVE
void setup(unsigned int seed) {
    srand(seed);
}

EMSCRIPTEN_KEEPALIVE
float process() {
    return (play_pulse() + play_score()*3)/4;
}
