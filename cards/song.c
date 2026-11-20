// song: a generative pop song with a scat singer and a choir, in a QR code.
// Every seed is a different album: each ~2.5-minute song picks its own key, tempo,
// groove, chord progression and melody, then the next one starts.
// Freestanding C (no libc, no stack): build with ./build.sh song.c

typedef unsigned u32;
#define SR 44100.f
#define floorf __builtin_floorf
#define fabsf __builtin_fabsf
#define NOINLINE __attribute__((noinline))

char d[] = "song";

// Big zero-initialised buffers live at fixed addresses above the linker's data.
#define KS ((float *)0x10000)   // 3 plucked strings x 2048 samples
#define ECHO ((float *)0x20000) // tempo-synced echo, up to 32768 samples
#define REV ((float *)0x40000)  // 4 reverb lines x 8192 samples

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
// scale degree -> frequency in cycles per sample (major scale: (d*12+5)/7 semitones)
NOINLINE static float d2f(int deg) {
    int n = key + (deg * 12 + 5) / 7;
    float f = 8.1758f * 8 / SR; // MIDI 36
    while (n--) f *= 1.0594631f;
    return f;
}

// Formant-wave voice: three sines at the formant frequencies, restarted and
// faded out once per glottal period.
NOINLINE static float fof(float *ph, float f, float f1, float f2) {
    float p = *ph + f;
    *ph = p -= floorf(p);
    float tau = p / (f + 1e-9f), w = 1 - p;
    return (sn(tau * f1) + .5f * sn(tau * f2) + .2f * sn(tau * (2800 / SR))) * w * w;
}

// chord progressions, one scale-degree root per nibble
static const unsigned short progs[] = {0x3540, 0x4035, 0x4350, 0x0543, 0x4345, 0x5041, 0x4530, 0x4305};
// which layers play in each 4-bar section
enum { PLUCK = 1, PAD = 2, BASS = 4, HAT = 8, KICK = 16, SNARE = 32, LEAD = 64, ALT = 128 };
static const unsigned char form[] = {
    PLUCK,
    PLUCK | PAD,
    PLUCK | PAD | BASS | HAT,
    PLUCK | PAD | BASS | HAT | KICK | SNARE,
    PAD | BASS | HAT | KICK | SNARE | LEAD,
    PLUCK | PAD | BASS | HAT | KICK | SNARE | LEAD,
    PAD | LEAD | ALT,
    PAD | LEAD | ALT | PLUCK | HAT,
    PLUCK | PAD | BASS | HAT | KICK | SNARE,
    PLUCK | PAD | BASS | HAT | KICK | SNARE | LEAD,
    PAD | BASS | HAT | KICK | SNARE | LEAD | ALT,
    PLUCK | PAD | BASS | HAT | KICK | SNARE | LEAD | ALT,
    PLUCK | PAD | BASS | HAT | KICK | SNARE,
    PLUCK | BASS | HAT | KICK | SNARE,
    PLUCK | PAD,
    PLUCK,
};
// vowel formants F1, F2 in units of 25 Hz: a o u e i
static const unsigned char vowels[] = {32, 46, 18, 32, 13, 28, 20, 68, 11, 92};

// Every envelope and smoothed parameter is one slot: C chases T at rate R*R/2^22 per sample.
enum { PADF, PADAMP = 4, SIDE, BASSE, KICKE, SNAREE, HATE, LEADE, DIP, LEADF, VIB, FM1, FM2, CRASH, NENV };
static float T[NENV], C[NENV];
static const unsigned char R[NENV] = {92, 92, 92, 92, 20, 20, 29, 35, 54, 92, 13, 92, 112, 20, 71, 71, 14};

static int spt, cnt, step, pi, bassPat, kickPat, arpPat, n;
static signed char mot[16], arp[8];
static float padPh[4], bassF, bassPh, kickPh, lastNoise, leadPh, dc, damp[4], rv[4];
static struct { float delay, prev, amp; int exc; } ks[3];
static int ksW, ksNext;

void s(u32 seed) { rs = seed + 0x9E3779B9; }

