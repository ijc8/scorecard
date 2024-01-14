int sample = 0;
float process() {
    int t = sample++ / 5;
    // Bytebeat expression:
    signed char x = t * (42 & t >> 10);
    return (float)x / 128;
}
