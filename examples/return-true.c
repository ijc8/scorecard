// The MIDI arrangement of an Ableton Live set, converted by scripts/als2card.py: 88 bars at 112 BPM.
#include "deck.h"

card_title("Return True");

#define BARS 88
#define STEP_DUR 0.133929f

// Each instrument's pitches, one after another (bass an octave down, as it sounds).
const char pitches[] = {55,58,60,61,62,63,64,67,69,72,73,74,76,78,79,81,84,88,91,93,28,31,32,33,34,36,37,38,39,40,41,42,43,44,45,46,47,48,50,51,52,53,54,55,57,60,61,64,66,67,69,64,65,67,69,70,71,72,73,74,76,78,79,81,84,85,88,90,67,69,70,72,74,76,78,79,81,83,84,85,88,90};
const char pitch_offsets[] = {-1,19,50,67};
const char lengths[] = {1,2,3,4,5,6,8,9,10,12,14,15,16,18,24,28};
// Which bar each of the three groups of instruments plays, as runs (see als2card.py).
const uint8_t order[] = {1,132,1,136,0,8,1,131,9,1,5,131,10,1,0,8,1,131,11,1,5,131,10,1,0,21,12,130,13,3,14,1,0,4,15,5,0,4,16,132,0,4,20,132,20,140,20,132,20,132,32,136,20,132,20,131,40,132,0,7,44,3,45,130,46,1,0,4,47,3,48,130,49,135,0,8,56,132,0,20,60,131,0,1,63,130,62,1,65,1,0,8,66,131,0,1,69,132,0,20,73,131,0,1,76,130,75,1,78,132,0,1,82,140};
// The distinct bars, back to back. Each is a list of items ending in a zero byte: either a note
// (instrument and pitch; start and length) or a pitch with a mask of the sixteenths it's hit on.
const uint8_t bars[] = {0,6,2,7,50,8,101,9,195,0,6,2,7,50,3,104,0,2,2,3,50,1,104,0,2,2,3,50,1,101,0,6,0,7,32,8,70,9,195,0,6,0,7,32,3,67,0,2,0,3,32,1,67,0,2,0,3,32,1,68,129,0,84,0,2,2,3,50,4,101,0,2,0,3,32,1,66,129,0,91,0,2,2,3,50,5,101,0,14,192,0,142,1,16,0,14,0,0,17,160,0,10,2,11,50,13,101,14,195,0,10,2,11,50,9,104,0,8,2,9,50,7,104,0,8,2,9,55,0,38,0,50,192,0,38,0,45,192,0,37,0,45,192,0,37,0,50,192,0,38,0,50,48,175,128,130,176,0,69,0,176,21,1,175,138,4,45,192,0,37,0,48,48,39,112,40,128,41,160,42,192,43,224,0,37,0,176,104,0,51,194,0,50,1,173,72,0,178,0,9,48,160,0,178,9,35,176,4,20,45,176,0,48,1,43,48,51,128,50,176,48,224,0,48,1,43,48,179,0,9,52,192,54,224,0,38,0,178,28,0,176,128,33,175,0,92,45,240,0,170,5,0,41,16,173,72,0,44,80,178,0,129,52,192,51,224,0,48,1,50,80,48,96,175,128,32,45,129,45,224,44,240,0,43,1,43,48,45,65,47,96,45,129,184,0,92,0,178,17,17,166,68,68,0,180,17,17,169,68,68,0,174,17,17,163,68,68,0,173,17,8,162,68,0,40,144,43,160,47,192,48,208,49,224,0,37,0,173,104,0,42,193,0,43,5,46,96,47,112,50,129,51,193,0,45,5,47,96,49,112,51,129,53,193,0,47,5,50,96,51,112,53,142,0,57,16,0,57,16,56,192,0,184,16,16,0,62,16,0,62,16,55,240,0,183,130,128,0,55,16,182,128,128,0,182,130,128,0,54,16,181,128,128,0,181,130,128,0,181,130,0,63,240,0,191,130,128,0,38,2,58,2,39,50,59,50,42,101,60,101,44,195,61,195,0,38,2,58,2,39,50,59,50,36,104,57,104,0,34,2,56,2,36,50,57,50,33,104,53,104,0,34,2,56,2,36,57,57,57,0,67,76,69,76,0,66,76,68,76,0,65,78,67,78,0,67,75,69,75,0,68,74,66,75,0,71,9,0,67,76,69,76,100,5,99,96,98,112,97,141,0,66,76,68,76,97,161,98,193,99,225,0,65,78,67,78,100,5,99,96,98,112,101,142,0,67,75,69,75,100,5,99,96,98,112,97,141,0,68,74,66,75,97,161,98,193,99,225,0,65,78,67,78,100,5,99,96,98,112,104,135,0,69,9,104,225,0,74,76,76,76,0,73,76,75,76,0,72,78,74,78,0,74,75,76,75,0,75,74,73,75,0,76,9,0,74,76,76,76,105,5,104,96,103,112,102,141,0,73,76,75,76,102,161,103,193,104,225,0,72,78,74,78,105,5,104,96,103,112,106,142,0,74,75,76,75,105,5,104,96,103,112,102,141,0,75,74,73,75,102,161,103,193,104,225,0,72,79,74,79,105,5,104,96,103,112,109,135,0,76,12,109,225,0,71,2,78,2,77,12,72,50,79,50,74,101,80,101,75,195,81,195,0,71,2,78,2,74,12,72,50,79,50,68,104,77,104,0,67,2,76,2,70,12,68,50,77,50,65,104,74,104,0,67,2,76,2,71,12,68,50,77,50,65,104,74,104,0,71,2,78,2,76,12,72,50,79,50,74,101,80,101,75,195,81,195,107,2,108,50,109,101,110,195,0,71,2,78,2,75,12,72,50,79,50,68,104,77,104,107,2,108,50,105,104,0,67,2,76,2,71,12,68,50,77,50,65,104,74,104,104,2,105,50,102,104,0,67,2,76,2,72,12,68,50,77,50,65,104,77,104,104,2,105,57,0};
// Notes that repeat at a steady interval: instrument and pitch; first step (11 bits) and interval - 1 (5 bits); count.
const uint8_t streams[] = {48,67,120,8,48,69,120,8,48,70,120,10,48,67,121,8,48,69,121,8,48,70,121,9,48,67,122,7,48,69,122,7,48,70,122,7,104,178,10,6,47,0,27,112,47,5,123,28,47,14,123,28,55,36,59,15,16,64,19,149,56,69,123,6,56,75,123,6,57,98,27,16,13,102,123,9,57,103,59,8,13,108,123,9,13,112,123,8,15,134,123,9,15,140,123,9,15,144,123,9,63,161,123,6,63,162,27,24,62,165,123,8,17,166,59,18,63,167,59,12,17,168,27,34,17,170,123,9,62,171,123,7,57,196,59,32,12,240,123,10,12,246,123,10,12,252,123,9,62,2,28,16,62,7,60,7,14,22,124,6,63,27,124,11,63,37,124,10,20,48,28,33,20,54,60,16,20,58,124,8,55,66,28,9,54,102,28,9,19,108,124,10,19,112,124,9,19,118,124,9,53,138,28,8,18,140,124,8,18,144,124,7,18,150,124,7,63,170,28,6,17,180,28,19,17,182,60,10,109,242,12,6};
const uint64_t drum_loop[] = {0x40504040405,0x3000409010104090,0x555555545555};
const uint8_t drum_bars[] = {64,255,255,170,234,255,255,170,234,255,255,64,85,85,85,85,85,85,85,21,0,0};

