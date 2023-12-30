#include <inttypes.h>

typedef struct {
    uint8_t pitch;
    uint8_t velocity;
    uint8_t duration;
} note_t;

note_t score[] = {
    // Fragment 1
    {.pitch = 60, .velocity = 1, .duration = 0},
    {.pitch = 64, .velocity = 3, .duration = 4},
    {.pitch = 60, .velocity = 1, .duration = 0},
    {.pitch = 64, .velocity = 3, .duration = 4},
    {.pitch = 60, .velocity = 1, .duration = 0},
    {.pitch = 64, .velocity = 3, .duration = 4},
    // Fragment 2
    {.pitch = 60, .velocity = 1, .duration = 0},
    {.pitch = 64, .velocity = 3, .duration = 2},
    {.pitch = 65, .velocity = 1, .duration = 2},
    {.pitch = 64, .velocity = 2, .duration = 4},
    // Fragment 3
    {.duration = 2},
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 65, .velocity = 2, .duration = 2},
    {.pitch = 64, .velocity = 1, .duration = 2},
    // Fragment 4
    {.duration = 2},
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 65, .velocity = 2, .duration = 2},
    {.pitch = 67, .velocity = 1, .duration = 2},
    // Fragment 5
    {.pitch = 64, .velocity = 3, .duration = 2},
    {.pitch = 65, .velocity = 1, .duration = 2},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.duration = 2},
    // Fragment 6
    {.pitch = 72, .velocity = 3, .duration = 16},
    {.pitch = 72, .velocity = 3, .duration = 16},
    // Fragment 7
    {.duration = 14},
    {.pitch = 60, .velocity = 3, .duration = 1},
    {.pitch = 60, .velocity = 1, .duration = 1},
    {.pitch = 60, .velocity = 1, .duration = 2},
    {.duration = 18},
    // Fragment 8
    {.pitch = 67, .velocity = 3, .duration = 24},
    {.pitch = 65, .velocity = 2, .duration = 16},
    {.pitch = 65, .velocity = 2, .duration = 16},
    // Fragment 9
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.duration = 14},
    // Fragment 10
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 11
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 12
    {.pitch = 65, .velocity = 3, .duration = 2},
    {.pitch = 67, .velocity = 1, .duration = 2},
    {.pitch = 71, .velocity = 2, .duration = 16},
    {.pitch = 72, .velocity = 3, .duration = 4},
    // Fragment 13
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 3},
    {.pitch = 67, .velocity = 2, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.duration = 3},
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 12},
    // Fragment 14
    {.pitch = 72, .velocity = 3, .duration = 16},
    {.pitch = 71, .velocity = 2, .duration = 16},
    {.pitch = 67, .velocity = 2, .duration = 16},
    {.pitch = 66, .velocity = 2, .duration = 16},
    // Fragment 15
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.duration = 15},
    // Fragment 16
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 71, .velocity = 1, .duration = 1},
    {.pitch = 72, .velocity = 2, .duration = 1},
    {.pitch = 71, .velocity = 1, .duration = 1},
    // Fragment 17
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 72, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 72, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.duration = 1},
    // Fragment 18
    {.pitch = 64, .velocity = 3, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 3},
    {.pitch = 64, .velocity = 1, .duration = 1},
    // Fragment 19
    {.duration = 6},
    {.pitch = 79, .velocity = 3, .duration = 6},
    // Fragment 20
    {.pitch = 64, .velocity = 3, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 55, .velocity = 3, .duration = 3},
    {.pitch = 64, .velocity = 1, .duration = 1},
    {.pitch = 66, .velocity = 2, .duration = 1},
    {.pitch = 64, .velocity = 1, .duration = 1},
    {.pitch = 66, .velocity = 2, .duration = 1},
    {.pitch = 64, .velocity = 1, .duration = 1},
    // Fragment 21
    {.pitch = 66, .velocity = 3, .duration = 12},
    // Fragment 22
    {.pitch = 64, .velocity = 3, .duration = 6},
    {.pitch = 64, .velocity = 2, .duration = 6},
    {.pitch = 64, .velocity = 2, .duration = 6},
    {.pitch = 64, .velocity = 2, .duration = 6},
    {.pitch = 64, .velocity = 2, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 0, .duration = 2},
    // Fragment 23
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 66, .velocity = 3, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 66, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 4},
    // Fragment 24
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 66, .velocity = 1, .duration = 2},
    {.pitch = 67, .velocity = 3, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 67, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 1, .duration = 2},
    // Fragment 25
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 66, .velocity = 1, .duration = 2},
    {.pitch = 67, .velocity = 1, .duration = 2},
    {.pitch = 69, .velocity = 3, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 69, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    // Fragment 26
    {.pitch = 64, .velocity = 1, .duration = 2},
    {.pitch = 66, .velocity = 1, .duration = 2},
    {.pitch = 67, .velocity = 1, .duration = 2},
    {.pitch = 69, .velocity = 1, .duration = 2},
    {.pitch = 71, .velocity = 3, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    {.pitch = 71, .velocity = 2, .duration = 6},
    // Fragment 27
    {.pitch = 64, .velocity = 3, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 67, .velocity = 3, .duration = 2},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 66, .velocity = 2, .duration = 1},
    {.pitch = 64, .velocity = 1, .duration = 1},
    {.pitch = 66, .velocity = 2, .duration = 1},
    {.pitch = 64, .velocity = 1, .duration = 1},
    // Fragment 28
    {.pitch = 64, .velocity = 3, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 2, .duration = 1},
    {.pitch = 66, .velocity = 1, .duration = 1},
    {.pitch = 64, .velocity = 3, .duration = 3},
    {.pitch = 64, .velocity = 1, .duration = 1},
    // Fragment 29
    {.pitch = 64, .velocity = 3, .duration = 12},
    {.pitch = 67, .velocity = 2, .duration = 12},
    {.pitch = 72, .velocity = 2, .duration = 12},
    // Fragment 30
    {.pitch = 72, .velocity = 3, .duration = 24},
    // Fragment 31
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    {.pitch = 67, .velocity = 2, .duration = 1},
    {.pitch = 71, .velocity = 1, .duration = 1},
    {.pitch = 67, .velocity = 2, .duration = 1},
    {.pitch = 71, .velocity = 1, .duration = 1},
    // Fragment 32
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 65, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    {.pitch = 65, .velocity = 2, .duration = 12},
    {.pitch = 67, .velocity = 2, .duration = 6},
    // Fragment 33
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    {.duration = 2},
    // Fragment 34
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    // Fragment 35
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.duration = 14},
    {.pitch = 70, .velocity = 3, .duration = 4},
    {.pitch = 79, .velocity = 2, .duration = 12},
    {.pitch = 81, .velocity = 3, .duration = 2},
    {.pitch = 79, .velocity = 1, .duration = 2},
    {.pitch = 79, .velocity = 2, .duration = 2},
    {.pitch = 83, .velocity = 1, .duration = 2},
    {.pitch = 81, .velocity = 2, .duration = 6},
    {.pitch = 79, .velocity = 1, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 12},
    {.pitch = 79, .velocity = 3, .duration = 2},
    {.pitch = 78, .velocity = 1, .duration = 2},
    {.pitch = 78, .velocity = 1, .duration = 12},
    {.duration = 10},
    {.pitch = 76, .velocity = 1, .duration = 2},
    {.pitch = 76, .velocity = 3, .duration = 8},
    {.pitch = 77, .velocity = 2, .duration = 24},
    // Fragment 36
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 37
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 38
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    // Fragment 39
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 65, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 71, .velocity = 2, .duration = 1},
    {.pitch = 72, .velocity = 1, .duration = 1},
    // Fragment 40
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 65, .velocity = 1, .duration = 1},
    // Fragment 41
    {.pitch = 71, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 42
    {.pitch = 72, .velocity = 3, .duration = 16},
    {.pitch = 71, .velocity = 3, .duration = 16},
    {.pitch = 69, .velocity = 3, .duration = 16},
    {.pitch = 72, .velocity = 3, .duration = 16},
    // Fragment 43
    {.pitch = 77, .velocity = 3, .duration = 1},
    {.pitch = 76, .velocity = 1, .duration = 1},
    {.pitch = 77, .velocity = 2, .duration = 1},
    {.pitch = 76, .velocity = 1, .duration = 1},
    {.pitch = 76, .velocity = 3, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 77, .velocity = 2, .duration = 1},
    {.pitch = 76, .velocity = 1, .duration = 1},
    // Fragment 44
    {.pitch = 77, .velocity = 3, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 76, .velocity = 2, .duration = 2},
    {.pitch = 72, .velocity = 3, .duration = 4},
    // Fragment 45
    {.pitch = 74, .velocity = 3, .duration = 4},
    {.pitch = 74, .velocity = 2, .duration = 4},
    {.pitch = 67, .velocity = 2, .duration = 4},
    // Fragment 46
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 74, .velocity = 1, .duration = 1},
    {.pitch = 76, .velocity = 2, .duration = 1},
    {.pitch = 74, .velocity = 1, .duration = 1},
    {.duration = 2},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.duration = 2},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.duration = 2},
    {.pitch = 67, .velocity = 2, .duration = 2},
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 74, .velocity = 1, .duration = 1},
    {.pitch = 76, .velocity = 2, .duration = 1},
    {.pitch = 74, .velocity = 1, .duration = 1},
    // Fragment 47
    {.pitch = 74, .velocity = 3, .duration = 1},
    {.pitch = 76, .velocity = 1, .duration = 1},
    {.pitch = 74, .velocity = 2, .duration = 2},
    // Fragment 48
    {.pitch = 67, .velocity = 3, .duration = 24},
    {.pitch = 67, .velocity = 3, .duration = 16},
    {.pitch = 65, .velocity = 3, .duration = 16},
    {.pitch = 65, .velocity = 2, .duration = 4},
    // Fragment 49
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 70, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 70, .velocity = 2, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 50
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    // Fragment 51
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 70, .velocity = 2, .duration = 1},
    {.pitch = 65, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
    {.pitch = 70, .velocity = 2, .duration = 1},
    // Fragment 52
    {.pitch = 67, .velocity = 3, .duration = 1},
    {.pitch = 70, .velocity = 1, .duration = 1},
    // Fragment 53
    {.pitch = 70, .velocity = 3, .duration = 1},
    {.pitch = 67, .velocity = 1, .duration = 1},
};

uint16_t fragments[53][2] = {
    {0, 6},
    {6, 10},
    {10, 14},
    {14, 18},
    {18, 22},
    {22, 24},
    {24, 29},
    {29, 32},
    {32, 35},
    {35, 37},
    {37, 43},
    {43, 47},
    {47, 55},
    {55, 59},
    {59, 61},
    {61, 65},
    {65, 71},
    {71, 77},
    {77, 79},
    {79, 89},
    {89, 90},
    {90, 99},
    {99, 108},
    {108, 117},
    {117, 126},
    {126, 135},
    {135, 146},
    {146, 152},
    {152, 155},
    {155, 156},
    {156, 162},
    {162, 170},
    {170, 173},
    {173, 175},
    {175, 202},
    {202, 208},
    {208, 210},
    {210, 216},
    {216, 222},
    {222, 224},
    {224, 226},
    {226, 230},
    {230, 239},
    {239, 244},
    {244, 247},
    {247, 261},
    {261, 264},
    {264, 268},
    {268, 274},
    {274, 276},
    {276, 282},
    {282, 284},
    {284, 286},
};
