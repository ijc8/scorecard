// A transcription of a recording, made by scripts/song2card.py: 89 bars at 112.0 BPM.
#include "deck.h"

card_title("Return True");

#define BARS 89
#define STEP_DUR 0.133929f

const char lead_pitches[] = {0,55,56,57,58,60,61,63,64,65,66,67,69,70,72,73,74,76,78,79,81,83,84,88,91};
const uint8_t lead_order[] = {0,1,2,3,0,1,4,3,5,6,7,8,9,9,9,9,9,9,9,9,10,11,2,12,13,14,15,16,9,9,9,17,9,9,9,9,18,19,20,21,18,22,23,24,9,9,25,26,9,9,9,9,27,9,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,9};
const uint8_t lead_notes[] = {71,72,171,108,71,72,229,37,68,69,225,33,68,69,161,96,164,225,33,96,235,108,39,8,133,224,96,97,224,32,5,4,193,128,224,224,71,8,235,107,11,39,72,229,37,68,69,198,64,32,8,45,235,75,107,69,233,9,105,97,232,104,65,136,11,33,0,224,193,0,174,235,43,235,107,44,45,68,5,46,97,176,240,240,235,107,108,174,43,243,243,83,65,51,224,232,232,104,96,224,64,33,64,0,227,35,33,20,35,227,67,65,35,227,67,33,32,3,227,67,33,84,20,44,20,34,140,33,32,20,22,227,35,11,86,12,76,99,20,22,44,1,2,20,22,12,76,20,195,33,54,12,76,131,22,44,11,22,32,3,195,20,22,44,11,118,22,43,20,65,81,33,86,11,107,114,22,43,12,86,11,75,97,79,20,35,20,22,1,225,52,1,35,64,0,193,20,49,35,81,113,176,20,3,18,80,112,207,35,79,143,20,24,111,35,84,244,241,241,81,35,18,19,20,180,47,53,67,85,245,53,67,85,116,241,113,241,49,178,180,111,183,23,239,207,78,79,183,114,78,79,244,52,75,76,232,40,75,84,232,40,69,70,168,106,69,70,227,35,65,67,49,232,1,43,227,131};

const char bass_pitches[] = {0,28,29,30,31,32,33,34,35,36,37,38,39,40,41,43,44,45,46,48,49};
const uint8_t bass_order[] = {0,1,2,3,4,5,6,7,8,9,6,10,11,12,13,14,15,16,17,18,19,20,21,22,23,9,6,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,51,51,52,53,54,55,56,51,57,58,53,53,59,60,60,61,62,63,51,64,65,47,47,47,47,47,47,47,47,66,67,68,69,47};
const uint8_t bass_notes[] = {80,224,128,224,147,64,64,83,239,47,82,83,143,64,5,9,41,167,64,137,41,167,211,7,231,64,100,7,231,169,36,231,64,137,41,167,96,68,7,199,111,137,137,231,71,231,7,38,100,7,167,75,129,34,231,64,107,9,41,164,9,39,137,9,40,201,71,41,7,39,66,64,43,73,71,39,66,64,107,12,66,2,199,64,137,41,167,115,68,7,231,79,100,7,231,116,104,40,167,64,137,231,96,105,137,103,166,4,65,131,64,44,43,9,199,6,100,38,4,3,98,164,143,9,233,233,236,140,33,5,229,197,4,228,66,4,39,40,72,135,64,137,41,135,147,68,7,199,111,100,7,231,96,41,36,65,135,243,83,103,115,100,7,231,64,68,32,32,164,111,97,162,38,73,107,4,164,6,8,75,97,6,166,9,11,237,237,173,37,5,65,230,102,230,6,192,224,224,224,128,70,6,161,229,5,5,160,70,36,102,230,230,230,70,36,70,6,160,230,6,6,241,49,47,69,5,65,81,229,5,37,145,102,47,70,6,241,49,47,70,6,97,47,70,47,102,6,224,32,49,70,6,163,230,6,6,161,230,6,6,174,230,6,6,162,230,6,230,38,49,102,6,241,113,38,0,73,74,161,99,73,74,230,38,68,70,193,77,79,230,134};

const uint16_t drum_patterns[] = {0x5621,0x2737,0x3737,0x5595,0x5fd5,0x57d5};
// Which drum pattern each bar uses (two bits per bar; 0 for none).
const uint8_t drum_use[] = {64,85,85,85,85,85,85,85,85,85,85,0,106,170,170,170,170,170,170,42,0,0,0};


typedef struct {
    const char *pitches;
    const uint8_t *order, *notes, *next;
    int left, pitch;
    float freq, t, phase[2], lp;
} track_t;

track_t tracks[2] = {
    {lead_pitches, lead_order, lead_notes},
    {bass_pitches, bass_order, bass_notes},
};

float clock = STEP_DUR, drum_t[3], kick_phase, hat_lp;
int step = -1;

// Move a track on by one step, starting its next note when the current one runs out.
void advance(track_t *track, int bar, int start_of_bar) {
    if (start_of_bar) {
        // Find this bar's notes: bars are stored back to back, each adding up to 16 steps.
        track->next = track->notes;
        for (int skip = track->order[bar] * 16; skip > 0; track->next++) {
            skip -= (*track->next >> 5) + 1;
        }
        track->left = 0;
    }
    if (track->left-- > 0) return;
    int note = *track->next++;
    int pitch = track->pitches[note & 31];
    track->left = note >> 5;
    // A note that just carries on (over a bar line, or past the longest length) isn't struck again.
    if (pitch != track->pitch) {
        track->pitch = pitch;
        track->t = 0;
        if (pitch) track->freq = m2f(pitch);
    }
}

float process() {
    if (clock >= STEP_DUR) {
        clock -= STEP_DUR;
        step = (step + 1) % (BARS * 16);
        int bar = step / 16, pos = step % 16;
        for (int i = 0; i < 2; i++) advance(&tracks[i], bar, !pos);
        int use = drum_use[bar / 4] >> bar % 4 * 2 & 3;
        for (int i = 0; i < 3; i++) {
            if (use && drum_patterns[(use - 1) * 3 + i] >> pos & 1) drum_t[i] = 0;
        }
    }
    clock += dt;

    // Lead: a hollow, slightly detuned pair of squares, fading as the note is held.
    track_t *lead = &tracks[0], *bass = &tracks[1];
    float out = 0;
    if (lead->pitch) {
        float x = sqr(&lead->phase[0], lead->freq) + tri(&lead->phase[1], lead->freq * 1.005f);
        out += lp1(&lead->lp, x, 0.25f) * (0.08f + 0.07f / (1 + lead->t * 6));
    }
    // Bass: a saw with the top taken off.
    if (bass->pitch) {
        out += lp1(&bass->lp, saw(&bass->phase[0], bass->freq), 0.06f) * (0.16f + 0.16f / (1 + bass->t * 8));
    }
    lead->t += dt;
    bass->t += dt;

    // Drums: a falling sine for the kick, and noise bursts (the hat's with the low end removed).
    float n = noise(), e;
    if (drum_t[0] < 0.2f) {
        e = env(drum_t[0], 0.2f);
        out += sine(&kick_phase, 45 + 160 * e * e) * e * 0.35f;
    }
    if (drum_t[1] < 0.12f) out += n * env(drum_t[1], 0.12f) * 0.14f;
    float high = n - lp1(&hat_lp, n, 0.5f);
    if (drum_t[2] < 0.04f) out += high * env(drum_t[2], 0.04f) * 0.1f;
    for (int i = 0; i < 3; i++) drum_t[i] += dt;
    return soft_clip(out);
}

