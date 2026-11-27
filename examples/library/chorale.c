// Four voices sing an unending chord progression, each stepping to its nearest note.
#include "../deck.h"

card_title("slow chorale");

#define VOICES 4

const char major[] = {0, 2, 4, 5, 7, 9, 11}, minor[] = {0, 2, 3, 5, 7, 8, 10};
const char *scale;

// Where each chord (by scale degree of its root) likes to go next.
const char next[7][3] = {
    {3, 4, 5}, // I   -> IV, V, vi
    {4, 4, 6}, // ii  -> V, vii
    {5, 3, 5}, // iii -> vi, IV
    {4, 1, 0}, // IV  -> V, ii, I
    {0, 0, 5}, // V   -> I, vi
    {1, 3, 1}, // vi  -> ii, IV
    {0, 0, 2}, // vii -> I, iii
};

struct {
    int degree; // in scale steps above the root
    float freq, target, phase[2], lp;
} voices[VOICES];

int root, chord;
float t, chord_dur, swell;

float degree_to_freq(int degree) {
    return m2f(root + degree / 7 * 12 + scale[degree % 7]);
}

void change_chord() {
    // Bass takes the root of the chord.
    voices[0].degree = chord + (chord > 4 ? 0 : 7);
    // Each upper voice takes a different chord tone, in whichever octave is closest to where it is now.
    int inversion = rand() % 3;
    for (int i = 1; i < VOICES; i++) {
        int tone = chord + (i + inversion) % 3 * 2;
        int current = voices[i].degree;
        int degree = tone % 7 + (current - tone % 7 + 3) / 7 * 7;
        // ...without drifting out of range.
        if (degree < 14) degree += 7;
        if (degree > 30) degree -= 7;
        voices[i].degree = degree;
    }
    for (int i = 0; i < VOICES; i++) {
        voices[i].target = degree_to_freq(voices[i].degree);
    }
}

void setup(unsigned int seed) {
    srand(seed);
    scale = seed & 1 ? major : minor;
    root = 24 + rand() % 12;
    chord_dur = uniform(2.5, 4);
    for (int i = 1; i < VOICES; i++) voices[i].degree = 16 + i * 4;
    change_chord();
    for (int i = 0; i < VOICES; i++) voices[i].freq = voices[i].target;
}

float process() {
    t += dt;
    if (t >= chord_dur) {
        t -= chord_dur;
        chord = next[chord][rand() % 3];
        change_chord();
    }
    // Breathe: swell into each chord and relax before the next.
    float pos = t / chord_dur;
    swell += ((pos < 0.7f ? 1 : 0.5f) - swell) * 0.00005f;

    float out = 0;
    for (int i = 0; i < VOICES; i++) {
        // Glide to the new note.
        voices[i].freq += (voices[i].target - voices[i].freq) * 0.0008f;
        float x = saw(&voices[i].phase[0], voices[i].freq) + saw(&voices[i].phase[1], voices[i].freq * 1.004f);
        out += lp1(&voices[i].lp, x, 0.04f + swell * 0.08f);
    }
    return out * swell * 0.15f;
}
