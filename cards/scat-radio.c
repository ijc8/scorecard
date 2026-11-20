// scat radio: an endless stream of generated pop songs, sung by a scat singer over a choir,
// plucked strings, bass and drums -- all in one QR code.
// Every seed is a different station. Each song (about 2-3 minutes: intro, verse, bridge, chorus,
// break, last chorus up a tone with a harmony singer, outro) picks its own key, tempo, groove,
// chord progression and melodies; then the next song starts.
// Freestanding C (no libc, no stack): build with ./build.sh scat-radio.c

typedef unsigned u32;
#define SR 44100.f
#define floorf __builtin_floorf
#define fabsf __builtin_fabsf
#define NOINLINE __attribute__((noinline))

char d[] = "scat radio";

#ifdef NATIVE
// Native debug build (prints the score instead of playing): see trace.sh
#include <stdio.h>
#define TRACE(...) printf(__VA_ARGS__)
static float KS[3 * 2048], ECHO[32768], REV[4 * 8192];
#else
#define TRACE(...)
// Big zero-initialised buffers live at fixed addresses above the linker's data.
#define KS ((float *)0x10000)   // 3 plucked strings x 2048 samples
#define ECHO ((float *)0x20000) // tempo-synced echo, up to 32768 samples
#define REV ((float *)0x40000)  // 4 reverb lines x 8192 samples
#endif

static u32 rs, song;
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
#define FULL (PLUCK | PAD | BASS | HAT | KICK | SNARE)
static const unsigned char form[] = {
    PLUCK,                             // intro
    PLUCK | PAD | HAT,                 //
    FULL - PLUCK | LEAD,               // verse
    FULL | LEAD,                       //
    PLUCK | PAD | LEAD | ALT,          // bridge
    PLUCK | PAD | LEAD | ALT | HAT | BASS,
    FULL | LEAD,                       // chorus
    FULL | LEAD,                       //
    FULL - PAD,                        // break
    FULL,                              //
    FULL | LEAD | ALT,                 // bridge, full band
    FULL | LEAD | ALT,                 //
    FULL | LEAD,                       // chorus
    FULL | LEAD,                       //
    PLUCK | PAD | LEAD,                // outro
    PLUCK,
};
// vowel formants F1, F2 in units of 25 Hz: a o u e i
static const unsigned char vowels[] = {32, 46, 18, 32, 13, 28, 20, 68, 11, 92};

// Every envelope and smoothed parameter is one slot: C chases T at rate R*R/2^22 per sample.
enum { PADF, PADAMP = 4, SIDE, BASSE, KICKE, SNAREE, HATE, LEADE, DIP, LEADF, HARMF, VIB, FM1, FM2, CRASH, NENV };
static float T[NENV], C[NENV];
static const unsigned char R[NENV] = {92, 92, 92, 92, 20, 20, 29, 35, 54, 92, 68, 79, 112, 112, 20, 71, 71, 14};

static int spt, cnt, step, pi, bassPat, kickPat, arpPat, n;
static signed char mot[16], arp[8];
static float padPh[4], bassF, bassPh, kickPh, lastNoise, leadPh, harmPh, harm, dc, damp[4], rv[4];
static struct { float delay, prev, amp; int exc; } ks[3];
static int ksW, ksNext;

void s(u32 seed) { song = seed; }

