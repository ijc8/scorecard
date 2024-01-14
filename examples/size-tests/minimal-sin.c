#include <stdlib.h>
#include <math.h>

float process() {
    return sinf(rand() / (float)RAND_MAX * 2 - 1);
}
