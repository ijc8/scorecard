// A voice sings wordless phrases by itself: a vocal tract (Pink Trombone's) moved by a tune.
//
// A port of Pink Trombone (https://dood.al/pinktrombone/). Kept: the Kelly-Lochbaum waveguide
// tract (44 sections, run twice a sample) with its nose branch and velum, the tongue and
// constriction shaping, the LF-model glottis with aspiration noise, turbulence noise at
// constrictions, and the click as a closure opens. Changed: the UI is replaced by a singer (below);
// the tract is reshaped every 32 samples rather than interpolated across 512-sample blocks;
// simplex-noise wobble is a low-passed random walk; exp/sin/log are small approximations; voicing
// weakens while the tract is closed; and the output is averaged over two samples and soft-clipped.
//
// Pink Trombone: Copyright (c) 2017 Neil Thapen. MIT licence:
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
// associated documentation files (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge, publish, distribute,
// sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: The above copyright notice and this
// permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
// NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
// OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
#include "deck.h"

card_title("pink trombone");

#define N 44
#define NOSE 28
#define NOSE_START 17
#define BLADE 10
#define TIP 32
#define LIP 39
#define BLOCK 32

typedef union { float f; int i; } bits_t;

float exp2_(float x) {
    float k = floorf(x), f = x - k;
    bits_t u = { 1 + f * (0.69606566f + f * (0.22449434f + f * 0.07944023f)) };
    u.i += (int)k << 23;
    return u.f;
}
#define EXP(x) exp2_((x) * 1.442695f)

unsigned rng;
__attribute__((noinline)) int rnd(int n) { return ((rng = rng * 1664525 + 1013904223) >> 8) % n; }
float frand(void) { return rnd(1 << 24) * (1.0f / 16777216); }

// The glottis (an LF-model pulse per period).
float ph, freq, tense, Te, eps, shift, delta, alpha, E0, wscale, nmod, intensity, loudness;

void setup_waveform(void) {
    float Rd = 3 * (1 - tense);
    Rd = fminf(fmaxf(Rd, 0.5f), 2.7f);
    float Ra = -0.01f + 0.048f * Rd, Rk = 0.224f + 0.118f * Rd, k = 0.5f + 1.2f * Rk;
    float Rg = (Rk / 4) * k / (0.11f * Rd - Ra * k);
    float Tp = 1 / (2 * Rg);
    Te = Tp + Tp * Rk;
    eps = 1 / Ra;
    shift = EXP(-eps * (1 - Te));
    delta = 1 - shift;
    float rhs = ((shift - 1) / eps + (1 - Te) * shift) / delta;
    wscale = 1 / (2 * Tp);
    float s = sin1(Te * wscale);
    float y = -3.1415927f * s * ((Te - Tp) / 2 - rhs) / (Tp * 2);
    // ln y: a guess from the float's exponent, then two Newton steps.
    bits_t u = { y };
    float z = (u.i - 1065353216) * 8.2629582e-8f;
    z += y * EXP(-z) - 1;
    z += y * EXP(-z) - 1;
    alpha = z / (Tp / 2 - Te);
    E0 = -1 / (s * EXP(alpha * Te));
    loudness = sqrtf(sqrtf(tense));
}

// The tract and the nose: waves going right (R) and left (L) through 44 and 28 tube sections.
float R[N], L[N], refl[N], diam[N], target[N], nR[NOSE], nL[NOSE], nrefl[NOSE], JR[N + 1], JL[N + 1];
float reflL, reflR, reflN, velum, velum_target, trans, fric_amt;
int obstruction, trans_pos, fric_pos;

float waveguide(float *R, float *L, float *refl, int n, float r0, float in) {
    JR[0] = L[0] * r0 + in;
    JL[n] = R[n - 1] * -0.85f;
    for (int i = 1; i < n; i++) {
        float w = refl[i] * (R[i - 1] + L[i]);
        JR[i] = R[i - 1] - w;
        JL[i] = L[i] + w;
    }
    for (int i = 0; i < n; i++) {
        R[i] = JR[i] * 0.999f;
        L[i] = JL[i + 1] * 0.999f;
    }
    return R[n - 1];
}

float tract(float glot, float fric) {
    if (trans > 0.0001f) {
        R[trans_pos] += trans;
        L[trans_pos] += trans;
        trans *= 0.998429f; // 2^(-200 t)
    }
    float d = diam[fric_pos];
    fric *= fminf(fmaxf(8 * (0.7f - d), 0), 1) * fminf(fmaxf(30 * (d - 0.3f), 0), 1);
    R[fric_pos + 1] += fric;
    L[fric_pos + 1] += fric;
    float l = L[NOSE_START], r = R[NOSE_START - 1], nl = nL[0];
    float a = reflL * r + (1 + reflL) * (nl + l);
    float b = reflR * l + (1 + reflR) * (r + nl);
    float out = waveguide(R, L, refl, N, 0.75f, glot);
    R[NOSE_START] = b * 0.999f;
    L[NOSE_START - 1] = a * 0.999f;
    return out + waveguide(nR, nL, nrefl, NOSE, reflN, (1 + reflN) * (l + r));
}

