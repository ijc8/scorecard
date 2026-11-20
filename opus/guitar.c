// guitar: a fingerstyle guitarist plays an endless generative piece.
// Six Karplus-Strong strings in standard tuning. Chord shapes are found on the
// fretboard (lowest fret 0-4 on each string that gives a chord tone, bass on the
// root), then picked in a per-song Travis/arpeggio pattern with humanized timing.
#define E(n) __attribute__((export_name(n)))
#define NI __attribute__((noinline))
typedef unsigned u32;
#define SR 44100.f

char d[] = "fingerstyle";

typedef struct {
    u32 rs; int n, cnt, step, spb, root, bass, pat, prog, chord, sec;
    int sc[7], fret[6];
    float len[6], prev[6], prev2[6], dl[6], pp[6], g[6], ex[6], exa[6], exl[6], bright[6], b1, b2, c1, c2;
    float cf[6];
} State;
#define G ((State *)16)
#define S (*G)
#define sbuf ((float(*)[2048])0x10000)   // string delay lines
#define cb ((float(*)[2048])0x20000)     // reverb combs

NI static u32 rnd(void) { u32 r = S.rs; r ^= r << 13; r ^= r >> 17; r ^= r << 5; return S.rs = r; }
NI static int ri(int n) { return rnd() % n; }
NI static float ns(void) { return (int)rnd() * (1.f / 2147483648.f); }

static const unsigned char open[6] = {40, 45, 50, 55, 59, 64};       // E A D G B E
static const unsigned short progs[] = {0x0534, 0x0453, 0x5304, 0x0354, 0x0315, 0x5340, 0x3405, 0x0213};
// picking patterns, 8 eighth notes, 3 bits per step: 0 = bass, 1 = alternate bass, 2..5 = strings 2..5 (D G B e), 6 = pinch (bass + e), 7 = rest
static const u32 pats[] = {
    0 | 3 << 3 | 1 << 6 | 4 << 9 | 0 << 12 | 3 << 15 | 1 << 18 | 5 << 21,     // travis
    6 | 3 << 3 | 1 << 6 | 4 << 9 | 0 << 12 | 5 << 15 | 1 << 18 | 3 << 21,     // travis with pinch
    0 | 2 << 3 | 3 << 6 | 4 << 9 | 5 << 12 | 4 << 15 | 3 << 18 | 2 << 21,     // rolling arpeggio
    0 | 3 << 3 | 4 << 6 | 5 << 9 | 1 << 12 | 3 << 15 | 4 << 18 | 5 << 21,     // p i m a
};

static void pluck(int s, float a, float delay) {
    if (s < 0 || s > 5) return;
    // loop filter delay: 1 sample on the wound strings (dark 1-2-1 filter), 0.25 on the plain ones
    float f = 8.1758f; for (int m = open[s] + S.fret[s]; m--;) f *= 1.0594631f;
    S.len[s] = SR / f - (s < 3 ? 1 : .25f);
    S.ex[s] = S.len[s]; S.exa[s] = a * (.8f + .2f * ns()); S.g[s] = .996f;
    S.dl[s] = delay; S.pp[s] = .13f + .1f * ns();         // pluck position along the string
    S.bright[s] = s < 3 ? .2f : .45f;                       // thumb is darker than fingers
}

static void chord(void) {
    int c = S.prog >> (12 - 4 * (S.chord & 3)) & 15, pc[3];
    for (int i = 0; i < 3; i++) { int d = c + 2 * i; pc[i] = (S.root + S.sc[d % 7] + 12 * (d / 7)) % 12; }
    S.bass = -1;
    for (int s = 0; s < 6; s++) {
        int f = 0, old = S.fret[s];
        for (; f < 5; f++) {
            int p = (open[s] + f) % 12;
            if (S.bass < 0 ? p == pc[0] : (p == pc[0] || p == pc[1] || p == pc[2])) break;
        }
        if (S.bass < 0) { if (f < 5 && s < 3) S.bass = s; else f = 0; }
        if (f == 5) f = 0;   // no chord tone in reach: ring open (rare, colorful)
        S.fret[s] = f;
        if (f != old) S.g[s] = .95f;   // fretting hand lifts: damp the old note
    }
}

