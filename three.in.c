// emcc -Oz three.in.c -Wall --no-entry -s SUPPORT_ERRNO=0 -s SUPPORT_LONGJMP=0 -o in.wasm
#include <stdlib.h>
#include "generator.h"
#include "in.h"
#include "deck.h"

EMSCRIPTEN_KEEPALIVE
const char title[] = "in.c (three voices)";

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

rgen_vars(play_score,
    int num_reps, rep, fragment_index, fragment_start, fragment_end, note_index;
    float freq, dur, amp, t;
    float env_time;
    float osc_phase;
);
float play_score(play_score_state *self, osc_func osc) {
    static const float grace_note_frac = 0.05f;
    static const float amplitudes[] = {0.44f, 0.66f, 1.0f};
    rgen_begin;
    self->t = 0;
    for (self->fragment_index = 0; self->fragment_index < SIZEOF(fragments); self->fragment_index++) {
        self->fragment_start = fragments[self->fragment_index][0];
        self->fragment_end = fragments[self->fragment_index][1];
        self->num_reps = rand() % 4 + 3;
        for (self->rep = 0; self->rep < self->num_reps; self->rep++) {
            for (self->note_index = self->fragment_start; self->note_index < self->fragment_end; self->note_index++) {
                self->dur = score[self->note_index].duration / 4.0f;
                if (score[self->note_index].pitch == 0) {
                    for (; self->t < self->dur; self->t += dt) {
                        ryield(0);
                    }
                    self->t -= self->dur;
                    continue;
                }
                self->env_time = 0;
                self->freq = m2f(score[self->note_index].pitch);
                if (self->dur == 0) {
                    // Grace note
                    self->dur = (score[self->note_index + 1].duration / 4.0f) * grace_note_frac;
                } else if (self->note_index > 0 && score[self->note_index - 1].duration == 0) {
                    // Last note was a grace note
                    self->dur *= (1 - grace_note_frac);
                }
                self->amp = amplitudes[score[self->note_index].velocity - 1];
                for (; self->t < self->dur; self->t += dt) {
                    ryield(env(&self->env_time, self->dur) * osc(&self->osc_phase, self->freq) * self->amp);
                }
                self->t -= self->dur;
            }
        }
    }
    rgen_end(0);
}

EMSCRIPTEN_KEEPALIVE
void setup(unsigned int seed) {
    srand(seed);
}

EMSCRIPTEN_KEEPALIVE
float process() {
    static play_score_state a = {0}, b = {0}, c = {0};
    return (
        play_pulse() +
        play_score(&a, (osc_func)saw)*5 +
        play_score(&b, (osc_func)sqr)*5 +
        play_score(&c, (osc_func)tri)*5
    ) / 16;
}