static void tick(void) {
    if (!(step & 1023)) {
        // new song
        key = rnd() % 7;
        pi = rnd();
        spt = 5200 + rnd() % 1800;
        bassPat = rnd() | 1;
        kickPat = rnd() & 1 ? 0x1111 : 0x0481;
    }
    if (!(step & 127)) {
        // new 8-bar phrase: new melody motif and arpeggio shape
        int deg = 4;
        for (int i = 0; i < 16; i++) {
            deg += rnd() % 5 - 2;
            if (deg < 0) deg = 0;
            if (deg > 9) deg = 9;
            mot[i] = i < 13 && (!(i & 3) || rnd() & 1) ? deg : -1;
        }
        for (int i = 0; i < 8; i++) arp[i] = rnd() % 6;
        arpPat = rnd() | rnd();
    }
    int s16 = step & 15, bar = step >> 4;
    int mask = form[bar >> 2 & 15];
    int root = progs[(pi + (mask >> 7) * 3) & 7] >> (bar & 3) * 4 & 15;
    int bit = 1 << s16;

    T[PADAMP] = mask >> 1 & 1;
    for (int k = 0; k < 4; k++) T[k] = d2f(14 + (root + (k < 3 ? k * 2 : 1)) % 7);

    if (mask & BASS && bassPat & bit) {
        bassF = d2f(root + (s16 % 8 == 6 ? 7 : 0));
        C[BASSE] = 1;
        bassPh = 0;
    }
    if (mask & KICK) {
        if (!(step & 63)) C[CRASH] = 1;
        if (kickPat & bit) {
            C[KICKE] = C[SIDE] = 1;
            kickPh = 0;
        }
    }
    if (mask & SNARE && 0x1010 & bit) C[SNAREE] = 1;
    if (mask & HAT && (!(s16 & 1) || !(rnd() % 3))) C[HATE] = (s16 & 3) ^ 2 ? .5f : 1;

    if (mask & PLUCK && arpPat & bit) {
        static const unsigned char tones[] = {0, 2, 4, 7, 9, 11};
        float *b = KS + ksNext * 2048;
        for (int i = 0; i < 2048; i++) b[i] = 0;
        ks[ksNext].delay = 1 / d2f(14 + root + tones[arp[s16 & 7]]) - .5f;
        ks[ksNext].exc = ks[ksNext].delay;
        ks[ksNext].amp = s16 & 3 ? .6f : 1;
        ksNext = (ksNext + 1) % 3;
    }

    int m = mot[step >> 1 & 15];
    if (mask & LEAD && !(s16 & 1) && m >= 0) {
        // snap strong beats to the nearest chord tone
        int deg = 7 + m, r = (m - root + 14) % 7;
        if (!(step & 6)) deg += r == 6 ? 1 : -(r & 1);
        T[LEADF] = d2f(deg);
        C[LEADE] = C[VIB] = 1;
        // scat syllable: a b/d-like closure, then a random vowel
        C[DIP] = .8f;
        C[FM1] = 200 / SR;
        C[FM2] = rnd() & 1 ? 700 / SR : 1900 / SR;
        int v = rnd() % 5 * 2;
        T[FM1] = vowels[v] * (25 / SR);
        T[FM2] = vowels[v + 1] * (25 / SR);
    }
    step++;
}

float p(void) {
    if (--cnt < 0) {
        tick();
        cnt = spt;
    }
    float t = ++n * (1 / SR);
    float nz = (int)rnd() * (1.f / 2147483648.f);
    for (int i = 0; i < NENV; i++) C[i] += (T[i] - C[i]) * (R[i] * R[i]) * (1.f / 4194304);

    // choir: four formant voices on the chord tones, vowel drifting between "oh" and "ah", ducked by the kick
    float pad = 0, l = sn(t * .05f);
    for (int k = 0; k < 4; k++)
        pad += fof(&padPh[k], C[k] * (1 + .004f * sn(t * (5 + k * .4f))), (550 + 200 * l) / SR, (950 + 200 * l) / SR);
    pad *= C[PADAMP] * (1 - .7f * C[SIDE]) * .12f;

    // bass: 2-operator FM with a decaying index
    bassPh += bassF;
    float bass = sn(bassPh + C[BASSE] * .4f * sn(bassPh)) * C[BASSE] * .5f;

    // drums
    kickPh += .0012f + .006f * C[KICKE] * C[KICKE];
    float drums = sn(kickPh) * C[KICKE] * .8f + nz * C[SNAREE] * C[SNAREE] * .35f +
                  (nz - lastNoise) * (C[HATE] * .12f + C[CRASH] * .1f);
    lastNoise = nz;

    // lead singer
    float lead = fof(&leadPh, C[LEADF] * (1 + .008f * (1 - C[VIB]) * sn(t * 5.5f)), C[FM1], C[FM2]) * C[LEADE] *
                 (1 - C[DIP]) * .3f;

    // plucks: Karplus-Strong with an interpolated delay
    float pluck = 0;
    ksW = (ksW + 1) & 2047;
    for (int v = 0; v < 3; v++) {
        float *b = KS + v * 2048;
        float rp = ksW + 2048 - ks[v].delay;
        int i = rp;
        float fr = rp - i;
        float o = b[i & 2047] * (1 - fr) + b[(i + 1) & 2047] * fr;
        float y = (o + ks[v].prev) * .498f;
        ks[v].prev = o;
        if (ks[v].exc > 0) {
            ks[v].exc--;
            y += nz * ks[v].amp;
        }
        b[ksW] = y;
        pluck += y;
    }

    // tempo-synced echo (dotted eighth) on plucks and lead
    float *e = ECHO + n % (spt * 3);
    float wetIn = pluck * .7f + lead + *e * .45f;
    *e = wetIn;

    // reverb: 4-line feedback delay network, Householder feedback, damped
    float rin = wetIn * .5f + pad * .6f, sum = 0;
    for (int i = 0; i < 4; i++) {
        float *r = REV + i * 8192 + n % (3001 + i * 1154);
        damp[i] += (*r - damp[i]) * .4f;
        sum += rv[i] = damp[i];
    }
    for (int i = 0; i < 4; i++) REV[i * 8192 + n % (3001 + i * 1154)] = rin + .88f * (rv[i] - sum * .5f);

    float x = pad + bass + drums + wetIn * .8f + sum * .2f;
#ifdef SOLO
    return SOLO;
#endif
    // DC blocker, soft clip
    dc += (x - dc) * .002f;
    x -= dc;
    if (x > 1.5f) x = 1.5f;
    if (x < -1.5f) x = -1.5f;
    return x - x * x * x * (4.f / 27);
}
