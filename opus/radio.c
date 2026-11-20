// radio: an endless generative song. Each song picks a key, mode, tempo,
// two chord progressions, a groove and a melody motif, then plays an arranged
// form through a Freeverb-style reverb and a dotted-eighth delay. Then the
// next song. All instruments are one generic voice driven by a preset table.
#define E(n) __attribute__((export_name(n)))
typedef unsigned u32;
#define SR 44100.f
#define NI __attribute__((noinline))

char d[] = "endless radio";

// All mutable state lives in one struct at a fixed low address, so loads and
// stores use 1-byte offsets (statics would land at 2-3 byte addresses).
typedef struct { float ph, ph2, f, pe, tgt, env, lp, bp; float *in; } Voice;
#define NV 10
#define NC 6
typedef struct {
    u32 rs; int cnt, step, spb, swing, bar, sec, parts, root, mrh, di;
    int sc[7], prog[2][4], groove[3], ci[NC], ai[2];
    float cf[NC];
    int motif[16];
    float mf[128];                      // midi -> cycles/sample
    float inst[7][14];
    Voice vc[NV];
} State;
#define G ((State *)16)
#define rs (G->rs)
#define cnt (G->cnt)
#define step (G->step)
#define spb (G->spb)
#define swing (G->swing)
#define bar (G->bar)
#define sec (G->sec)
#define parts (G->parts)
#define root (G->root)
#define mrh (G->mrh)
#define di (G->di)
#define sc (G->sc)
#define prog (G->prog)
#define groove (G->groove)
#define ci (G->ci)
#define ai (G->ai)
#define cf (G->cf)
#define motif (G->motif)
#define mf (G->mf)
#define inst (G->inst)
#define vc (G->vc)

NI static u32 rnd(void) { rs ^= rs << 13; rs ^= rs >> 17; rs ^= rs << 5; return rs; }
NI static int ri(int n) { return rnd() % n; }
static float ns(void) { return (int)rnd() * (1.f / 2147483648.f); }

static float frac(float x) { return x - __builtin_floorf(x); }
NI static float sn(float p) {              // ~sin(2 pi p), p >= 0
    float x = frac(p) * 2 - 1, y = 4 * x * (1 - __builtin_fabsf(x));
    return .225f * (y * __builtin_fabsf(y) - y) + y;
}
static float sat(float x) { return x / (1 + __builtin_fabsf(x)); }

// ---- instruments: 14 bytes each
// sin saw noise detune penv cut cutenv q hp gain send | pdec att dec (times)
// value = b^3 / 2^18; times are rates = 1 / b^3 per sample
enum { SIN, SAW, NOI, DET, PEN, CUT, CEN, Q, HP, GAIN, SEND, PDE, ATT, DEC, NP };
static const unsigned char presets[][NP] = {
    {64, 0, 0, 0, 77, 64, 0, 64, 0, 77, 0, 9, 2, 16},  // 0 kick
    {43, 0, 55, 0, 40, 34, 24, 64, 0, 61, 37, 7, 2, 10},  // 1 snare
    {0, 0, 64, 0, 0, 49, 0, 72, 101, 40, 25, 2, 2, 7},  // 2 hat
    {0, 55, 0, 64, 0, 12, 27, 59, 0, 63, 0, 2, 6, 17},  // 3 bass
    {0, 51, 0, 8, 0, 22, 29, 55, 0, 55, 63, 2, 5, 21},  // 4 lead
    {64, 0, 0, 64, 0, 64, 0, 64, 0, 50, 66, 2, 2, 15},  // 5 arp/pluck
    {0, 46, 0, 7, 0, 24, 12, 66, 0, 46, 46, 2, 26, 54},  // 6 pad (x4)
};


NI static void trig(int v, int ins, int note, float vel) {
    Voice *o = vc + v;
    o->in = inst[ins]; o->f = mf[note]; o->tgt = vel * (1 + .12f * ns()); o->pe = o->in[PEN];
    if (o->in[ATT] > .05f) o->env = 0;
}

// ---- song state

NI static int deg(int d) { d += 70; return root - 120 + 12 * (d / 7) + sc[d % 7]; }

static const unsigned short progs[] = {
    0x0534, 0x0453, 0x5304, 0x0354, 0x0315, 0x5340, 0x3405, 0x0213,
};
// form, one byte per 8-bar section. bits: 1 pad, 2 kick, 4 hats, 8 snare,
// 16 bass, 32 lead, 64 arp, 128 fill at the end of the section
static const unsigned char form[] = {1, 1 | 4 | 16, 1 | 2 | 4 | 8 | 16 | 32 | 128, 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128,
                                     1 | 64, 1 | 4 | 32 | 64 | 128, 1 | 2 | 4 | 8 | 16 | 32 | 64, 1 | 2 | 4 | 8 | 16 | 64 | 128, 1 | 64};
#define NSEC (int)sizeof form

