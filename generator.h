
// NOTE: Clang doesn't support pointers-to-labels extension with Wasm backend.
#define cr_begin switch (self->line_number) { case 0:;
#define cr_end(x) } self->line_number = -1; return x

#define cr_yield(x)                             \
    do {                                        \
        self->line_number = __LINE__;             \
        return (x); case __LINE__:;             \
    } while (0)

#define cr_yield_from(coroutine, state, ...)                            \
    do {                                                                \
        self->line_number = __LINE__;                                     \
        typeof(coroutine(&state, __VA_ARGS__)) x = coroutine(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;                             \
        return x; case __LINE__:;                                       \
    } while (state.line_number != -1)

#define cr_yield_from_args(coroutine, state, ...)        \
    do {                                                 \
        self->line_number = __LINE__;                      \
        typeof(coroutine(&state, __VA_ARGS__)) x = coroutine(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)

#define cr_vars(a, ...) typedef struct a##_state { int line_number; __VA_ARGS__; } a##_state;


#define scr_begin static int scr_line_number = 0; switch (scr_line_number) { case 0:;
#define scr_end(x) } scr_line_number = -1; return x

#define scr_yield(x)                            \
    do {                                        \
        scr_line_number = __LINE__;             \
        return (x); case __LINE__:;             \
    } while (0)

#define scr_yield_from(coroutine, state)                 \
    do {                                                 \
        scr_line_number = __LINE__;                      \
        typeof(coroutine(&state)) x = coroutine(&state); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)

#define scr_yield_from_args(coroutine, state, ...)       \
    do {                                                 \
        scr_line_number = __LINE__;                      \
        typeof(coroutine(&state, __VA_ARGS__)) x = coroutine(&state, __VA_ARGS__); \
        if (state.line_number == -1) break;              \
        return x; case __LINE__:;                        \
    } while (state.line_number != -1)

#define reset(cr_state) (cr_state.line_number = 0)

#define choice(arr) (arr[rand() % SIZEOF(arr)])
