// emcc -Oz test.c -Wall --no-entry -s SUPPORT_ERRNO=0 -s SUPPORT_LONGJMP=0 -o test.wasm
#include <math.h>
#include <stdlib.h>
#include "deck.h"

#define SIZEOF(arr) (sizeof(arr) / sizeof(*arr))

define_title("test");

const int chords[][3] = {{0, 3, 5}, {1, 2, 5}, {2, 4, 5}, {1, 4, 6}};
const int scale[] = {0, 2, 4, 5, 7, 9, 11};

float upper() {
    // Let's pretend we're a coroutine!
    // Persistent locals
    static struct {
        int freq;
        float sqr_phase;
        float env_time;
    } notes[SIZEOF(chords[0])];
    static int c, i, j;
    static float t = 0;
    const float dur = 0.25;
    // Start of function
    gen_begin;
    for (c = 0;; c = (c + 1) % SIZEOF(chords)) {
        for (int k = 0; k < SIZEOF(notes); k++) {
            notes[k].freq = m2f(scale[chords[c][k]] + 60); // m2f(rand() % 13 + 60);
        }
        for (j = 0; j < 6; j++) {
            if (j > 0 && rand() % 2 == 0) { // like `degrade`
                // Sit this one out.
                sleep(t, dur);
                continue;
            }
            for (int k = 0; k < SIZEOF(notes); k++) {
                notes[k].sqr_phase = 0;
                notes[k].env_time = 0;
            }
            for (; t < dur; t += dt) {
                float x = 0;
                for (i = 0; i < SIZEOF(notes); i++) {
                    x += sqr(&notes[i].sqr_phase, notes[i].freq) * env(&notes[i].env_time, dur);
                }
                yield(x / SIZEOF(notes));
            }
            t -= dur;
        }
    }
    gen_end(0);
}

float lower() {
    // Let's pretend we're a coroutine!
    // Persistent locals
    static float notes[][2] = {{0, 1.0}, {0, 0.5}};
    static int c, i;
    static float t, freq, dur;
    static float sqr_phase = 0;
    static float env_time = 0;
    // Start of function
    gen_begin;
    for (c = 0;; c = (c + 1) % SIZEOF(chords)) {
        notes[0][0] = m2f(scale[chords[c][0]] + 48);
        notes[1][0] = m2f(scale[chords[c][1]] + 48);
        for (i = 0; i < SIZEOF(notes); i++) {
            freq = notes[i][0];
            dur = notes[i][1];
            sqr_phase = 0;
            env_time = 0;
            for (t = 0; t < dur; t += dt) {
                yield(sqr(&sqr_phase, freq) * env(&env_time, dur));
            }
        }
    }
    gen_end(0);
}

float perc() {
    const float dur = 0.125;
    static float t = 0;
    static float env_time;
    gen_begin;
    for (;;) {
        if (rand() % 4) {
            sleep(t, dur);
            continue;
        }
        env_time = 0;
        for (; t < dur; t += dt) {
            yield(noise() * env(&env_time, dur));
        }
        t -= dur;
    }
    gen_end(0);
}

float uniform(float a, float b) {
    return rand() / (float)RAND_MAX * (b - a) + a;
}

regen_vars(thing,
    float freq_start, freq_end, dur, mod_ratio, mod_depth, t, carrier, modulator;
);
float thing(thing_state *self) {
    const float options[] = {0.25, 0.5, 0.75, 1.0};
    regen_begin;
    self->freq_start = uniform(0, 1000);
    self->freq_end = uniform(0, 1000);
    self->dur = choice(options);
    self->mod_ratio = uniform(1, 100);
    self->mod_depth = uniform(0, 1);
    for (self->t = 0; self->t < self->dur; self->t += dt) {
        float freq = self->t / self->dur * (self->freq_end - self->freq_start) + self->freq_start;
        float mod_freq = freq / self->mod_ratio;
        reyield(sqr(&self->carrier, freq + freq * self->mod_depth * sqr(&self->modulator, mod_freq)));
    }
    regen_end(0);
}

float things() {
    static thing_state my_thing;
    gen_begin;
    for (;;) {
        regen_init(my_thing);
        yield_from(thing, my_thing);
    }
    gen_end(0);
}

float process() {
    float x = upper()*3/8 + lower()/8 + perc()/4 + things()/8;
    dt *= 1.0000001f; // whee
    return x;
}
