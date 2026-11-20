// choir: an endless ambient piece for eight synthetic singers and a harp, in a QR code.
// Each singer repeats one long note on a loop of its own length (as in tape-loop pieces), so the
// chords never line up the same way twice; each time round a singer may step to a neighbouring note.
// Freestanding C (no libc, no stack): build with ./build.sh choir.c

typedef unsigned u32;
#define SR 44100.f
#define floorf __builtin_floorf
#define fabsf __builtin_fabsf
#define NOINLINE __attribute__((noinline))

char d[] = "choir";

#define KS ((float *)0x10000)  // plucked string, 2048 samples
#define REV ((float *)0x40000) // 4 reverb lines x 16384 samples

static u32 rs;
NOINLINE static u32 rnd(void) {
    rs ^= rs << 13;
    rs ^= rs >> 17;
    rs ^= rs << 5;
    return rs;
}

// sin(2*pi*p), parabolic approximation
NOINLINE static float sn(float p) {
    p -= floorf(p) + .5f;
    return p * (16 * fabsf(p) - 8);
}

static int key;
// pentatonic step -> frequency in cycles per sample
NOINLINE static float w2f(int w) {
    int n = key + (w * 7 / 5 * 12 + 5) / 7;
    float f = 8.1758f * 12 / SR; // G2
    while (n--) f *= 1.0594631f;
    return f;
}

#define NV 8
static struct { float loop, rate, f, ph; int w; } v[NV];
static float dc, damp[4], rv[4], ksDelay, ksPrev, harp, harpRate, lastNoise;
static u32 n;
static int ksExc;

void s(u32 seed) {
    rs = seed + 0x9E3779B9;
    key = rnd() % 12;
    for (int k = 0; k < NV; k++) {
        v[k].loop = k ? (rnd() & 1023) * (1.f / 1024) : .1f;
        v[k].rate = 1 / (SR * (14 + rnd() % 16 + k * .37f));
        v[k].f = w2f(v[k].w = rnd() % 5 + k);
    }
    harp = .7f;
    harpRate = 1 / (SR * (5 + rnd() % 4 + .21f));
}

float p(void) {
    float t = ++n * (1 / SR), nz = (int)rnd() * (1.f / 2147483648.f), mix = 0;

    for (int k = 0; k < NV; k++) {
        float x = (v[k].loop += v[k].rate) * 2.2f;
        if (x > 2.2f) {
            // next time round: maybe move a step
            v[k].loop = 0;
            v[k].w += rnd() % 3 - 1;
            if (v[k].w < 0) v[k].w = 1;
            if (v[k].w > 12) v[k].w = 11;
            v[k].f = w2f(v[k].w);
        }
        if (x < 1) {
            // formant-wave voice: three sines at the formant frequencies, restarted every glottal period
            float f = v[k].f * (1 + .005f * sn(t * (4.6f + k * .23f)));
            float ph = v[k].ph + f;
            v[k].ph = ph -= floorf(ph);
            float tau = ph / f, w = 1 - ph, l = sn(t * (.031f + k * .007f)), e = 4 * x * (1 - x);
            mix += (sn(tau * (500 + 220 * l) / SR) + .5f * sn(tau * (900 + 250 * l) / SR) + .15f * sn(tau * (2800 / SR))) * w * w * e * e;
        }
    }
    dc += (mix - dc) * .002f; // the formant waves aren't zero-mean
    mix = (mix - dc) * .12f;

    // harp: one Karplus-Strong string, plucked on its own loop
    if ((harp += harpRate) > 1) {
        harp = 0;
        ksDelay = 1 / w2f(7 + rnd() % 8) - .5f;
        ksExc = ksDelay;
    }
    int w = n & 2047;
    float rp = w + 2048 - ksDelay;
    int i = rp;
    float fr = rp - i;
    float o = KS[i & 2047] * (1 - fr) + KS[(i + 1) & 2047] * fr;
    float y = (o + ksPrev) * .499f;
    ksPrev = o;
    if (ksExc > 0) {
        ksExc--;
        y = (nz + lastNoise) * .4f; // soft pluck
    }
    lastNoise = nz;
    KS[w] = y;
    mix += y * .25f;

    // reverb: 4-line feedback delay network, Householder feedback, damped
    float sum = 0;
    for (int i = 0; i < 4; i++) {
        float *r = REV + i * 16384 + n % (7001 + i * 2154);
        damp[i] += (*r - damp[i]) * .35f;
        sum += rv[i] = damp[i];
    }
    for (int i = 0; i < 4; i++) REV[i * 16384 + n % (7001 + i * 2154)] = mix + .93f * (rv[i] - sum * .5f);

    float x = mix * .7f + sum * .22f;
    if (x > 1.5f) x = 1.5f;
    if (x < -1.5f) x = -1.5f;
    return x - x * x * x * (4.f / 27);
}
