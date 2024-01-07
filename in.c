// emcc -Oz in.c -Wall --no-entry -s SUPPORT_ERRNO=0 -s SUPPORT_LONGJMP=0 -o in.wasm
#ifdef __EMSCRIPTEN__
    #include <emscripten.h>
#else
    #define EMSCRIPTEN_KEEPALIVE
    #include <stdio.h>
#endif
#include <math.h>
#include <stdlib.h>
#include <inttypes.h>

typedef struct {
    uint8_t pitch;
    uint8_t velocity;
    uint8_t duration;
} note_t;

note_t score[] = {
    // Fragment 0 (dummy fragment to stagger entrances)
    {.duration = 12},
    // Fragment 1
    {.pitch = 60, .velocity = 1, .duration = 0},
    {.pitch = 64, .velocity = 3, .duration = 4},
    {.pitch = 60, .velocity = 1, .duration = 0},
    {.pitch = 64, .velocity = 3, .duration = 4},
    {.pitch = 60, .velocity = 1, .duration = 0},
    {.pitch = 64, .velocity = 3, .duration = 4},
    // Fragment 2
    {.pitch = 60, .velocity = 1, .duration = 0},
    {.pitch = 64, .velocity = 3, .duration = 2},
    {.pitch = 65, .velocity = 1, .duration = 2},
    {.pitch = 64, .velocity = 2, .duration = 4},
    // Fragment 3
    {.duration = 2},
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 65, .velocity = 2, .duration = 2},
    {.pitch = 64, .velocity = 1, .duration = 2},
    // Fragment 4
    {.duration = 2},
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 65, .velocity = 2, .duration = 2},
    {.pitch = 67, .velocity = 1, .duration = 2},
    // Fragment 5
    {.pitch = 64, .velocity = 3, .duration = 2},
    {.pitch = 65, .velocity = 1, .duration = 2},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.duration = 2},
    // Fragment 6
    {.pitch = 72, .velocity = 3, .duration = 16},
    {.pitch = 72, .velocity = 3, .duration = 16},
    // Fragment 7
    {.duration = 14},
    {.pitch = 60, .velocity = 3, .duration = 1},
    {.pitch = 60, .velocity = 1, .duration = 1},
    {.pitch = 60, .velocity = 1, .duration = 2},
    {.duration = 18},
    // Fragment 8
    {.pitch = 67, .velocity = 3, .duration = 24},
    {.pitch = 65, .velocity = 2, .duration = 16},
    {.pitch = 65, .velocity = 2, .duration = 16},
    // Fragment 9
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.duration = 14},
    // Fragment 10
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 11
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 12
    {.pitch = 65, .velocity = 3, .duration = 2},
    {.pitch = 67, .velocity = 1, .duration = 2},
    {.pitch = 71, .velocity = 2, .duration = 16},
    {.pitch = 72, .velocity = 3, .duration = 4},
    // Fragment 13
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 3},
    {.pitch = 67, .velocity = 2, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.duration = 3},
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 12},
    // Fragment 14
    {.pitch = 72, .velocity = 3, .duration = 16},
    {.pitch = 71, .velocity = 2, .duration = 16},
    {.pitch = 67, .velocity = 2, .duration = 16},
    {.pitch = 66, .velocity = 2, .duration = 16},
    // Fragment 15
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.duration = 15},
    // Fragment 16
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 71, .velocity = 1, .duration = 1},
    {.pitch = 72, .velocity = 2, .duration = 1},
    {.pitch = 71, .velocity = 1, .duration = 1},
    // Fragment 17
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 72, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 72, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.duration = 1},
    // Fragment 18
    {.pitch = 64, .velocity = 3, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 3},
    {.pitch = 64, .velocity = 1, .duration = 1},
    // Fragment 19
    {.duration = 6},
    {.pitch = 79, .velocity = 3, .duration = 6},
    // Fragment 20
    {.pitch = 64, .velocity = 3, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 55, .velocity = 3, .duration = 3},
    {.pitch = 64, .velocity = 1, .duration = 1},
    {.pitch = 66, .velocity = 2, .duration = 1},
    {.pitch = 64, .velocity = 1, .duration = 1},
    {.pitch = 66, .velocity = 2, .duration = 1},
    {.pitch = 64, .velocity = 1, .duration = 1},
    // Fragment 21
    {.pitch = 66, .velocity = 3, .duration = 12},
    // Fragment 22
    {.pitch = 64, .velocity = 3, .duration = 6},
    {.pitch = 64, .velocity = 2, .duration = 6},
    {.pitch = 64, .velocity = 2, .duration = 6},
    {.pitch = 64, .velocity = 2, .duration = 6},
    {.pitch = 64, .velocity = 2, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 0, .duration = 2},
    // Fragment 23
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 66, .velocity = 3, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 4},
    // Fragment 24
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 66, .velocity = 1, .duration = 2},
    {.pitch = 67, .velocity = 3, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 1, .duration = 2},
    // Fragment 25
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 66, .velocity = 1, .duration = 2},
    {.pitch = 67, .velocity = 1, .duration = 2},
    {.pitch = 69, .velocity = 3, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    // Fragment 26
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 66, .velocity = 1, .duration = 2},
    {.pitch = 67, .velocity = 1, .duration = 2},
    {.pitch = 69, .velocity = 1, .duration = 2},
    {.pitch = 71, .velocity = 3, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    // Fragment 27
    {.pitch = 64, .velocity = 3, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 67, .velocity = 3, .duration = 2},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 66, .velocity = 2, .duration = 1},
    {.pitch = 64, .velocity = 1, .duration = 1},
    {.pitch = 66, .velocity = 2, .duration = 1},
    {.pitch = 64, .velocity = 1, .duration = 1},
    // Fragment 28
    {.pitch = 64, .velocity = 3, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 3, .duration = 3},
    {.pitch = 64, .velocity = 1, .duration = 1},
    // Fragment 29
    {.pitch = 64, .velocity = 3, .duration = 12},
    {.pitch = 67, .velocity = 2, .duration = 12},
    {.pitch = 72, .velocity = 2, .duration = 12},
    // Fragment 30
    {.pitch = 72, .velocity = 3, .duration = 24},
    // Fragment 31
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    {.pitch = 67, .velocity = 2, .duration = 1},
    {.pitch = 71, .velocity = 1, .duration = 1},
    {.pitch = 67, .velocity = 2, .duration = 1},
    {.pitch = 71, .velocity = 1, .duration = 1},
    // Fragment 32
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 65, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    {.pitch = 65, .velocity = 2, .duration = 12},
    {.pitch = 67, .velocity = 2, .duration = 6},
    // Fragment 33
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    {.duration = 2},
    // Fragment 34
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    // Fragment 35
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.duration = 14},
    {.pitch = 70, .velocity = 3, .duration = 4},
    {.pitch = 79, .velocity = 2, .duration = 12},
    {.pitch = 81, .velocity = 3, .duration = 2},
    {.pitch = 79, .velocity = 1, .duration = 2},
    {.pitch = 79, .velocity = 2, .duration = 2},
    {.pitch = 83, .velocity = 1, .duration = 2},
    {.pitch = 81, .velocity = 2, .duration = 6},
    {.pitch = 79, .velocity = 1, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 12},
    {.pitch = 79, .velocity = 3, .duration = 2},
    {.pitch = 78, .velocity = 1, .duration = 2},
    {.pitch = 78, .velocity = 1, .duration = 12},
    {.duration = 10},
    {.pitch = 76, .velocity = 1, .duration = 2},
    {.pitch = 76, .velocity = 3, .duration = 8},
    {.pitch = 77, .velocity = 2, .duration = 24},
    // Fragment 36
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 37
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 38
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    // Fragment 39
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 65, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 72, .velocity = 1, .duration = 1},
    // Fragment 40
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    // Fragment 41
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 42
    {.pitch = 72, .velocity = 3, .duration = 16},
    {.pitch = 71, .velocity = 3, .duration = 16},
    {.pitch = 69, .velocity = 3, .duration = 16},
    {.pitch = 72, .velocity = 3, .duration = 16},
    // Fragment 43
    {.pitch = 77, .velocity = 3, .duration = 1},
    {.pitch = 76, .velocity = 1, .duration = 1},
    {.pitch = 77, .velocity = 2, .duration = 1},
    {.pitch = 76, .velocity = 1, .duration = 1},
    {.pitch = 76, .velocity = 3, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 77, .velocity = 2, .duration = 1},
    {.pitch = 76, .velocity = 1, .duration = 1},
    // Fragment 44
    {.pitch = 77, .velocity = 3, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 72, .velocity = 3, .duration = 4},
    // Fragment 45
    {.pitch = 74, .velocity = 3, .duration = 4},
    {.pitch = 74, .velocity = 2, .duration = 4},
    {.pitch = 67, .velocity = 2, .duration = 4},
    // Fragment 46
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 74, .velocity = 1, .duration = 1},
    {.pitch = 76, .velocity = 2, .duration = 1},
    {.pitch = 74, .velocity = 1, .duration = 1},
    {.duration = 2},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.duration = 2},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.duration = 2},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 74, .velocity = 1, .duration = 1},
    {.pitch = 76, .velocity = 2, .duration = 1},
    {.pitch = 74, .velocity = 1, .duration = 1},
    // Fragment 47
    {.pitch = 74, .velocity = 3, .duration = 1},
    {.pitch = 76, .velocity = 1, .duration = 1},
    {.pitch = 74, .velocity = 2, .duration = 2},
    // Fragment 48
    {.pitch = 67, .velocity = 3, .duration = 24},
    {.pitch = 67, .velocity = 3, .duration = 16},
    {.pitch = 65, .velocity = 3, .duration = 16},
    {.pitch = 65, .velocity = 2, .duration = 4},
    // Fragment 49
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 70, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 70, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 50
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 51
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 70, .velocity = 2, .duration = 1},
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 70, .velocity = 2, .duration = 1},
    // Fragment 52
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 70, .velocity = 1, .duration = 1},
    // Fragment 53
    {.pitch = 70, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
};