static void newsong(void) {
    int m = 0x51540 >> (ri(5) * 4) & 15, a = 0;   // ionian, dorian, mixolydian, aeolian x2
    for (int i = 0; i < 7; i++) sc[i] = a, a += 1 + (0x3b >> ((m + i) % 7) & 1);
    root = 33 + ri(12);
    spb = (int)(SR * 15) / (84 + ri(44));
    swing = spb * ri(4) / 14;
    for (int s = 0; s < 2; s++) { int q = progs[ri(8)]; for (int i = 0; i < 4; i++) prog[s][i] = q >> (12 - 4 * i) & 15; }
    for (int i = 0; i < 3; i++) groove[i] = rnd();
    groove[0] = (groove[0] & 0x0424) | 0x0101;      // kick: 1, 3, sometimes syncopated
    groove[1] = (groove[1] & 0x8020) | 0x1010;      // snare: 2, 4, sometimes ghosts
    for (int i = 0; i < 16; i++) motif[i] = ri(5) - 2;
    mrh = rnd() | 0x0101;
    bar = -1;
}

E("s") void s(u32 seed) {
    float f = 8.1758f / SR;
    for (int i = 0; i < 128; i++) mf[i] = f, f *= 1.0594631f;
    for (int i = 0; i < 7; i++)
        for (int j = 0; j < NP; j++) {
            float b = presets[i][j]; b *= b * b;
            inst[i][j] = j < PDE ? b / 262144 : 1 / b;
        }
    rs = seed | 1;
    for (int i = 0; i < 4; i++) vc[6 + i].in = inst[6];
    for (int i = 0; i < 6; i++) vc[i].in = inst[i];
    newsong();
}

static void tick(void) {
    int st = step & 15, on = 1 << st, fill;
    if (!st) {
        if (++bar >= NSEC * 8) newsong(), bar = 0;
        sec = bar >> 3; parts = form[sec];
        int c = prog[sec & 1][bar & 3];
        // close-position 7th chord inside a fixed one-octave window of scale degrees:
        // common tones stay put, the rest move by step (cheap voice leading)
        for (int v = 0; v < 4; v++) trig(6 + v, 6, deg((c + 2 * v + 2) % 7 + 12), sec == NSEC - 1 ? 1 - (bar & 7) / 8.f : 1);
    }
    fill = (parts & 128) && (bar & 7) == 7 && st > 7;
    float vel = st & 3 ? .6f : 1;
    if (parts & 2 && groove[0] & on && !fill) trig(0, 0, 31, 1);
    if (parts & 8 && (groove[1] & on || fill)) trig(1, 1, 52, fill ? .4f + st * .04f : groove[1] & on & 0x1010 ? 1 : .3f);
    if (parts & 4 && (st & 1 ? groove[2] & on : 1)) trig(2, 2, 100, vel * ((st & 7) == 6 ? 1.5f : .8f));
    int c = prog[sec & 1][bar & 3];
    if (parts & 16 && (groove[0] & on || (st & 3) == 2)) trig(3, 3, deg(c) + ((st & 6) == 6 ? 12 : 0) + 12 * (root < 40), vel);
    if (parts & 32 && mrh & on) {
        int ph = bar & 3, dg = c + motif[st] + (ph == 1) + (ph == 2 ? motif[(st + 5) & 15] : 0);
        if (ph == 3 && st >= 8) dg = st >= 12 ? 7 : 8 + (motif[st] > 0);
        trig(4, 4, deg(dg + 14), vel);
    }
    if (parts & 64) trig(5, 5, deg(c + 2 * ((st * 3 + (st >> 2)) & 3)) + 24, st & 1 ? .4f : .8f);
}

// ---- effects
// big buffers live above the statics, at fixed addresses (keeps static addresses small)
#define cb ((float(*)[2048])0x10000)
#define ab ((float(*)[600])0x30000)
#define db ((float*)0x40000)
static const short cl[NC] = {1557, 1617, 1491, 1422, 1277, 1356}, al[2] = {556, 441};

E("p") float p(void) {
    if (--cnt <= 0) cnt = spb + (step & 1 ? -swing : swing), tick(), step++;
    float out = 0, send = 0;
    for (Voice *o = vc; o < vc + NV; o++) {
        float *in = o->in, f = o->f * (1 + o->pe);
        o->pe -= o->pe * in[PDE];
        o->ph = frac(o->ph + f); o->ph2 = frac(o->ph2 + f * (1 + in[DET]));
        float x = sn(o->ph) * in[SIN] + (o->ph + o->ph2 - 1) * in[SAW] + ns() * in[NOI];
        o->env += (o->tgt - o->env) * in[ATT];
        o->tgt -= o->tgt * in[DEC];
        float c = in[CUT] + in[CEN] * o->env;
        o->lp += c * o->bp;
        float hp = x - o->lp - in[Q] * o->bp;
        o->bp += c * hp;
        x = (o->lp + (hp - o->lp) * in[HP]) * o->env;
        out += x * in[GAIN];
        send += x * in[SEND];
    }
    // dotted-eighth delay
    float y = db[(di - spb * 3) & 32767];
    db[di++ & 32767] = send + y * .45f;
    out += y;
    // reverb: parallel damped combs + 2 allpass
    float r = 0;
    for (int i = 0; i < NC; i++) {
        float *b = cb[i] + ci[i], z = *b;
        cf[i] = z * .7f + cf[i] * .3f;
        *b = out * .1f + cf[i] * .86f;
        if (++ci[i] >= cl[i]) ci[i] = 0;
        r += z;
    }
    for (int i = 0; i < 2; i++) {
        float *b = ab[i] + ai[i], z = *b;
        *b = r + z * .5f; r = z - r;
        if (++ai[i] >= al[i]) ai[i] = 0;
    }
    return sat(out + r * .3f);
}
