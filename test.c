// emcc -Oz test.c -Wall --no-entry -s SUPPORT_ERRNO=0 -s SUPPORT_LONGJMP=0 -o test.wasm
#ifdef __EMSCRIPTEN__
    #include <emscripten.h>
#else
    #define EMSCRIPTEN_KEEPALIVE
    #include <stdio.h>
#endif
#include <math.h>
#include <stdlib.h>

#define SIZEOF(arr) (sizeof(arr) / sizeof(*arr))

EMSCRIPTEN_KEEPALIVE
const char title[] = "test";

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

// TODO: Consider GCC extension of pointers to labels
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

#define cr_vars(a, ...) typedef struct a##_state { int line_number; __VA_ARGS__; } a##_state;

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
        float x = 1 - cr->t / dur;
        cr_yield(x * x);
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

#define scr_yield_from(coroutine, state)                 \
    do {                                                 \
        scr_line_number = __LINE__;                      \
        typeof(coroutine(&state)) x = coroutine(&state); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)

#define scr_yield_from_args(coroutine, state, ...)       \
    do {                                                 \
        scr_line_number = __LINE__;                      \
        typeof(coroutine(&state, __VA_ARGS__)) x = coroutine(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)

#define reset(cr_state) (cr_state.line_number = 0)

const int chords[][3] = {{0, 3, 5}, {1, 2, 5}, {2, 4, 5}, {1, 4, 6}};
const int scale[] = {0, 2, 4, 5, 7, 9, 11};

float upper() {
    // Let's pretend we're a coroutine!
    // Persistent locals
    static struct {
        int freq;
        sqr_state sqr;
        env_state env;
    } notes[SIZEOF(chords[0])];
    static int c, i, j;
    static float t;
    static sleep_state sleep_state;
    const float dur = 0.25;
    // Start of function
    scr_begin;
    for (c = 0;; c = (c + 1) % SIZEOF(chords)) {
        for (int k = 0; k < SIZEOF(notes); k++) {
            notes[k].freq = m2f(scale[chords[c][k]] + 60); // m2f(rand() % 13 + 60);
        }
        for (j = 0; j < 6; j++) {
            if (j > 0 && rand() % 2 == 0) { // like `degrade`
                // Sit this one out.
                reset(sleep_state);
                scr_yield_from_args(sleep, sleep_state, dur);
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
    // Persistent locals
    static float notes[][2] = {{0, 1.0}, {0, 0.5}};
    static int c, i;
    static float t, freq, dur;
    static sqr_state my_sqr = {0};
    static env_state my_env = {0};
    // Start of function
    scr_begin;
    for (c = 0;; c = (c + 1) % SIZEOF(chords)) {
        notes[0][0] = m2f(scale[chords[c][0]] + 48);
        notes[1][0] = m2f(scale[chords[c][1]] + 48);
        for (i = 0; i < SIZEOF(notes); i++) {
            freq = notes[i][0];
            dur = notes[i][1];
            reset(my_sqr);
            reset(my_env);
            for (t = 0; t < dur; t += dt) {
                scr_yield(sqr(&my_sqr, freq) * env(&my_env, dur));
            }
        }
    }
    scr_end(0);
}

float noise() {
    return rand() / (float)RAND_MAX * 2 - 1;
}

float perc() {
    const float dur = 0.125;
    static float t;
    static env_state my_env;
    static sleep_state my_sleep;
    scr_begin;
    for (;;) {
        if (rand() % 4) {
            reset(my_sleep);
            scr_yield_from_args(sleep, my_sleep, dur);
            continue;
        }
        reset(my_env);
        for (t = 0; t < dur; t += dt) {
            scr_yield(noise() * env(&my_env, dur));
        }
    }
    scr_end(0);
}

float uniform(float a, float b) {
    return rand() / (float)RAND_MAX * (b - a) + a;
}

#define choice(arr) (arr[rand() % SIZEOF(arr)])

/* cr_vars(ramp, float t); */
/* float ramp(ramp_state *cr, float start, float end, float dur) { */
/*     cr_begin; */
/*     for (cr->t = 0; cr->t < dur; cr->t += dt) { */
/*         cr_yield(cr->t / dur * (end - start) + start); */
/*     } */
/*     cr_end(0); */
/* } */

/* #define cr_foreach(var, coroutine_expr, state, ...) \ */
/*     do {                                            \ */
/*         typeof(coroutine_expr) var = coroutine_expr;\ */
/*         if (state.line_number == -1) break;         \ */
/*         __VA_ARGS__                                 \ */
/*     } while (state.line_number != -1) */

cr_vars(thing, float freq_start, freq_end, dur, mod_ratio, mod_depth, t; sqr_state carrier, modulator);
float thing(thing_state *cr) {
    const float options[] = {0.25, 0.5, 0.75, 1.0};
    cr_begin;
    cr->freq_start = uniform(0, 1000);
    cr->freq_end = uniform(0, 1000);
    cr->dur = choice(options);
    cr->mod_ratio = uniform(1, 100);
    cr->mod_depth = uniform(0, 1);
    for (cr->t = 0; cr->t < cr->dur; cr->t += dt) {
        float freq = cr->t / cr->dur * (cr->freq_end - cr->freq_start) + cr->freq_start;
        float mod_freq = freq / cr->mod_ratio;
        cr_yield(sqr(&cr->carrier, freq + freq * cr->mod_depth * sqr(&cr->modulator, mod_freq)));
    }
    cr_end(0);
}

float things() {
    static thing_state my_thing;
    scr_begin;
    for (;;) {
        reset(my_thing);
        scr_yield_from(thing, my_thing);
    }
    scr_end(0);
}

EMSCRIPTEN_KEEPALIVE
float process() {
    float x = upper()*3/8 + lower()/8 + perc()/4 + things()/8;
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
