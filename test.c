// emcc -Oz test.c -Wall --no-entry -s SUPPORT_ERRNO=0 -s SUPPORT_LONGJMP=0 -o test.wasm
#ifdef __EMSCRIPTEN__
    #include <emscripten.h>
#else
    #include <stdio.h>
#endif
#include <math.h>
#include <stdlib.h>

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

#define cr_begin switch (cr->line_number) { case 0:;
#define cr_end(x) } cr->line_number = -1; return x

#define cr_yield(x)                             \
    do {                                        \
        cr->line_number = __LINE__;             \
        return (x); case __LINE__:;             \
    } while (0)

#define cr_yield_from(coroutine, state, ...)                            \
    do {                                                                \
        cr->line_number = __LINE__;                                     \
        typeof(coroutine(&state, __VA_ARGS__)) x = coroutine(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;                             \
        return x; case __LINE__:;                                       \
    } while (state.line_number != -1)

#define cr_vars(a, b) typedef struct a##_state { int line_number; b; } a##_state;

cr_vars(sqr, float t);
float sqr(sqr_state *cr, float freq) {
    cr_begin;
    for (cr->t = 0;; cr->t += dt) {
        float x = cr->t * freq;
        cr_yield((x - truncf(x)) < 0.5 ? -1 : 1);
    }
    cr_end(0);
}

cr_vars(env, float t);
float env(env_state *cr, float dur) {
    cr_begin;
    for (cr->t = 0; cr->t < dur; cr->t += dt) {
        cr_yield(1 - cr->t / dur);
    }
    cr_end(0);
}

cr_vars(sleep, float t);
float sleep(sleep_state *cr, float dur) {
    cr_begin;
    for (cr->t = 0; cr->t < dur; cr->t += dt) {
        cr_yield(0);
    }
    cr_end(0);
}

#define scr_begin static int scr_line_number = 0; switch (scr_line_number) { case 0:;
#define scr_end(x) } scr_line_number = -1; return x

#define scr_yield(x)                            \
    do {                                        \
        scr_line_number = __LINE__;             \
        return (x); case __LINE__:;             \
    } while (0)

#define scr_yield_from(coroutine, state, ...)            \
    do {                                                 \
        scr_line_number = __LINE__;                      \
        typeof(coroutine(&state, __VA_ARGS__)) x = coroutine(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)

#define reset(cr_state) (cr_state.line_number = 0)

float upper() {
    // Let's pretend we're a coroutine!
    // Persistent locals
    static struct {
        int freq;
        float dur;
        sqr_state sqr;
        env_state env;
    } notes[] = {{0, 0.5}, {0, 0.25}, {0, 0.25}, {0, 0.5}};
    static int i, j;
    static float t;
    static sleep_state sleep_state;
    const float dur = 0.25;
    // Start of function
    scr_begin;
    for (;;) {
        for (int k = 0; k < SIZEOF(notes); k++) {
            notes[k].freq = m2f(rand() % 13 + 60);
        }
        for (j = 0; j < 6; j++) {
            if (rand() % 2 == 0) { // like `degrade`
                // Sit this one out.
                reset(sleep_state);
                scr_yield_from(sleep, sleep_state, dur);
                continue;
            }
            for (int k = 0; k < SIZEOF(notes); k++) {
                reset(notes[k].sqr);
                reset(notes[k].env);
            }
            for (t = 0; t < dur; t += dt) {
                float x = 0;
                for (i = 0; i < SIZEOF(notes); i++) {
                    x += sqr(&notes[i].sqr, notes[i].freq) * env(&notes[i].env, dur);
                }
                scr_yield(x / SIZEOF(notes));
            }
        }
    }
    scr_end(0);
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
    static sqr_state my_sqr = {0};
    static env_state my_env = {0};
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
                reset(my_sqr);
                reset(my_env);
                for (t = 0; t < dur; t += dt) {
                    state = 1; return sqr(&my_sqr, freq) * env(&my_env, dur); label1:;
                }
            }
        }
    }
    return 0;
}

#ifdef __EMSCRIPTEN__
    EMSCRIPTEN_KEEPALIVE
#endif
float process() {
    float x = upper()*3/4 + lower()/4;
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
