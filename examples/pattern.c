#include "deck.h"

// Types
typedef struct {
    float start;
    float end;
} span_t;

typedef struct {
    span_t span;
    int value;
} event_t;

typedef void pattern_func(void *self, span_t span);

typedef struct {
    void *state;
    pattern_func *func;
} pattern_t;

void query(pattern_t pattern, span_t span) {
    pattern.func(pattern.state, span);
}


// Create object pool for events
#define MAX_EVENTS 1024

event_t events[MAX_EVENTS];
int events_len = 0;

void sort_events() {
    // heap sort (stdlib's qsort takes up too much space)
    int start = events_len / 2;
    int end = events_len;
    while (end > 1) {
        if (start > 0) {
            start--;
        } else {
            end--;
            event_t tmp = events[0];
            events[0] = events[end];
            events[end] = tmp;
        }

        int root = start;
        int child;
        while ((child = root * 2 + 1) < end) {
            if (child + 1 < end && events[child].span.start < events[child + 1].span.start) {
                child++;
            }
            if (events[root].span.start < events[child].span.start) {
                event_t tmp = events[root];
                events[root] = events[child];
                events[child] = tmp;
                root = child;
            } else {
                break;
            }
        }
    }
}


// atom - simplest pattern (one event that occupies an entire cycle)
void atom(void *self, span_t span) {
    // TODO: respect span?
    events[events_len++] = (event_t){.span = {.start = 0, .end = 1}, .value = (size_t)self};
}

// cat (AKA slowcat) - alternate between patterns, one per cycle
typedef struct {
    pattern_t *patterns;
    int len;
} cat_t;

void cat(void *_self, span_t span) {
    cat_t *self = _self;
    int start = truncf(span.start);
    int end = truncf(span.end);
    for (int t = start; t < end; t++) {
        int index = t % self->len;
        int cycle = t / self->len;
        int start_event = events_len;
        query(
            self->patterns[index],
            (span_t){
                .start = t == start ? (span.start - start + cycle) : cycle,
                .end = t == end - 1 ? (span.end - start + cycle) : (cycle + 1)
            }
        );
        for (int i = start_event; i < events_len; i++) {
            events[i].span.start += t;
            events[i].span.end += t;
        }
    }
}

// Synth for events
regen_vars(synth,
    float t, phase, freq;
);
float synth(synth_state *self, int pitch, float dur) {
    regen_begin;
    self->freq = m2f(pitch);
    for (self->t = 0; self->t < dur; self->t += dt) {
        reyield(ad(self->t, dur / 4, dur * 3 / 4) * sqr(&self->phase, self->freq));
    }
    regen_end(0);
}


// Setup pattern.
cat_t state = {
    .patterns = (pattern_t []){
        {.func = atom, .state = (void*)60},
        {.func = atom, .state = (void*)72},
    },
    .len = 2,
};

pattern_t pattern = {
    .func = cat,
    .state = &state,
};

float cps = 4;

// void setup(unsigned int seed) {
//     query(pattern, (span_t){0, 3});
//     sort_events();
//     for (int i = 0; i < events_len; i++) {
//         debug("%d: %f %f %d\n", i, events[i].span.start, events[i].span.end, events[i].value);
//     }
// }

float process() {
    static synth_state synth_state = {0};
    static int cycle = 0, i;
    static float t, dur;
    gen_begin;
    for (;;) {
        // Query our pattern to get the events for the current cycle.
        query(pattern, (span_t){cycle, cycle + 1});
        sort_events();
        for (int i = 0; i < events_len; i++) {
            debug("%d: %f %f %d\n", i, events[i].span.start, events[i].span.end, events[i].value);
        }
        for (i = 0; i < events_len; i++) {
            // Skip events whose onset is not in this cycle.
            if (events[i].span.start < cycle || events[i].span.start >= (cycle + 1)) continue;
            // Wait until event start.
            for (; t < events[i].span.start / cps; t += dt) yield(0);
            // Synthesize event.
            // TODO: Handle multiple simultaneous events (stack).
            dur = (events[i].span.end - events[i].span.start) / cps;
            regen_init(synth_state);
            for (; t < events[i].span.end / cps; t += dt) {
                yield(synth(&synth_state, events[i].value, dur));
            }
        }
        // Reset events and advance cycle.
        events_len = 0;
        cycle++;
    }
    gen_end(0);
}
