// choir: a small a cappella choir sings an endless generative chorale.
// Four parts (SATB), three singers each: sawtooth "glottis" with vibrato,
// shaped by three formant resonators per part that glide between vowels.
// Harmony is a Markov chain of diatonic triads with phrase-final cadences,
// voiced in close position (smooth voice leading), with soprano passing tones.
#define E(n) __attribute__((export_name(n)))
#define NI __attribute__((noinline))
typedef unsigned u32;
#define SR 44100.f
#define NC 8

char d[] = "chorale";

typedef struct {
    u32 rs; int cnt, len, pos, phr, ch, next, root, vow, top, sop;
    float amp, sw;
    int sc[7], note[4];
    float fr[4], fq[3], ph[12], y1[12], y2[12], vl[12];
    float cf[NC]; int ci[NC], ai[2];
} State;
#define G ((State *)16)
#define S (*G)

#define cb ((float(*)[4096])0x10000)
#define ab ((float(*)[1024])0x30000)

NI static u32 rnd(void) { u32 r = S.rs; r ^= r << 13; r ^= r >> 17; r ^= r << 5; return S.rs = r; }
NI static int ri(int n) { return rnd() % n; }
static float frac(float x) { return x - __builtin_floorf(x); }
NI static float sn(float p) {              // ~ -sin(2 pi p)
    float x = frac(p) * 2 - 1, y = 4 * x * (1 - __builtin_fabsf(x));
    return .225f * (y * __builtin_fabsf(y) - y) + y;
}
NI static float m2f(int m) { float f = 8.1758f / SR; while (m--) f *= 1.0594631f; return f; }
NI static int deg(int d) { d += 70; return S.root - 120 + 12 * (d / 7) + S.sc[d % 7]; }

// vowel formants F1 F2 F3 in units of 16 Hz: a, o, u, e, i
static const unsigned char vowels[][3] = {{50, 72, 181}, {28, 50, 176}, {22, 38, 169}, {28, 113, 159}, {17, 140, 189}};
// next-chord choices for each scale degree (4 options, as degrees)
static const unsigned char markov[7][4] = {
    {3, 4, 5, 1}, {4, 4, 6, 3}, {5, 3, 5, 3}, {4, 0, 1, 4}, {0, 5, 0, 0}, {1, 3, 1, 4}, {0, 0, 0, 0},
};

static int win(int t, int b) { return (t - b + 70) % 7 + b; }   // degree t moved into [b, b+6]

NI static void chord(void) {
    // 8-chord phrase: free (Markov) chords, then predominant, dominant, tonic (or deceptive vi)
    int c = S.next, p = S.pos, w = S.phr % 4, x[3];
    S.ch = c;
    S.next = p == 4 ? (ri(2) ? 3 : 1) : p == 5 ? 4 : p == 6 ? (ri(4) ? 0 : 5) : markov[c][ri(4)];
    if (++S.pos > 7) S.pos = 0, S.phr++, S.vow = ri(5);
    // upper three parts: close-position triad inside a window that rises and falls by phrase
    w = 6 + (w > 2 ? 1 : w);
    for (int i = 0; i < 3; i++) x[i] = win(c + 2 * i, w);
    for (int i = 0; i < 2; i++)
        for (int j = 0; j < 2 - i; j++)
            if (x[j] > x[j + 1]) { int q = x[j]; x[j] = x[j + 1]; x[j + 1] = q; }
    S.top = 0;
    for (int i = 0; i < 3; i++) { S.note[i + 1] = deg(x[i]); int y = win(S.next + 2 * i, w); if (y > S.top) S.top = y; }
    S.sop = x[2];
    S.note[0] = deg(c - 7 - (c > 3) * 7);
    S.len = (p == 7 ? 3 : 2) * 13000 + ri(3) * 1000;
    S.cnt = S.len;
}

E("s") void s(u32 seed) {
    S.rs = seed | 1;
    int a = 0;
    for (int i = 0; i < 7; i++) S.sc[i] = a, a += 1 + (0x3b >> i & 1);
    S.root = 48 + ri(7);
    chord();
}

static const short cl[NC] = {1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116}, al[2] = {556, 441};

E("p") float p(void) {
    if (--S.cnt <= 0) chord();
    float t = 1 - (float)S.cnt / S.len;     // position in chord, 0..1
    // re-articulate each chord: a short dip, then swell; phrase-level crescendo
    float tgt = (t < .04f ? .5f : 1) * (.55f + .45f * sn(S.pos / 16.f + t / 8));
    S.amp += (tgt - S.amp) * .0004f;
    const unsigned char *vw = vowels[(S.vow + (S.pos >> 1)) % 5];
    float out = 0;
    for (int k = 0; k < 3; k++) S.fq[k] += (vw[k] * 16 / SR - S.fq[k]) * .0003f;
    for (int v = 0; v < 4; v++) {
        int n = S.note[v];
        // soprano passing tone in the second half when the melody moves by a third
        if (v == 3 && t > .5f && S.pos && (S.top - S.sop == 2 || S.sop - S.top == 2)) n = deg((S.top + S.sop) / 2);
        S.fr[v] += (m2f(n) - S.fr[v]) * .002f;
        float src = 0;
        for (int j = 0; j < 3; j++) {
            int i = v * 3 + j;
            S.vl[i] = frac(S.vl[i] + (4.7f + i * .13f) / SR);
            S.ph[i] = frac(S.ph[i] + S.fr[v] * (1 + .006f * sn(S.vl[i]) + (j - 1) * .003f));
            src += S.ph[i] * (2 - 3 * S.ph[i]);         // KLGLOTT88-style glottal flow derivative
        }
        // three formant resonators in cascade (Klatt), formants a little higher for higher parts
        float sh = 1 + v * .07f, y = src + (int)rnd() * 1e-11f;  // + breath
        for (int k = 0; k < 3; k++) {
            int i = v * 3 + k;
            float r = 1 - (.012f + .006f * k), B = 2 * r * sn(S.fq[k] * sh + .75f), C = -r * r;
            float z = (1 - B - C) * y + B * S.y1[i] + C * S.y2[i];
            S.y2[i] = S.y1[i]; S.y1[i] = y = z;
        }
        out += y * (v ? 1 : 1.3f);
    }
    out *= S.amp * .18f;
    // hall reverb
    float r = 0;
    for (int i = 0; i < NC; i++) {
        float *b = cb[i] + S.ci[i], z = *b;
        S.cf[i] = z * .6f + S.cf[i] * .4f;
        *b = out * .08f + S.cf[i] * .9f;
        if (++S.ci[i] >= cl[i] * 2) S.ci[i] = 0;
        r += z;
    }
    for (int i = 0; i < 2; i++) {
        float *b = ab[i] + S.ai[i], z = *b;
        *b = r + z * .5f; r = z - r;
        if (++S.ai[i] >= al[i]) S.ai[i] = 0;
    }
    float o = out + r * .35f;
    return o / (1 + __builtin_fabsf(o));
}
