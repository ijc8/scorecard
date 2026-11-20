// acid: an endless acid-techno jam in a QR code.
// A 303-style line (saw -> resonant filter with accent and slide) whose 16-step pattern mutates
// every four bars, over kick, clap and hats; the filter opens and closes over 32-bar arcs.
// Freestanding C (no libc, no stack): build with ./build.sh acid.c

typedef unsigned u32;
#define SR 44100.f
#define floorf __builtin_floorf
#define fabsf __builtin_fabsf
#define NOINLINE __attribute__((noinline))

char d[] = "acid";

#define ECHO ((float *)0x10000)

static u32 rs;
NOINLINE static u32 rnd(void) {
    rs ^= rs << 13;
    rs ^= rs >> 17;
    rs ^= rs << 5;
    return rs;
}

NOINLINE static float sn(float p) {
    p -= floorf(p) + .5f;
    return p * (16 * fabsf(p) - 8);
}

static const signed char scale[] = {0, 0, 0, 12, 3, 7, 10, -2}; // minor, root-heavy
static unsigned char pat[16];                                    // bits 0-2 note, 3 gate, 4 accent, 5 slide, 6 octave
static int spt, cnt, step, key, n;
static float fT, f, ph, env, acc, low, band, kick, kickPh, hat, clap, lastNoise, duck;

void s(u32 seed) {
    rs = seed + 0x9E3779B9;
    key = rnd() % 8;
    spt = 4900 + rnd() % 700; // 118-135 bpm
    for (int i = 0; i < 16; i++) pat[i] = rnd() | (i & 3 ? 0 : 8);
}

float p(void) {
    if (--cnt < 0) {
        cnt = spt;
        int s16 = step & 15, bar = step >> 4, x = pat[s16];
        if (!(step & 63)) pat[rnd() & 15] = rnd(); // mutate one step every 4 bars
        if (x & 8) {
            int note = key + scale[x & 7] + (x & 64 ? 12 : 0);
            fT = 55 / SR;
            while (note--) fT *= 1.0594631f;
            if (!(pat[(step - 1) & 15] & 32)) env = 1, f = fT; // no slide: retrigger
            if (x & 16) acc = 1;
        }
        // drums drop out for the last bar of every 8 and for the first 4 bars
        int drums = bar > 3 && (bar & 7) != 7;
        if (drums && !(s16 & 3)) kick = duck = 1, kickPh = 0;
        if (drums && (s16 & 7) == 4) clap = 1;
        if (bar > 1 && (s16 & 3) == 2) hat = 1;
        else if (bar & 4 && rnd() & 1) hat = .4f;
        step++;
    }
    n++;
    float nz = (int)rnd() * (1.f / 2147483648.f);

    // 303: saw -> state-variable lowpass, cutoff driven by a decaying envelope plus accent
    f += (fT - f) * .002f; // slide
    ph += f;
    ph -= floorf(ph);
    env *= .9998f;
    acc *= .9996f;
    float sweep = .5f + .5f * sn(n / (spt * 512.f) - .25f); // 0..1..0 over 32 bars
    float fc = .02f + (.08f + .5f * sweep) * env * env + .25f * acc + .05f * sweep;
    low += fc * band;
    band += fc * (ph * 2 - 1 - low - .12f * band);
    float bass = low * (.5f + .5f * acc);
    bass /= 1 + fabsf(bass); // growl

    // drums
    kick *= .9997f;
    duck *= .9999f;
    kickPh += .0011f + .007f * kick * kick;
    clap *= .9993f;
    hat *= .998f;
    float drums = sn(kickPh) * kick * .9f + nz * clap * clap * .3f + (nz - lastNoise) * hat * .1f;
    lastNoise = nz;

    // dotted-eighth echo on the 303
    float *e = ECHO + n % (spt * 3);
    float wet = bass + *e * .4f;
    *e = wet;

    float x = (bass * .4f + wet * .15f) * (1 - .6f * duck) + drums;
    if (x > 1.5f) x = 1.5f;
    if (x < -1.5f) x = -1.5f;
    return x - x * x * x * (4.f / 27);
}
