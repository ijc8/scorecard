// A different bytebeat for every seed: this card doesn't play, it writes the card that does.
//
// Its setup makes up an expression in t from the seed (two or three terms like t*a & t>>b, joined
// by |, ^ or +), writes a WebAssembly module that computes it, and returns where that is: a card
// may hand the player another card to play in its place (see the ABI notes in AGENTS.md). So the
// program itself, not just its numbers, differs from one performance to the next.
//
// It has no process function, so it's built by hand rather than with build.sh:
//   emcc -Oz -Wall --no-entry -sEXPORTED_FUNCTIONS=_setup -o seed-beat.wasm seed-beat.c && ./strip.sh seed-beat.wasm
#include <emscripten.h>
#include <string.h>

EMSCRIPTEN_KEEPALIVE char title[] = "seed beat";

// Everything up to the function's body: one function, () -> f32, exported as "p"; one global, the
// sample counter; one local, t.
static const unsigned char head[] = {
    0, 'a', 's', 'm', 1, 0, 0, 0,
    1, 5, 1, 0x60, 0, 1, 0x7d,          // type: () -> f32
    3, 2, 1, 0,                         // function 0 has that type
    6, 6, 1, 0x7f, 1, 0x41, 0, 0x0b,    // global 0: mutable i32, 0
    7, 5, 1, 1, 'p', 0, 0,              // export function 0 as "p"
    10, 0, 0, 1, 0, 0, 1, 1, 0x7f,      // code: (section size), one body, (body size), one i32 local
    // t = ++n * 743 >> 12 (t counts at 8 kHz, as bytebeats expect)
    0x23, 0, 0x41, 1, 0x6a, 0x24, 0, 0x23, 0, 0x41, 0xe7, 0x05, 0x6c, 0x41, 12, 0x76, 0x21, 0,
};
enum { SECTION_SIZE = 35, BODY_SIZE = 38, AND = 0x71, OR = 0x72, XOR = 0x73, ADD = 0x6a, SUB = 0x6b, MUL = 0x6c, SHR = 0x76 };

static unsigned char out[4 + 256], *w;
static unsigned rng;

static unsigned rnd(unsigned n) {
    rng ^= rng << 13;
    rng ^= rng >> 17;
    rng ^= rng << 5;
    return rng % n;
}

static void op(int byte) { *w++ = byte; }
// i32.const (for 0 to 8191)
static void number(unsigned v) {
    op(0x41);
    if (v > 63) op(v | 0x80), v >>= 7;
    op(v);
}
static void t(void) { op(0x20); op(0); }
static void shifted(void) { t(); number(4 + rnd(10)); op(SHR); }   // t >> b
static void scaled(void) { t(); number(1 + rnd(11)); op(MUL); }    // t * a

static void term(void) {
    switch (rnd(4)) {
    case 0: scaled(); shifted(); op(AND); break;
    case 1: scaled(); shifted(); op(OR); break;
    case 2: t(); shifted(); shifted(); op(OR); number((8 << rnd(4)) - 1); op(AND); op(MUL); break;
    default: scaled(); number(1 + rnd(3)); op(SHR); shifted(); op(XOR);
    }
}

EMSCRIPTEN_KEEPALIVE unsigned char *setup(unsigned seed) {
    rng = seed * 2654435761u | 1;
    unsigned char *module = out + 4;
    memcpy(module, head, sizeof(head));
    w = module + sizeof(head);
    term();
    for (int more = 1 + rnd(2); more--;) {
        term();
        op(rnd(3) == 0 ? ADD : rnd(2) ? OR : XOR);
    }
    // (e & 255) - 128, as a sample, quietly
    number(255); op(AND); number(128); op(SUB); op(0xb2);
    op(0x43); op(0x6f); op(0x12); op(0x03); op(0x3b); op(0x94);   // * 0.002f
    op(0x0b);
    // Sizes, each as a two-byte LEB128.
    unsigned body = w - (module + BODY_SIZE + 2), section = w - (module + SECTION_SIZE + 2);
    module[BODY_SIZE] = body | 0x80, module[BODY_SIZE + 1] = body >> 7;
    module[SECTION_SIZE] = section | 0x80, module[SECTION_SIZE + 1] = section >> 7;
    unsigned length = w - module;
    memcpy(out, &length, 4);
    return out;
}
