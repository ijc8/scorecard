#include <stdlib.h>
#include <math.h>

float process() {
    return powf(2, rand() / (float)RAND_MAX * 2 - 1);
}