static void tick(void) {
    int s16 = step & 15, bar = step >> 4;
    if (!(step & 1023)) {
        // new song
        rs = song = song * 1664525 + 1013904223;
        key = rnd() % 7;
        pi = rnd();
        spt = 5200 + rnd() % 1800;
        bassPat = rnd() | 1;
        kickPat = rnd() & 1 ? 0x1111 : 0x0481;
        TRACE("\n=== song: key %d, %.0f bpm, prog %04x / %04x, kick %04x, bass %04x", key, SR * 15 / spt, progs[pi & 7], progs[(pi + 3) & 7], kickPat, bassPat & 0xffff);
    }
    int sec = bar >> 2 & 15, mask = form[sec];
    if ((step & 1023) == 768) key += 2; // last chorus: up a tone
    harm = sec > 9 ? .6f : 0;           // and a harmony singer for the last third
    int root = progs[(pi + (mask >> 7) * 3) & 7] >> (bar & 3) * 4 & 15;
    if (!(step & 127)) {
        // new 8-bar phrase. The verse/chorus and the bridge each reseed the generator the same way
        // every time, so their melody, arpeggio (and scat "lyrics") come back.
        rs = song + (mask >> 7);
        int w = 3;
        for (int i = 0; i < 16; i++) {
            w += rnd() % 5 - 2;
            if (w < 0) w = -w;
            if (w > 7) w = 14 - w;
            // pentatonic walk; always sing on the beat, sometimes off it, and hold the phrase's last note
            mot[i] = i < 13 && (!(i & 3) || rnd() & 1) ? w * 7 / 5 : -1;
        }
        for (int i = 0; i < 8; i++) arp[i] = rnd() % 6;
        arpPat = rnd() | rnd();
    }
    int bit = 1 << s16;
    if (!s16) TRACE("\n%s[sec %2d %02x] root %d | ", bar & 3 ? "" : "\n", sec, mask, root);
    

    T[PADAMP] = mask >> 1 & 1;
    for (int k = 0; k < 4; k++) T[k] = d2f(k < 3 ? 14 + (root + k * 2) % 7 : 7 + root);

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
        TRACE("p%d ", tones[arp[s16 & 7]]);
        ks[ksNext].amp = s16 & 3 ? .6f : 1;
        ksNext = (ksNext + 1) % 3;
    }

    if (!(s16 & 1)) {
        int m = mot[step >> 1 & 15];
        T[LEADE] *= .7f; // held notes fade
        if (mask & LEAD && m >= 0) {
            // snap strong beats to the nearest chord tone
            int deg = 7 + m, r = (m - root + 14) % 7;
            if (!(step & 6)) deg += r == 6 ? 1 : -(r & 1);
            T[LEADF] = d2f(deg);
            T[HARMF] = d2f(deg + 2);
            TRACE("L%d@%d ", deg - 7, s16);
            // scat syllable: a brief closure (see DIP below), then a random vowel
            T[LEADE] = C[DIP] = C[VIB] = 1;
            int v = rnd() % 5 * 2;
            T[FM1] = vowels[v] * (25 / SR);
            T[FM2] = vowels[v + 1] * (25 / SR);
        }
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

    // choir: four formant voices (a close triad and a low root), vowel drifting between "oh" and "ah", ducked by the kick
    float pad = 0, l = sn(t * .05f);
    for (int k = 0; k < 4; k++)
        pad += fof(&padPh[k], C[k] * (1 + .004f * sn(t * (5 + k * .4f))), (550 + 200 * l) / SR, (950 + 200 * l) / SR);
    pad *= C[PADAMP] * (1 - .7f * C[SIDE]) * .12f;

    // bass: 2-operator FM with a decaying index
    bassPh += bassF;
    float bass = sn(bassPh + C[BASSE] * .8f * sn(bassPh)) * C[BASSE] * .35f;

    // drums
    kickPh += .0012f + .006f * C[KICKE] * C[KICKE];
    float drums = sn(kickPh) * C[KICKE] * .6f + nz * C[SNAREE] * C[SNAREE] * .26f +
                  (nz - lastNoise) * (C[HATE] * .09f + C[CRASH] * .08f);
    lastNoise = nz;

    // lead singer (and harmony a third above). Each note starts with a consonant-like closure:
    // DIP decays from 1, and its bump 4d(1-d) briefly ducks the level and pulls the formants down.
    float vib = 1 + .008f * (1 - C[VIB]) * sn(t * 5.5f), bump = 4 * C[DIP] * (1 - C[DIP]);
    float f1 = C[FM1] * (1 - .6f * bump), f2 = C[FM2] * (1 - .4f * bump);
    float lead = (fof(&leadPh, C[LEADF] * vib, f1, f2) + harm * fof(&harmPh, C[HARMF] * vib, f1, f2)) * C[LEADE] *
                 (1 - .85f * bump) * .38f;

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
    for (int i = 0; i < 4; i++) REV[i * 8192 + n % (3001 + i * 1154)] = rin + .8f * (rv[i] - sum * .5f);

    float x = pad + bass + drums + wetIn * .8f + sum * .13f;
#ifdef SOLO
    return SOLO;
#endif
    // DC blocker (the formant waves aren't zero-mean), soft clip
    dc += (x - dc) * .002f;
    x -= dc;
    if (x > 1.5f) x = 1.5f;
    if (x < -1.5f) x = -1.5f;
    return x - x * x * x * (4.f / 27);
}

#ifdef NATIVE
int main(int argc, char **argv) {
    int seed = 1, secs = 150;
    if (argc > 1) sscanf(argv[1], "%d", &seed);
    if (argc > 2) sscanf(argv[2], "%d", &secs);
    s(seed);
    for (int i = 0; i < secs * 44100; i++) p();
    puts("");
}
#endif
