// Two plucked strings play the same twelve-note loop; one keeps slipping ahead by a note.
#include "../deck.h"

card_title("out of phase");

#define NOTES 12
#define REPEATS 4

const char low[] = {0, 2, 3}, high[] = {7, 9, 10, 12};
char pattern[NOTES];
float note_dur;

void setup(unsigned int seed) {
    srand(seed);
    int root = 57 + rand() % 7;
    note_dur = uniform(0.13, 0.17);
    // Alternate between a low and a high group of pitches, as if for two hands.
    for (int i = 0; i < NOTES; i++) {
        pattern[i] = root + (i % 2 ? choice(high) : choice(low));
    }
}

regen_vars(player,
    string_t string;
    float t, dur;
    int i, repeat;
)
// `shift` is how much faster to play while shifting (0 for the steady player).
float player(player_state *self, float shift) {
    regen_begin;
    for (;; self->repeat++) {
        // Stay in place for a few repeats, then spend a few gaining exactly one note.
        self->dur = note_dur * (self->repeat / REPEATS % 2 ? 1 - shift : 1);
        for (self->i = 0; self->i < NOTES; self->i++) {
            pluck(&self->string, m2f(pattern[self->i]));
            for (; self->t < self->dur; self->t += dt) {
                reyield(string(&self->string));
            }
            self->t -= self->dur;
        }
    }
    regen_end(0);
}

float process() {
    static player_state steady, mover;
    return (player(&steady, 0) + player(&mover, 1.0f / (NOTES * REPEATS))) * 0.4f;
}