uint16_t fragments[][2] = {
    {0, 1},
    {1, 7},
    {7, 11},
    {11, 15},
    {15, 19},
    {19, 23},
    {23, 25},
    {25, 30},
    {30, 33},
    {33, 36},
    {36, 38},
    {38, 44},
    {44, 48},
    {48, 56},
    {56, 60},
    {60, 62},
    {62, 66},
    {66, 72},
    {72, 78},
    {78, 80},
    {80, 90},
    {90, 91},
    {91, 100},
    {100, 109},
    {109, 118},
    {118, 127},
    {127, 136},
    {136, 147},
    {147, 153},
    {153, 156},
    {156, 157},
    {157, 163},
    {163, 171},
    {171, 174},
    {174, 176},
    {176, 203},
    {203, 209},
    {209, 211},
    {211, 217},
    {217, 223},
    {223, 225},
    {225, 227},
    {227, 231},
    {231, 240},
    {240, 245},
    {245, 248},
    {248, 262},
    {262, 265},
    {265, 269},
    {269, 275},
    {275, 277},
    {277, 283},
    {283, 285},
    {285, 287},
};


#define SIZEOF(arr) (sizeof(arr) / sizeof(*arr))

EMSCRIPTEN_KEEPALIVE
const char title[] = "in.c";

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

