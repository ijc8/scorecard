const float tempo = 110;

float lpf(float *prev, float input) {
    float out = (input + *prev)/2;
    *prev = input;
    return out;
}
