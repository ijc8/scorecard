// A drum machine built from Euclidean rhythms that rewires itself every four bars.
#include "../deck.h"

card_title("clockwork");

#define STEPS 16
enum { KICK, SNARE, HAT, BLOCK, TRACKS };

// Each track spreads `hits` onsets as evenly as possible over 16 steps, then rotates them.
struct {
    int hits, rotation;
    float t;
} tracks[TRACKS];

const char min_hits[] = {3, 2, 7, 3}, max_hits[] = {5, 4, 13, 7};

float step_dur, t, phases[2], hp;
int step = -1;

void mutate(int i) {
    tracks[i].hits = min_hits[i] + rand() % (max_hits[i] - min_hits[i] + 1);
    // Keep the kick on the downbeat; let everything else wander.
    tracks[i].rotation = i == KICK ? 0 : rand() % STEPS;
}

void setup(unsigned int seed) {
    srand(seed);
    step_dur = 60 / uniform(96, 132) / 4;
    for (int i = 0; i < TRACKS; i++) {
        mutate(i);
        tracks[i].t = 9;
    }
    t = step_dur;
}

float process() {
    if (t >= step_dur) {
        t -= step_dur;
        step++;
        if (step % (STEPS * 4) == 0 && step) mutate(rand() % TRACKS);
        for (int i = 0; i < TRACKS; i++) {
            if ((step + tracks[i].rotation) * tracks[i].hits % STEPS < tracks[i].hits) {
                tracks[i].t = 0;
            }
        }
        // Swing: stretch every other sixteenth.
        t -= step_dur * (step % 2 ? -0.12f : 0.12f);
    }
    t += dt;

    float out = 0, x, e;
    float n = noise();

    // Kick: a sine that drops in pitch.
    x = tracks[KICK].t;
    if (x < 0.3f) {
        e = env(x, 0.3f);
        out += sine(&phases[0], 45 + 180 * e * e) * e;
    }
    // Snare: noise burst.
    x = tracks[SNARE].t;
    if (x < 0.15f) out += n * env(x, 0.15f) * 0.5f;
    // Hat: a short tick of highpassed noise.
    x = tracks[HAT].t;
    float high = n - lp1(&hp, n, 0.5f);
    if (x < 0.04f) out += high * env(x, 0.04f) * 0.4f;
    // Woodblock: a pitched blip.
    x = tracks[BLOCK].t;
    if (x < 0.08f) out += tri(&phases[1], 880) * env(x, 0.08f) * 0.3f;

    for (int i = 0; i < TRACKS; i++) tracks[i].t += dt;
    return soft_clip(out * 0.8f);
}