#define cr_yield_from_args(coroutine, state, ...)        \
    do {                                                 \
        cr->line_number = __LINE__;                      \
        typeof(coroutine(&state, __VA_ARGS__)) x = coroutine(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)

#define cr_vars(a, ...) typedef struct a##_state { int line_number; __VA_ARGS__; } a##_state;

typedef struct {
    float phase;
} sqr_state;
float sqr(sqr_state *cr, float freq) {
    float x = cr->phase < 0.5 ? -1 : 1;
    cr->phase += freq * dt;
    cr->phase -= truncf(cr->phase);
    return x;
}

float saw(sqr_state *cr, float freq) {
    float x = cr->phase * 2 - 1;
    cr->phase += freq * dt;
    cr->phase -= truncf(cr->phase);
    return x;
}

float tri(sqr_state *cr, float freq) {
    float x = (cr->phase < 0.5 ? cr->phase : 1 - cr->phase) * 2 - 1;
    cr->phase += freq * dt;
    cr->phase -= truncf(cr->phase);
    return x;
}

typedef struct {
    float t;
} env_state;
float env(env_state *cr, float dur) {
    float x = 1 - cr->t / dur;
    cr->t += dt;
    return x * x;
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

#define choice(arr) (arr[rand() % SIZEOF(arr)])

float play_pulse() {
    const int freq = m2f(84);
    const float dur = 0.25f;
    static float t;
    static env_state my_env;
    static sqr_state my_sqr;
    scr_begin;
    for (;;) {
        // TODO: improve scheduling
        my_env.t = 0;
        my_sqr.phase = 0;
        for (t = 0; t < dur; t += dt) {
            scr_yield(env(&my_env, dur) * sqr(&my_sqr, freq));
        }
    }
    scr_end(0);
}

typedef float (*osc_func)(void *state, float freq);

cr_vars(play_score,
        uint16_t num_reps, rep, fragment_index, fragment_start, fragment_end, note_index;
        float freq, dur, amp, t;
        env_state my_env;
        sqr_state my_sqr;
);
float play_score(play_score_state *cr, osc_func osc) {
    static const float grace_note_frac = 0.05f;
    static const float amplitudes[] = {0.5f, 0.75f, 1.0f};
    cr_begin;
    for (cr->fragment_index = 0; cr->fragment_index < SIZEOF(fragments); cr->fragment_index++) {
        cr->fragment_start = fragments[cr->fragment_index][0];
        cr->fragment_end = fragments[cr->fragment_index][1];
        cr->num_reps = rand() % 4 + 3;
        for (cr->rep = 0; cr->rep < cr->num_reps; cr->rep++) {
            for (cr->note_index = cr->fragment_start; cr->note_index < cr->fragment_end; cr->note_index++) {
                cr->dur = score[cr->note_index].duration / 4.0f;
                if (score[cr->note_index].pitch == 0) {
                    for (cr->t = 0; cr->t < cr->dur; cr->t += dt) {
                        cr_yield(0);
                    }
                    continue;
                }
                cr->my_env.t = 0;
                cr->my_sqr.phase = 0;
                cr->freq = m2f(score[cr->note_index].pitch);
                if (cr->dur == 0) {
                    // Grace note
                    cr->dur = (score[cr->note_index + 1].duration / 4.0f) * grace_note_frac;
                } else if (cr->note_index > 0 && score[cr->note_index - 1].duration == 0) {
                    // Last note was a grace note
                    cr->dur *= (1 - grace_note_frac);
                }
                cr->amp = amplitudes[score[cr->note_index].velocity - 1];
                for (cr->t = 0; cr->t < cr->dur; cr->t += dt) {
                    cr_yield(env(&cr->my_env, cr->dur) * osc(&cr->my_sqr, cr->freq) * cr->amp);
                }
            }
        }
    }
    cr_end(0);
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
