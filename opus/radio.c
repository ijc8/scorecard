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
#define NV 11
#define NC 6
typedef struct {
    u32 rs; int arp, cnt, step, spb, swing, bar, sec, parts, root, mrh, di;
    int sc[7], prog[2], groove[3];
    float cf[NC], fade, lfo;
    int motif[16];
    float mf[128];                      // midi -> cycles/sample
    float inst[9][15];
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
#define arp (G->arp)
#define di (G->di)
#define sc (G->sc)
#define prog (G->prog)
#define groove (G->groove)
#define cf (G->cf)
#define motif (G->motif)
#define fade (G->fade)
#define lfo (G->lfo)
#define mf (G->mf)
#define inst (G->inst)
#define vc (G->vc)

NI static u32 rnd(void) { rs ^= rs << 13; rs ^= rs >> 17; rs ^= rs << 5; return rs; }
NI static int ri(int n) { return rnd() % n; }
NI static float ns(void) { return (int)rnd() * (1.f / 2147483648.f); }

static float frac(float x) { return x - __builtin_floorf(x); }
NI static float sn(float p) {              // ~sin(2 pi p), p >= 0
    float x = frac(p) * 2 - 1, y = 4 * x * (1 - __builtin_fabsf(x));
    return .225f * (y * __builtin_fabsf(y) - y) + y;
}
static float sat(float x) { return x / (1 + __builtin_fabsf(x)); }

// ---- instruments: 14 bytes each
// sin saw noise detune penv cut cutenv q hp gain send vibrato | pdec att dec (times)
// value = b^3 / 2^18; times are rates = 1 / b^3 per sample
enum { SIN, SAW, NOI, DET, PEN, CUT, CEN, Q, HP, GAIN, SEND, VIB, PDE, ATT, DEC, NP };
static const unsigned char presets[][NP] = {
    {64, 0, 0, 0, 90, 50, 0, 64, 0, 77, 0, 0, 9, 2, 16},     // 0 kick
    {55, 0, 55, 0, 50, 42, 24, 64, 50, 95, 37, 0, 7, 2, 10}, // 1 snare
    {0, 0, 64, 0, 0, 44, 0, 72, 101, 28, 25, 0, 2, 2, 7},    // 2 hat
    {0, 55, 0, 64, 0, 12, 27, 59, 0, 70, 0, 0, 2, 4, 17},    // 3 bass
    {0, 51, 0, 8, 0, 30, 34, 55, 0, 50, 50, 11, 2, 5, 30},   // 4 lead
    {64, 0, 0, 64, 0, 50, 0, 64, 0, 38, 42, 0, 2, 2, 15},    // 5 arp/pluck
    {0, 46, 0, 7, 0, 30, 12, 66, 0, 40, 46, 8, 2, 26, 54},   // 6 pad (x4)
    {0, 0, 64, 0, 0, 48, 0, 72, 30, 18, 30, 0, 2, 2, 42},    // 7 crash
    {0, 0, 64, 0, 0, 10, 48, 40, 0, 16, 40, 0, 2, 48, 64},   // 8 riser
};


NI static void trig(int v, int note, float vel) {          // voice = instrument, except pads and crash/riser
    Voice *o = vc + v;
    o->in = inst[v > 9 ? 7 + (bar & 1) : v > 5 ? 6 : v];
    o->f = mf[note]; o->tgt = vel * (1 + .12f * ns()); o->pe = o->in[PEN];
}

// ---- song state

NI static int deg(int d) { d += 70; return root - 120 + 12 * (d / 7) + sc[d % 7]; }

static const unsigned short progs[] = {
    0x0534, 0x0453, 0x5304, 0x0354, 0x0315, 0x5340, 0x3405, 0x0213,
};
// form, one byte per 8-bar section. bits: 1 pad, 2 kick, 4 hats, 8 snare,
// 16 bass, 32 lead, 64 arp, 128 fill at the end of the section
static const unsigned char form[] = {1, 1 | 4 | 16, 1 | 2 | 4 | 8 | 16 | 32 | 128, 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128,
                                     1 | 64, 1 | 4 | 32 | 64 | 128, 1 | 2 | 4 | 8 | 16 | 32 | 64, 1 | 2 | 4 | 8 | 16 | 64, 1 | 64};
#define NSEC (int)sizeof form

static void newsong(void) {
    // decode presets, jittering detune, pitch env, filters and decays per song (+-20%)
    for (int i = 0; i < 9; i++)
        for (int j = 0; j < NP; j++) {
            float b = presets[i][j] * (0x50f8 >> j & 1 ? 1 + .2f * ns() : 1); b *= b * b;
            inst[i][j] = j < PDE ? b / 262144 : 1 / b;
        }
    int m = 0x51540 >> (ri(5) * 4) & 15, a = 0;   // ionian, dorian, mixolydian, aeolian x2
    for (int i = 0; i < 7; i++) sc[i] = a, a += 1 + (0x3b >> ((m + i) % 7) & 1);
    root = 33 + ri(12);
    spb = (int)(SR * 15) / (84 + ri(44));
    swing = spb * ri(4) / 14;
    prog[0] = progs[ri(8)]; prog[1] = progs[ri(8)];   // verse / chorus progressions
    groove[0] = rnd() & 0x0424 | 0x0101;             // kick: 1, 3, sometimes syncopated
    groove[1] = rnd() & 0x8020 | 0x1010;             // snare: 2, 4, sometimes ghosts
    groove[2] = rnd();                               // extra hats and bass notes
    arp = rnd() | 0x5555;                            // arpeggio rhythm (low 16 bits)
    // melody: a stepwise contour, and a 2-bar rhythm (denser on the beat)
    for (int i = 0, a = 0; i < 16; i++) { a += ri(5) - 2; if (a < -3 || a > 6) a = 2; motif[i] = a; }
    mrh = (rnd() & (rnd() | 0x11111111) | 0x10001) & 0x1fffffff; // breathe at the end of each 2 bars
    bar = -1;
}

E("s") void s(u32 seed) {
    float f = 8.1758f / SR;
    for (int i = 0; i < 128; i++) mf[i] = f, f *= 1.0594631f;
    rs = seed * 0x9e3779b1 + 1;                             // scramble nearby seeds
    for (int i = 0; i < NV; i++) vc[i].in = inst[0];         // silent until triggered
    newsong();
}

static void tick(void) {
    int st = step & 15, on = 1 << st, fill;
    if (!st && ++bar >= NSEC * 8) newsong(), bar = 0;
    sec = bar >> 3; parts = form[sec] ^ (arp >> (sec + 16) & 1) << 6;   // per-song: arp in or out per section
    int c = prog[sec & 1] >> (12 - 4 * (bar & 3)) & 15;
    if (!st) {
        // close-position 7th chord inside a fixed one-octave window of scale degrees:
        // common tones stay put, the rest move by step (cheap voice leading)
        for (int v = 0; v < 4; v++) trig(6 + v, deg((c + 2 * v + 2) % 7 + 12), 1);
        // noise riser over the last bar of a section with a fill, crash on the downbeat of drum sections
        if (((bar + 1) & 7) < 2 && parts & (bar & 7 ? 128 : 2)) trig(10, 100, 1);
    }
    fill = (parts & 128) && (bar & 7) == 7 && st > 7;
    float vel = st & 3 ? .6f : 1;
    if (parts & 2 && groove[0] & on && !fill) trig(0, 31, 1);
    if (parts & 8 && (groove[1] & on || fill)) trig(1, 55, fill ? st / 16.f : on & 0x1010 ? 1 : .3f);
    if (parts & 4 && (st & 1 ? groove[2] & on : 1)) trig(2, 100, vel * ((st & 7) == 6 ? 1.5f : .8f));
    if (parts & 16 && (groove[0] & on || (st & 3) == 2)) trig(3, deg(c) + ((st & 6) == 6 ? 12 : 0) + 12 * (root < 40), vel);
    if (parts & 32 && mrh >> (st + 16 * (bar & 1)) & 1) {
        int dg = motif[st] + 2 * (bar & 1);                   // answer phrase sits a third higher
        if (!(st & 3)) dg &= ~1;                               // chord tones on the beat
        if ((bar & 3) == 3 && st > 7) dg = (st > 9 ? 7 : 8) - c; // cadence: 2 -> 1
        trig(4, deg(c + dg + 14 + 7 * (sec == 6)), vel);         // final drop: an octave up
    }
    if (parts & 64 && arp >> st & 1) trig(5, deg(c + 2 * ((st * 3 + (st >> 2)) & 3)) + 24, vel * .7f);
}

// ---- effects
// big buffers live above the statics, at fixed addresses (keeps static addresses small)
#define cb ((float(*)[2048])0x10000)
#define ab ((float(*)[1024])0x30000)
#define db ((float*)0x40000)
static const short cl[NC] = {1557, 1617, 1491, 1422, 1277, 1356}, al[2] = {556, 441};

E("p") float p(void) {
    if (--cnt <= 0) cnt = spb + (step & 1 ? -swing : swing), tick(), step++;
    float out = 0, send = 0;
    lfo = frac(lfo + 5.5f / SR);
    for (Voice *o = vc; o < vc + NV; o++) {
        float *in = o->in, f = o->f * (1 + o->pe + in[VIB] * sn(lfo));
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
        if (o - vc > 2) x *= 1 - vc->env * .6f;               // sidechain: duck under the kick
        out += x * in[GAIN];
        send += x * in[SEND];
    }
    // dotted-eighth delay, then reverb: parallel damped combs + 2 allpasses.
    // Every delay line is a power-of-2 ring indexed by the same sample counter.
    int n = di++;
    float y = db[(n - spb * 3) & 32767];
    db[n & 32767] = send + y * .45f;
    out += y;
    float r = 0;
    for (int i = 0; i < NC; i++) {
        float *b = cb[i], z = b[(n - cl[i]) & 2047];
        cf[i] = z * .7f + cf[i] * .3f;
        b[n & 2047] = out * .1f + cf[i] * .86f;
        r += z;
    }
    for (int i = 0; i < 2; i++) {
        float *b = ab[i], z = b[(n - al[i]) & 1023];
        b[n & 1023] = r + z * .5f; r = z - r;
    }
    fade += ((float)((unsigned)(sec - NSEC + 1) >> 31) - fade) * 4e-6f;              // fade in over the intro, out over the outro
    return sat((out + r * .3f) * fade);
}
