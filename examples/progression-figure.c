#include <stdlib.h>
#include <inttypes.h>
void setup(uint32_t seed) {
    srand(seed);
}
float process() {
    return rand() / (float)
        RAND_MAX * 2 - 1;
}