float towards(float x, float to, float up, float down) {
    return x < to ? fminf(x + up, to) : fmaxf(x - down, to);
}

// Narrow the tract around section `at` to diameter `d`, as a finger on Pink Trombone's tract does.
void constrict(int at, float d) {
    float width = at < 25 ? 10 : at >= TIP ? 5 : 10 - 5 * (at - 25) / (float)(TIP - 25);
    for (int i = -11; i <= 11; i++) {
        int j = at + i;
        float r = fmaxf(abs(i) - 0.5f, 0);
        if (j < 0 || j >= N || r >= width || d >= target[j]) continue;
        target[j] = d + (target[j] - d) * 0.5f * (1 - sin1(r / (2 * width) + 0.25f));
    }
}

// The singer.
// Vowels: tongue index, tongue diameter * 20, lip opening * 10 (30: lips not rounded).
const unsigned char vowels[][3] = {
    {14, 48, 30}, // a
    {18, 46, 8},  // o
    {23, 41, 5},  // u
    {27, 52, 30}, // e
    {28, 41, 30}, // i
    {27, 66, 30}, // ae
};
// Consonants: where, diameter * 10, nasal.
const unsigned char consonants[][3] = {
    {41, 0, 0}, // b
    {41, 0, 1}, // m
    {36, 0, 0}, // d
    {36, 0, 1}, // n
    {22, 0, 0}, // g
    {41, 4, 0}, // v
    {37, 4, 0}, // z
    {36, 8, 0}, // l
};
const char steps[] = {2, 2, 1, 2, 2, 2, 1};

struct { signed char deg, beats, vowel, cons; } phrase[8];
char scale[8];
int len, k, root, resting, cons;
float timer, cons_timer, beat, base_tense, f_target, f_smooth, int_target, tense_target;
float wob, tongue_i, tongue_d, lips, v_i, v_d, v_l, vib_phase, vib, vib_amt;

void new_phrase(void) {
    if (!len || rnd(2)) {
        len = 3 + rnd(5);
        int d = rnd(5);
        for (int i = 0; i < len; i++) {
            phrase[i].deg = d;
            d += rnd(5) - 2;
            d = d < -2 ? -2 : d > 9 ? 9 : d;
            phrase[i].beats = 1 + (rnd(3) == 0);
            phrase[i].vowel = rnd(6);
            phrase[i].cons = rnd(16);
        }
        // End on the tonic, fifth or octave nearest.
        phrase[len - 1].deg = d < 2 ? 0 : d < 6 ? 4 : 7;
        phrase[len - 1].beats = 3 + rnd(2);
    } else {
        int s = rnd(5) - 2;
        for (int i = 0; i < len - 1; i++) {
            phrase[i].deg += s;
            if (rnd(3) == 0) phrase[i].vowel = rnd(6);
        }
    }
}

void next_event(void) {
    if (k >= len) {
        if (resting < 2) {
            // Rest, then breathe in.
            resting++;
            int_target = resting == 1 ? 0 : 0.5f;
            timer = beat * (resting == 1 ? 1 + rnd(3) : 1);
            return;
        }
        resting = 0;
        new_phrase();
        k = 0;
    }
    int deg = phrase[k].deg + 14;
    deg = deg < 11 ? 11 : deg > 24 ? 24 : deg;
    f_target = 440 * exp2_((root + scale[deg % 7] + 12 * (deg / 7) - 93) / 12.0f);
    timer = phrase[k].beats * beat;
    const unsigned char *v = vowels[phrase[k].vowel];
    v_i = v[0];
    v_d = v[1] / 20.0f;
    v_l = v[2] / 10.0f;
    int_target = 0.75f + 0.25f * frand();
    tense_target = base_tense + 0.15f * frand();
    cons = phrase[k].cons;
    if (cons < 8) cons_timer = 0.06f + 0.04f * frand();
    vib = 0;
    k++;
}

