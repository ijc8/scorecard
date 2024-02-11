#undef __STRICT_ANSI__
#include <math.h>

double phase = 0;
float process() {
    phase += 2.0 * M_PI * 200.0 / 44100.0;
    return sinf(phase);
}