#define VOICES 12
enum { ORGAN, BASS, HORNS, LEAD };

// How each instrument differs: how bright its filtered saw is, how fast it speaks, how loud it is.
// (The organ is a plain triangle instead.)
const float brightness[] = {1, 0.07f, 0.12f, 0.35f}, attack[] = {250, 250, 20, 50}, level[] = {0.14f, 0.3f, 0.09f, 0.09f};

typedef struct {
    float freq, phase, t, dur, lp;
    int inst;
} voice_t;

voice_t voices[VOICES];
int next_voice, step = -1;
// Each drum's level falls from 1 (when it's hit) to 0.
float tick = STEP_DUR, drums[3], kick_phase;
unsigned int rng;

void play(int item, int steps) {
    voice_t *v = &voices[next_voice++ % VOICES];
    v->inst = item >> 5 & 3;
    v->freq = m2f(pitches[pitch_offsets[v->inst] + (item & 31)]);
    v->dur = steps * STEP_DUR;
    v->t = 0;
    // (Only in native debug builds: list the notes as they're played, to check against the set.)
    debug("%d %d %d %d\n", step, v->inst, pitches[pitch_offsets[v->inst] + (item & 31)], steps);
}

float process() {
    if (tick >= STEP_DUR) {
        tick -= STEP_DUR;
        step = (step + 1) % (BARS * 16);
        int bar = step / 16, pos = step % 16;
        for (int group = 0; group < 3; group++) {
            // Find this group's bar by skipping over the ones before it.
            // (Items that are hit masks take three bytes; plain notes take two.)
            const uint8_t *item = bars, *run = order;
            int skip = group * BARS + bar;
            for (; skip >= (run[1] & 127); run += 2) skip -= run[1] & 127;
            skip = *run + (run[1] >> 7 ? skip : 0);
            for (; skip; item += *item ? 2 + (*item >> 7) : 1) {
                if (!*item) skip--;
            }
            // Start whatever begins on this sixteenth.
            for (; *item; item += 2 + (*item >> 7)) {
                if (*item & 0x80) {
                    if ((item[1] | item[2] << 8) >> pos & 1) play(*item, 1);
                } else if (item[1] >> 4 == pos) {
                    play(*item, lengths[item[1] & 15]);
                }
            }
        }
        for (const uint8_t *s = streams; s < streams + sizeof(streams); s += 4) {
            int since = step - (s[1] | (s[2] & 7) << 8), every = (s[2] >> 3) + 1;
            if (since >= 0 && since % every == 0 && since / every < s[3]) play(*s, 1);
        }
        int on = drum_bars[bar / 4] >> bar % 4 * 2;
        for (int i = 0; i < 3; i++) {
            if (on & 1 && drum_loop[i] >> step % 64 & 1) drums[i] = 1;
        }
        // The shaker: every eighth, leaning on the beats.
        if (on & 2 && pos % 2 == 0 && drums[2] < 0.5f) drums[2] = pos % 4 ? 0.4f : 0.7f;
    }
    tick += dt;

    float out = 0;
    for (int i = 0; i < VOICES; i++) {
        voice_t *v = &voices[i];
        float x = saw(&v->phase, v->freq);
        x = v->inst ? lp1(&v->lp, x, brightness[v->inst]) : fabsf(x) * 2 - 1;
        // Fade in, hold for the note's length, then fade out quickly.
        float e = v->t * attack[v->inst], over = (v->dur - v->t) * 25;
        if (e > 1) e = 1;
        if (over < 1) e *= over;
        if (over > 0) out += x * e * level[v->inst];
        v->t += dt;
    }

    // Drums: a falling triangle for the kick, and noise bursts (a short one for the hat).
    // (A tiny random number generator of our own is smaller than the C library's.)
    rng = rng * 1664525 + 1013904223;
    float n = (int)rng * 4.656613e-10f, e = drums[0] * drums[0];
    out += (fabsf(saw(&kick_phase, 45 + 160 * e * e)) * 2 - 1) * e * 0.35f;
    out += n * (drums[1] * drums[1] * 0.12f + drums[2] * drums[2] * 0.06f);
    for (int i = 0; i < 3; i++) {
        // (They die away at different rates: kick, snare, hat.)
        drums[i] -= dt * (5 + i * i * 5);
        if (drums[i] < 0) drums[i] = 0;
    }
    return out;
}

