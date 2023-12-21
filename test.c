// emcc -Oz test.c -Wall --no-entry -s SUPPORT_ERRNO=0 -s SUPPORT_LONGJMP=0 -o test.wasm
#ifdef __EMSCRIPTEN__
    #include <emscripten.h>
#else
    #include <stdio.h>
#endif
#include <math.h>
#include <stdlib.h>
#include <string.h>

#define SIZEOF(arr) (sizeof(arr) / sizeof(*arr))

float dt = 1.0 / 44100.0;

// inline float m2f(float pitch) {
//     return powf(2, (pitch - 69) / 12) * 440;
// }

// Saves 458 bytes
float m2f(int pitch) {
    float freq = 440;
    pitch -= 69;
    while (pitch-- > 1) freq *= 1.0594630943592953;
    while (pitch++ < 0) freq *= 0.9438743126816935;
    return freq;
}

// envelope!
typedef struct env_context {
    int state;
    float t;
} env_context;

float env(env_context *self, float dur) {
    // Let's pretend we're a (re-entrant) coroutine!
    // Boilerplate
    switch (self->state) {
        case 0: goto label0;
        case 1: goto label1;
    }
    // Start of function
    label0:
    for (self->t = 0; self->t < dur; self->t += dt) {
        self->state = 1; return 1 - (self->t / dur); label1:;
    }
    return 0;
}

// #include "coroutine.h"
// float env(ccrContParam, float dur) {
//     ccrBeginContext;
//     float t;
//     ccrEndContext(self);
//     ccrBegin(self);
//     for (self->t = 0; self->t < dur; self->t += dt) {
//         ccrReturn(1 - self->t / dur);
//     }
//     ccrFinish(0);
// }

float upper() {
    // Let's pretend we're a coroutine!
    // Boilerplate
    static int state = 0;
    switch (state) {
        case 0: goto label0;
        case 1: goto label1;
    }
    // Persistent locals
    static float notes[][2] = {{0, 0.5}, {0, 0.25}, {0, 0.25}, {0, 0.5}};
    static int i, j;
    static float t, freq, dur;
    static env_context my_env = {0};
    // static ccrContext my_env = 0;
    // Start of function
    label0:
    for (;;) {
        for (int k = 0; k < SIZEOF(notes); k++) {
            notes[k][0] = m2f(rand() % 13 + 60);
        }
        for (j = 0; j < 2; j++) {
            for (i = 0; i < SIZEOF(notes); i++) {
                freq = notes[i][0];
                dur = notes[i][1];
                memset(&my_env, 0, sizeof(my_env));
                for (t = 0; t < dur; t += dt) {
                    float x = t * freq;
                    // saw: x = (x - truncf(x)) * 2 - 1;
                    x = (x - truncf(x)) < 0.5 ? -1 : 1; // square
                    #ifndef __EMSCRIPTEN__
                        // printf("%f %f %f\n", t, t * freq, x);
                    #endif
                    // sin: x = sinf(2*M_PI*x);
                    state = 1; return x * env(&my_env, dur); label1:;
                }
                // ccrAbort(my_env);
            }
        }
    }
    return 0;
}

float lower() {
    // Let's pretend we're a coroutine!
    // Boilerplate
    static int state = 0;
    switch (state) {
        case 0: goto label0;
        case 1: goto label1;
    }
    // Persistent locals
    static float notes[][2] = {{0, 1.0}, {0, 0.5}};
    static int i, j;
    static float t, freq, dur;
    static env_context my_env = {0};
    // static ccrContext my_env = 0;
    // Start of function
    label0:
    for (;;) {
        for (int k = 0; k < SIZEOF(notes); k++) {
            notes[k][0] = m2f(rand() % 13 + 36);
        }
        for (j = 0; j < 2; j++) {
            for (i = 0; i < SIZEOF(notes); i++) {
                freq = notes[i][0];
                dur = notes[i][1];
                memset(&my_env, 0, sizeof(my_env));
                for (t = 0; t < dur; t += dt) {
                    float x = t * freq;
                    // saw: x = (x - truncf(x)) * 2 - 1;
                    x = (x - truncf(x)) < 0.5 ? -1 : 1; // square
                    #ifndef __EMSCRIPTEN__
                        // printf("%f %f %f\n", t, t * freq, x);
                    #endif
                    // sin: x = sinf(2*M_PI*x);
                    state = 1; return x * env(&my_env, dur); label1:;
                }
                // ccrAbort(my_env);
            }
        }
    }
    return 0;
}

#ifdef __EMSCRIPTEN__
    EMSCRIPTEN_KEEPALIVE
#endif
float process() {
    float x = (upper() + lower()) / 2;
    dt *= 1.0000001; // whee
    return x;
}

#ifndef __EMSCRIPTEN__
int main() {
    for (;;) {
        float x = process();
        // printf("%f\n", x);
        fwrite(&x, 4, 1, stdout);
    }
    return 0;
}
#endif