static void newsong(void) {
    int a = 0, roots[] = {0, 2, 4, 7, 9};
    for (int i = 0; i < 7; i++) S.sc[i] = a, a += 1 + (0x3b >> i & 1);
    S.root = roots[ri(5)];
    S.prog = progs[ri(8)];
    S.pat = pats[ri(4)];
    S.spb = (int)(SR * 30) / (66 + ri(30));     // eighth notes
}

E("s") void s(u32 seed) {
    S.rs = seed * 0x9e3779b1 + 1;
    newsong();
    chord();
}

E("p") float p(void) {
    if (--S.cnt <= 0) {
        int st = S.step & 7;
        S.cnt = S.spb + (int)(ns() * S.spb * .04f);
        if (!st) {
            if (++S.chord % 16 == 0) { if (++S.sec % 4 == 0) newsong(); else S.prog = progs[ri(8)]; }
            chord();
        }
        int k = S.pat >> (3 * st) & 7;
        // last bar of each 4: strum the chord and let it ring
        if ((S.chord & 3) == 3 && st == 0) for (int s = 0; s < 6; s++) S.ex[s] = 0, pluck(s >= S.bass ? s : -1, .7f, (s - S.bass) * 260);
        else if ((S.chord & 3) != 3 || st < 4) {
            if (k < 2) pluck(k ? (S.bass ? S.bass + 1 : 2) : S.bass, st ? .7f : 1, 0);   // thumb alternates
            else if (k < 6) pluck(k, .55f, 0);
            else if (k == 6) pluck(S.bass, 1, 0), pluck(5, .6f, 0);
        }
        S.step++;
    }
    int n = S.n++;
    float out = 0;
    for (int s = 0; s < 6; s++) {
        float *b = sbuf[s], L = S.len[s];
        int li = (int)L, i = n - li; float fr = L - li;          // fractional delay, linear interpolation
        float y = b[i & 2047] * (1 - fr) + b[(i - 1) & 2047] * fr;
        float x = (s < 3 ? (y + 2 * S.prev[s] + S.prev2[s]) * .25f : y * .75f + S.prev[s] * .25f) * S.g[s];
        S.prev2[s] = S.prev[s]; S.prev[s] = y;
        if (S.dl[s] > 0) S.dl[s]--;
        else if (S.ex[s] > 0) {
            // excitation: triangular pluck shape (plus a little noise), lowpassed by the finger
            float u = 1 - S.ex[s]-- / L, pp = S.pp[s], sh = (u < pp ? u / pp : (1 - u) / (1 - pp)) - .5f + .15f * ns();
            S.exl[s] += (sh - S.exl[s]) * S.bright[s]; x += S.exl[s] * S.exa[s];
        }
        b[n & 2047] = x;
        out += y;
    }
    // body: two resonances (~100 Hz, ~220 Hz)
    S.c1 += .0142f * S.b1; S.b1 += .0142f * (out - S.c1 - .15f * S.b1);   // Chamberlin bandpasses
    S.c2 += .0313f * S.b2; S.b2 += .0313f * (out - S.c2 - .25f * S.b2);
    out = out * .5f + S.b1 * .35f + S.b2 * .25f;
    // small room
    float r = 0;
    for (int i = 0; i < 6; i++) {
        float *b = cb[i], z = b[(n - 1116 - i * 113) & 2047];
        S.cf[i] = z * .6f + S.cf[i] * .4f;
        b[n & 2047] = out * .05f + S.cf[i] * .8f;
        r += z;
    }
    out = (out + r * .25f) * .7f;
    return out / (1 + __builtin_fabsf(out));
}
