// emcc -o noise.wasm -Oz noise.c --no-entry \
// -sSUPPORT_ERRNO=0 -sSUPPORT_LONGJMP=0 \
// -sEXPORTED_FUNCTIONS=_title,_setup,_process
#include <stdlib.h>

const char title[] = "noise example";

void setup(unsigned int seed) {
    srand(seed);
}

float process() {
    return rand() / (float)RAND_MAX * 2 - 1;
}
