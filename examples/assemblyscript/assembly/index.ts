// Unfortunately, AssemblyScript string literals are UTF-16, so we have to export a title like this...
// This could be made nicer via a compile-time transformation.
const description: StaticArray<u8> = [97, 115, 115, 101, 109, 98, 108, 121, 115, 99, 114, 105, 112, 116, 32, 116, 101, 115, 116, 0]

// Workaround for AssemblyScript's `Math.random()`, which always checks if it needs to seed itself.
// (This behavior also generates an unwanted global and a couple of extra instructions.)
function seedShim(): f64 {
    return 0
}

function setup(seed: u32): void {
    Math.seedRandom(seed)
}

function process(): f32 {
    return f32(Math.random() * 2 - 1)
}

// TODO: is there a way to convince AssemblyScript to export memory as "m" rather than "memory"?
// (Until then, still need to run `strip.sh` on the wasm.)
export { description as d, setup as s, process as p }
