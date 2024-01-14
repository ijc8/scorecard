
// Adapted from Simon Tatham's work on coroutines in C: https://www.chiark.greenend.org.uk/~sgtatham/coroutines.html
// NOTE: Clang doesn't support pointers-to-labels extension with Wasm backend, so we stick with Duff's device.


// Static generators: state is stored in static variables, so only one generator may be active at a time.
#define gen_begin static int gen_line_number = 0; switch (gen_line_number) { case 0:;
#define gen_end(x) } gen_line_number = -1; return x

#define yield(x)                            \
    do {                                        \
        gen_line_number = __LINE__;             \
        return (x); case __LINE__:;             \
    } while (0)


// For use with re-entrant generators (see below).
#define yield_from(generator, state)                 \
    do {                                                 \
        gen_line_number = __LINE__;                      \
        typeof(generator(&state)) x = generator(&state); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)

#define yield_from_args(generator, state, ...)       \
    do {                                                 \
        gen_line_number = __LINE__;                      \
        typeof(generator(&state, __VA_ARGS__)) x = generator(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)



// "Re-entrant" generators: generator state is stored in a struct, so multiple generators of the same type can be active at once.
// Unlike Tatham's `coroutine.h`, we avoid heap allocation to avoid bringing an allocator into the binary.
// Because of this, the re-entrant generator's variables must be declared outside of the function body.
#define regen_vars(a, ...) typedef struct a##_state { int line_number; __VA_ARGS__; } a##_state;
#define regen_init(state) (state.line_number = 0)
#define regen_begin switch (self->line_number) { case 0:;
#define regen_end(x) } self->line_number = -1; return x

#define reyield(x)                             \
    do {                                        \
        self->line_number = __LINE__;             \
        return (x); case __LINE__:;             \
    } while (0)


// For use with re-entrant generators:
#define reyield_from(generator, state, ...)                            \
    do {                                                                 \
        self->line_number = __LINE__;                                    \
        typeof(generator(&state, __VA_ARGS__)) x = generator(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;                             \
        return x; case __LINE__:;                                       \
    } while (state.line_number != -1)

#define reyield_from_args(generator, state, ...)        \
    do {                                                 \
        self->line_number = __LINE__;                      \
        typeof(generator(&state, __VA_ARGS__)) x = generator(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)