void control(void) {
    float bt = BLOCK * dt;
    timer -= bt;
    cons_timer -= bt;
    if (timer <= 0) next_event();
    tongue_i += (v_i - tongue_i) * 0.008f;
    tongue_d += (v_d - tongue_d) * 0.008f;
    lips += (v_l - lips) * 0.008f;
    f_smooth += (f_target - f_smooth) * 0.03f;
    // (Voicing weakens while the tract is closed, as the pressure behind the closure builds.)
    intensity = towards(intensity, obstruction < 0 ? int_target : int_target * 0.3f, 11 * bt, 4 * bt);
    vib += (vib_amt - vib) * 0.002f;
    vib_phase += 5.5f * bt;
    vib_phase -= floorf(vib_phase);
    // A slow random wobble in pitch and tension (Pink Trombone uses simplex noise).
    wob += (frand() * 2 - 1 - wob) * 0.02f;
    // While resting, the voice is just breath.
    tense = resting == 2 ? 0 : tense_target + wob;

    // The tongue's shape, then the lips and any consonant.
    for (int i = 0; i < N; i++) {
        float d = i < 7 ? 0.6f : i < 12 ? 1.1f : 1.5f;
        if (i >= BLADE && i < LIP) {
            float p = 0.025f * (tongue_i - i) + 0.25f;
            float c = (3.2f - (2 + (tongue_d - 2) / 1.5f)) * sin1(p - floorf(p));
            if (i == LIP - 1) c *= 0.8f;
            if (i == BLADE || i == LIP - 2) c *= 0.94f;
            d = 1.5f - c;
        }
        target[i] = d;
    }
    if (lips < 3) constrict(41, lips);
    int on = cons_timer > 0;
    const unsigned char *c = consonants[cons & 7];
    if (on) {
        fric_pos = c[0];
        constrict(c[0], c[1] / 10.0f);
    }
    fric_amt += (on - fric_amt) * 0.05f;
    velum_target = on && c[2] ? 0.4f : 0.01f;

    // Move the tract towards its target, and work out the reflections between sections.
    float amount = bt * 15;
    int obs = -1;
    for (int i = 0; i < N; i++) {
        float d = diam[i];
        if (d <= 0) obs = i;
        float slow = i < NOSE_START ? 0.6f : i >= TIP ? 1 : 0.6f + 0.4f * (i - NOSE_START) / (TIP - NOSE_START);
        diam[i] = towards(d, target[i], slow * amount, 2 * amount);
    }
    if (obstruction >= 0 && obs < 0 && velum < 0.223f) {
        trans = 0.15f;
        trans_pos = obstruction;
    }
    obstruction = obs;
    velum = towards(velum, velum_target, amount * 0.25f, amount * 0.1f);
    for (int i = 1; i < N; i++) {
        float a0 = diam[i - 1] * diam[i - 1], a1 = diam[i] * diam[i];
        refl[i] = a1 == 0 ? 0.999f : (a0 - a1) / (a0 + a1);
    }
    float a0 = diam[NOSE_START] * diam[NOSE_START], a1 = diam[NOSE_START + 1] * diam[NOSE_START + 1];
    float an = velum * velum, sum = a0 + a1 + an;
    reflL = (2 * a0 - sum) / sum;
    reflR = (2 * a1 - sum) / sum;
    reflN = (2 * an - sum) / sum;
}

svf_t asp_f, fric_f;
float prev;
int block;

void setup(unsigned int seed) {
    rng = seed * 2654435769u + 1;
    // Nose
    float prev = 0;
    for (int i = 0; i < NOSE; i++) {
        float d = 2.0f * i / NOSE;
        d = fminf(d < 1 ? 0.4f + 1.6f * d : 0.5f + 1.5f * (2 - d), 1.9f);
        d *= d;
        nrefl[i] = (prev - d) / (prev + d);
        prev = d;
    }
    obstruction = -1;
    tense = 0.6f;
    setup_waveform();
    root = 48 + rnd(8);
    int mode = rnd(6);
    for (int i = 1; i < 8; i++) scale[i] = scale[i - 1] + steps[(i - 1 + mode) % 7];
    beat = 0.32f + 0.2f * frand();
    base_tense = 0.55f + 0.25f * frand();
    vib_amt = 0.006f + 0.008f * frand();
    tongue_i = v_i = 20;
    tongue_d = v_d = 2.8f;
    lips = v_l = 3;
    for (int i = 0; i < N; i++) diam[i] = 1.5f;
    f_target = f_smooth = freq = 140;
    resting = 1;
}

float process() {
    if (--block <= 0) {
        block = BLOCK;
        control();
    }
    // Noise, filtered as Pink Trombone's: aspiration around 500 Hz, turbulence around 1 kHz.
    float n = frand() * 2 - 1;
    svf(&asp_f, n, 0.0712f, 2);
    svf(&fric_f, frand() * 2 - 1, 0.1425f, 2);
    ph += freq * dt;
    if (ph >= 1) {
        ph -= 1;
        freq = f_smooth * (1 + vib * sin1(vib_phase) + 0.15f * wob);
        setup_waveform();
    }
    float g = ph > Te ? (shift - EXP(-eps * (ph - Te))) / delta : E0 * EXP(alpha * ph) * sin1(ph * wscale);
    nmod = tense * intensity * (0.1f + 0.2f * fmaxf(0, sin1(ph))) + (1 - tense * intensity) * 0.3f;
    g = g * intensity * loudness + intensity * (1 - sqrtf(tense)) * nmod * asp_f.bp * 0.2f;
    float f = 0.33f * fric_f.bp * fric_amt * nmod;
    // (Averaging the last two samples removes a whine at the top of the spectrum that a closure can leave.)
    float y = tract(g, f) + tract(g, f), out = soft_clip((y + prev) * 0.05f);
    prev = y;
    return out;
}
