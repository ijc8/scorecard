#include "../deck.h"

card_title("branch test");
setup_rand;

float foo() {
    return 1;
}

float bar() {
    return -1;
}

float process() {
    float x = 0;
    while (rand() % 2) {
        x = (x + 1)/2;
    }
    return x;
}
