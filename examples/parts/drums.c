#include <string.h>
#include "../deck.h"
#include "common.h"

card_title("drums");
setup_rand;

const char hats[]  = "- = - - - = - - - = - - - = - - ";
const char snare[] = "    o  o      o  o  o  o o  o   ";
const char kick[]  = "x       x x       x     x x   x ";

const float dur = 60 / tempo / 4;

float hpf(float *prev, float input) {
    float out = (input - *prev)/2;
    *prev = input;
    return out;
}
regen_vars(play_loop,
    int n, i;
    float prev[2], amp, t;
)
float play_loop(play_loop_state *self, const char *loop) {
    regen_begin;
    self->t = 0;
    self->n = strlen(loop);
    for (self->i = 0; self->i < self->n; self->i = (self->i + 1) % self->n) {
        char c = loop[self->i];
        self->amp = uniform(0, 2);
        if (c == '-') {
            self->prev[0] = 0;
            for (; self->t < dur; self->t += dt) {
                reyield(hpf(&self->prev[0], noise()) * env(self->t, dur) * self->amp);
            }
            self->t -= dur;
        } else if (c == '=') {
            self->prev[0] = self->prev[1] = 0;
            for (; self->t < dur; self->t += dt) {
                reyield(hpf(&self->prev[1], hpf(&self->prev[0], noise())) * env(self->t, dur) * self->amp);
            }
            self->t -= dur;
        } else if (c == 'o') {
            for (; self->t < dur; self->t += dt) {
                reyield(lpf(&self->prev[0], noise()) * env(self->t, dur) * self->amp);
            }
            self->t -= dur;
        } else if (c == 'x') {
            self->prev[0] = 0;
            for (; self->t < dur; self->t += dt) {
                reyield(lpf(&self->prev[1], lpf(&self->prev[0], noise())) * env(self->t, dur) * self->amp);
            }
            self->t -= dur;
        } else {
            resleep(self->t, dur);
        }
    }
    regen_end(0);
}

float process() {
    static play_loop_state states[3] = {0};
    return play_loop(&states[0], kick) + play_loop(&states[1], snare) + play_loop(&states[2], hats);
}
