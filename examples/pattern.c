// Tidalish patterns
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
    int start = truncf(span.start);
    int end = truncf(span.end);
    for (int i = start; i < end; i++) {
        events[events_len++] = (event_t){.span = {.start = i, .end = i + 1}, .value = (size_t)self};
    }
}

// cat (AKA slowcat) - alternate between patterns, one per cycle
typedef struct {
    pattern_t *patterns;
    int len;
} patterns_t;

void cat(void *_self, span_t span) {
    patterns_t *self = _self;
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
            events[i].span.start += (t - cycle);
            events[i].span.end += (t - cycle);
        }
    }
}

// stack - play patterns simultaneously, in parallel
void stack(void *_self, span_t span) {
    patterns_t *self = _self;
    for (int i = 0; i < self->len; i++) {
        query(self->patterns[i], span);
    }
}

// fast - warp time within pattern
typedef struct {
    pattern_t *pattern;
    float rate;
} fast_t;

void fast(void *_self, span_t span) {
    fast_t *self = _self;
    float rate = self->rate;
    int start_event = events_len;
    query(*(self->pattern), (span_t){span.start * rate, span.end * rate});
    for (int i = start_event; i < events_len; i++) {
        events[i].span.start /= rate;
        events[i].span.end /= rate;
    }
}

// degrade - sometimes mute pattern
void degrade(void *_self, span_t span) {
    pattern_t *pattern = _self;
    int start_event = events_len;
    query(*pattern, span);
    for (int i = start_event; i < events_len; i++) {
        // TODO: use a pure function of time instead of `rand()`
        if (rand() % 2) {
            // Remove event by moving the event at the end into its slot.
            events[i] = events[--events_len];
        }
    }
}

float cps = 1;

event_t ongoing_events[MAX_EVENTS];
int ongoing_events_len = 0;
float t;

float synthesize_event(event_t event, float t) {
    float freq = m2f(event.value);
    t -= event.span.start / cps;
    float dur = (event.span.end - event.span.start) / cps;
    float phase = freq * t;
    phase = phase - truncf(phase);
    return ad(t, dur / 4, dur * 3 / 4) * (phase * 2 - 1);
}

float mix_events() {
    float out = 0;
    for (int j = 0; j < ongoing_events_len; j++) {
        while (t >= ongoing_events[j].span.end / cps) {
            // Event is finished; remove it by moving the event at the end into its slot.
            ongoing_events[j] = ongoing_events[--ongoing_events_len];
            if (j >= ongoing_events_len) {
                // No more events.
                return out;
            }
        }
        out += synthesize_event(ongoing_events[j], t);
    }
    return out / 2;
}

// Better living through macros.
#define COMBINE(fn, ...) {.func = fn, .state = &(patterns_t){ .len = SIZEOF(((pattern_t []){__VA_ARGS__})), .patterns = (pattern_t []){__VA_ARGS__}}}
#define STACK(...) COMBINE(stack, __VA_ARGS__)
#define CAT(...) COMBINE(cat, __VA_ARGS__)
#define FAST(r, p) {.func = fast, .state = &(fast_t){ .rate = (r), .pattern = &(pattern_t)p}}
#define DEGRADE(p) {.func = degrade, .state = &(pattern_t)p}
#define NOTE(p) {.func = atom, .state = (void *)(p)}
#define FASTCAT(...) FAST(SIZEOF(((pattern_t []){__VA_ARGS__})), CAT(__VA_ARGS__))

// Set up pattern.
// (Let's pretend this is Lisp!)
pattern_t pattern = STACK(
    NOTE(48),
    DEGRADE(
        FASTCAT(
            NOTE(60),
            NOTE(67),
            NOTE(63),
            NOTE(67))));

setup_rand;

float process() {
    static int cycle = 0, i;
    gen_begin;
    for (;;) {
        // Query our pattern to get the events for the current cycle.
        query(pattern, (span_t){cycle, cycle + 1});
        sort_events();
        for (int i = 0; i < events_len; i++) {
            debug("%d-%d: %f %f %d\n", cycle, i, events[i].span.start, events[i].span.end, events[i].value);
        }
        for (i = 0; i < events_len; i++) {
            // Skip events whose onset is not in this cycle.
            if (events[i].span.start < cycle || events[i].span.start >= (cycle + 1)) continue;
            // Generate more samples until event start.
            for (; t < events[i].span.start / cps; t += dt) {
                yield(mix_events());
            }
            // Insert new event at the end.
            ongoing_events[ongoing_events_len++] = events[i];
        }
        // Done processing events: generate more samples until the end of this cycle.
        for (; t < (cycle + 1) / cps; t += dt) {
            yield(mix_events());
        }
        // Reset events and advance cycle.
        events_len = 0;
        cycle++;
    }
    gen_end(0);
}
