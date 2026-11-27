// Wind gusts through a set of bells, each seed tuned to a different scale.
#include "../deck.h"

card_title("wind chimes");

#define BELLS 6
#define ECHO 9001

// Each bell is three inharmonic partials that ring out at different rates.
const float ratios[] = {1, 2.76f, 5.4f}, decays[] = {0.99997f, 0.9999f, 0.9997f};

struct {
    float freq, phase[3], amp[3];
} bells[BELLS];

float gust, gust_target, wait, wind[2];
float echo[ECHO];
int echo_pos;

void setup(unsigned int seed) {
    srand(seed);
    // Tune the bells to a random handful of notes spread over two octaves.
    int pitch = 67 + rand() % 6;
    for (int i = 0; i < BELLS; i++) {
        bells[i].freq = m2f(pitch);
        pitch += 2 + rand() % 3;
    }
}

float process() {
    // The gust level wanders; stronger gusts ring bells more often and harder.
    if (rand() % 30000 == 0) gust_target = uniform(0, 1);
    gust += (gust_target - gust) * 0.00002f;

    wait -= dt * (0.3f + gust * 8);
    if (wait < 0) {
        wait = uniform(0.2, 1.5);
        int i = rand() % BELLS;
        float strike = uniform(0.2, 0.5) + gust * 0.5f;
        for (int j = 0; j < 3; j++) bells[i].amp[j] += strike / (j + 1);
    }

    float out = 0;
    for (int i = 0; i < BELLS; i++) {
        for (int j = 0; j < 3; j++) {
            out += sine(&bells[i].phase[j], bells[i].freq * ratios[j]) * bells[i].amp[j];
            bells[i].amp[j] *= decays[j];
        }
    }
    out *= 0.08f;
    out += delay(echo, ECHO, &echo_pos, out, 0.5f) * 0.4f;

    // The wind itself: lowpassed noise that follows the gusts.
    float air = lp1(&wind[1], lp1(&wind[0], noise(), 0.03f + gust * 0.05f), 0.05f);
    return soft_clip(out + air * (0.03f + gust * 0.15f));
}
