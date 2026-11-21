// A squelchy sixteen-step bassline that mutates as its filter opens and closes.
#include "../deck.h"

card_title("acid drip");

#define STEPS 16
enum { REST = 1, ACCENT = 2, SLIDE = 4 };

const char scale[] = {0, 3, 5, 7, 10, 12, 15};
struct { char pitch, flags; } pattern[STEPS];

float step_dur, t, freq, target, phase, cutoff_env, amp, kick_t = 9, kick_phase;
int step = -1, root;
svf_t filter;

void randomize(int i) {
    pattern[i].pitch = choice(scale);
    int r = rand();
    pattern[i].flags = (r % 5 == 0 ? REST : 0) | (r % 3 == 0 ? ACCENT : 0) | (r % 4 == 0 ? SLIDE : 0);
}

void setup(unsigned int seed) {
    srand(seed);
    root = 33 + rand() % 7;
    step_dur = 60 / uniform(118, 138) / 4;
    for (int i = 0; i < STEPS; i++) randomize(i);
    pattern[0].flags = ACCENT;
    t = step_dur;
}

float process() {
    if (t >= step_dur) {
        t -= step_dur;
        step++;
        int i = step % STEPS;
        // Every four bars, rewrite a couple of steps.
        if (step % (STEPS * 4) == 0 && step) {
            randomize(rand() % STEPS);
            randomize(rand() % STEPS);
        }
        if (step % 4 == 0) kick_t = 0;
        if (!(pattern[i].flags & REST)) {
            target = m2f(root + pattern[i].pitch);
            // Slides glide into the note without retriggering the envelope.
            if (!(pattern[i].flags & SLIDE) || !amp) {
                freq = target;
                cutoff_env = pattern[i].flags & ACCENT ? 1 : 0.5f;
            }
            amp = pattern[i].flags & ACCENT ? 1 : 0.6f;
        } else {
            amp = 0;
        }
    }
    t += dt;

    freq += (target - freq) * 0.002f;
    cutoff_env *= 0.9998f;
    // The filter sweeps open and shut over 32 bars.
    float sweep = (step % (STEPS * 32) + t / step_dur) / (STEPS * 32);
    sweep = sweep < 0.5f ? sweep * 2 : 2 - sweep * 2;
    float cutoff = 0.02f + 0.1f * sweep + cutoff_env * (0.1f + 0.4f * sweep);
    float gate = t < step_dur * 0.6f || (pattern[(step + 1) % STEPS].flags & SLIDE) ? 1 : 0;
    static float smooth;
    lp1(&smooth, gate * amp, 0.01f);
    float bass = svf(&filter, saw(&phase, freq) * smooth, cutoff, 0.15f);

    float kick = 0;
    if (kick_t < 0.25f) {
        float e = env(kick_t, 0.25f);
        kick = sine(&kick_phase, 45 + 150 * e * e) * e;
    }
    kick_t += dt;
    return soft_clip(bass * 0.5f) * 0.5f + kick * 0.45f;
}
