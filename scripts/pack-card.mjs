// Packs a score card into a smaller one that unpacks it: an experiment in cards that generate their
// own WebAssembly (a setup function that returns another card; see the ABI notes in AGENTS.md).
//
//   node scripts/pack-card.mjs card.wasm [packed.wasm]
//
// The packed card is a small unpacker (408 bytes with everything around it), written here in
// WebAssembly text, followed by the original card squeezed by arithmetic coding. Each bit is
// predicted from what came before by four models (the bits so far of this byte, alone and after the
// last one, two and three bytes), each keeping a running probability per context, mixed by how
// sure they are. The packer runs the very same model (the same WebAssembly text, with its two
// halves exported) to choose the code, so the two can't disagree.
//
// Much of the unpacker's shape is there to save bytes, each of which is a byte of music:
// - Its state is in locals (which start at zero for nothing); the packer's copy keeps it in globals.
// - Probabilities are kept as numbers between -1 and 1, so that what they move towards (1 or -1)
//   and the scale at the end (2047) can be made from small integers, which are shorter than floats.
// - One loop over the models both takes in the last bit and tops up the coder's range (which never
//   needs more than two more bytes a bit, and three to begin with). So the unpacker starts by
//   taking in a bit that never was: in a context that never comes again (no bits of the byte so
//   far, not even the leading 1), where it does no harm. That pass is also what puts the leading 1 there.
// - It finishes by working out one bit more than there is, for the sake of a shorter test.
import { readFileSync, writeFileSync } from "fs"
import { compile } from "watr"

const TABLE = 65536  // the models' table: 2^20 entries of two floats (probability, count)
const PAGES = (TABLE + (8 << 20)) >> 16
const ONE = "(f32.convert_i32_u (i32.const 1))"  // (two bytes shorter than a float constant)

// The address of a model's entry for the present context. A model is known by its mask ($m): which
// of the last bytes ($hist) it looks at. The bits so far of this byte ($c0, after a leading 1) go on top.
const ENTRY = `
  (func $entry (param $m i32) (param $hist i32) (param $c0 i32) (result i32)
    (i32.add (i32.const ${TABLE}) (i32.shl (i32.shr_u (i32.mul
      (i32.add (i32.or (i32.and (local.get $hist) (local.get $m)) (i32.shl (local.get $c0) (i32.const 24))) (local.get $m))
      (i32.const 0x9E377)) (i32.const 12)) (i32.const 3))))`

// A loop over the models: their masks are 0xFFFFFF, 0xFFFF, 0xFF and 0.
const MODELS = body => `
      (local.set $m (i32.const -1))
      (loop $models
        ${body}
        (br_if $models (local.get $m)))`
const NEXT = v => `(call $entry (local.tee $m (i32.shr_u (local.get $m) (i32.const 8))) (${v}.get $hist) (${v}.get $c0))`

// Takes in what the last bit turned out to be ($nb: 1 if it was 0). `v` is how the state is kept
// ("local" or "global"), and `first` goes at the top of the loop. Uses locals $m, $a, $q (f32), $n (f32).
const UPDATE = (v, first = "") => `${MODELS(`${first}
        (local.set $q (f32.load (local.tee $a ${NEXT(v)})))
        (local.set $n (f32.load offset=4 (local.get $a)))
        ;; Move the probability towards the bit: nearly all the way at first, then by less and less.
        (f32.store (local.get $a) (f32.add (local.get $q)
          (f32.div
            (f32.sub (f32.convert_i32_s (i32.sub (i32.const 1) (i32.shl (${v}.get $nb) (i32.const 1)))) (local.get $q))
            (f32.add (local.get $n) (f32.const 1.2)))))
        (f32.store offset=4 (local.get $a) (f32.min (f32.add (local.get $n) ${ONE}) (f32.convert_i32_u (i32.const 4))))`)}
      (${v}.set $c0 (i32.add (i32.shl (${v}.get $c0) (i32.const 1)) (i32.eqz (${v}.get $nb))))
      (if (i32.shr_u (${v}.get $c0) (i32.const 8)) (then
        ;; A whole byte: write it out, and remember it. (Its leading 1 goes into the history as well,
        ;; where it changes nothing that matters: the last bytes can still be told from it.)
        ${v === "local" ? "(i32.store8 (local.tee $pos (i32.add (local.get $pos) (i32.const 1))) (local.get $c0))"
            // (There's no global.tee.)
            : "(global.set $pos (i32.add (global.get $pos) (i32.const 1))) (i32.store8 (global.get $pos) (global.get $c0))"}
        (${v}.set $hist (i32.add (i32.shl (${v}.get $hist) (i32.const 8)) (${v}.get $c0)))
        (${v}.set $c0 (i32.const 1))))`

// Leaves on the stack how likely the next bit is to be 1, out of 4096 (never 0 or 4096).
// Uses locals $m, $q (f32), $n (f32), $num (f32), $den (f32).
const PREDICT = v => `
      (local.set $num (local.tee $den (f32.const 0)))${MODELS(`
        (local.set $q (f32.load ${NEXT(v)}))
        ;; A model counts for more the surer it is: 1 / (1 - q^2 + a little).
        (local.set $n (f32.div ${ONE} (f32.sub (f32.const 1.08) (f32.mul (local.get $q) (local.get $q)))))
        (local.set $num (f32.add (local.get $num) (f32.mul (local.get $n) (local.get $q))))
        (local.set $den (f32.add (local.get $den) (local.get $n)))`)}
      (i32.add (i32.trunc_f32_s (f32.mul (f32.div (local.get $num) (local.get $den)) (f32.convert_i32_u (i32.const 2047)))) (i32.const 2048))`

const LOCALS = "(local $m i32) (local $a i32) (local $q f32) (local $n f32) (local $num f32) (local $den f32)"

// The model alone, for the packer to drive.
const MODEL = `(module
  (memory (export "m") ${PAGES})
  (global $hist (mut i32) (i32.const 0)) (global $c0 (mut i32) (i32.const 0)) (global $pos (mut i32) (i32.const 0))
  (global $nb (export "nb") (mut i32) (i32.const 0))
  ${ENTRY}
  (func (export "predict") (result i32) ${LOCALS} ${PREDICT("global")})
  (func (export "update") ${LOCALS} ${UPDATE("global")}))`

// The unpacker: its setup unpacks the data that comes with it and says where the result is: at
// `out` (its length first, as setup must give it), ending at `end`.
const unpacker = (data, out, end) => `(module
  (memory (export "m") ${PAGES})
  ${ENTRY}
  (func (export "s") (param $seed i32) (result i32)
    (local $range i32) (local $code i32) (local $in i32) (local $bound i32) (local $hist i32) (local $c0 i32) (local $pos i32) (local $nb i32)
    ${LOCALS}
    (local.set $range (i32.const 1))
    (local.set $pos (i32.const ${out - 1}))
    (loop $bits
      ${UPDATE("local", `;; Keep the range wide by taking in more of the code, a byte at a time.
        (if (i32.eqz (i32.shr_u (local.get $range) (i32.const 24))) (then
          (local.set $range (i32.shl (local.get $range) (i32.const 8)))
          (local.set $code (i32.or (i32.shl (local.get $code) (i32.const 8)) (i32.load8_u (local.tee $in (i32.add (local.get $in) (i32.const 1))))))))`)}
      ;; The code falls in the part of the range that belongs to 1, or in the rest.
      (local.set $bound (i32.mul (i32.shr_u (local.get $range) (i32.const 12)) ${PREDICT("local")}))
      (if (local.tee $nb (i32.ge_u (local.get $code) (local.get $bound)))
        (then
          (local.set $code (i32.sub (local.get $code) (local.get $bound)))
          (local.set $range (i32.sub (local.get $range) (local.get $bound))))
        (else (local.set $range (local.get $bound))))
      (br_if $bits (i32.lt_u (local.get $pos) (i32.const ${end - 1}))))
    (i32.const ${out}))
  (data (i32.const 1) "${[...data].map(byte => "\\" + byte.toString(16).padStart(2, "0")).join("")}"))`

// Arithmetic coding, the packer's side: narrow [low, low + range) to the part that belongs to each
// bit. (`low` is kept whole, as a BigInt, which does away with the usual fuss over carries.)
export function pack(card) {
    const model = new WebAssembly.Instance(new WebAssembly.Module(compile(MODEL))).exports
    // (The first four bytes to come out are the length of the rest.)
    const input = new Uint8Array(card.length + 4)
    new DataView(input.buffer).setUint32(0, card.length, true)
    input.set(card, 4)
    let low = 0n, range = 1 << 24, bytes = 3
    // (As the unpacker begins: see above.)
    model.update()
    for (const byte of input) {
        for (let i = 7; i >= 0; i--) {
            const bit = byte >> i & 1
            const bound = (range >>> 12) * model.predict()
            if (bit) range = bound
            else {
                low += BigInt(bound)
                range -= bound
            }
            while (range < 1 << 24) {
                range *= 256
                low <<= 8n
                bytes++
            }
            model.nb.value = 1 - bit
            model.update()
        }
    }
    // Any number in the range will do: take the one with the most zeros at the end (which needn't be stored).
    let code = low + BigInt(range) - 1n
    for (let zeros = 8n; zeros <= 24n; zeros += 8n) {
        const rounded = code >> zeros << zeros
        if (rounded >= low) code = rounded
    }
    const data = new Uint8Array(bytes)
    for (let i = bytes - 1; i >= 0; i--, code >>= 8n) data[i] = Number(code & 255n)
    let length = bytes
    while (length > 0 && data[length - 1] === 0) length--
    // The unpacked card goes after the packed one, and a gap of zeros (the unpacker reads a little
    // way past the end of what's stored). All of it has to come before the models' table.
    const out = length + 12, end = out + 4 + card.length
    if (end > TABLE) throw new Error("the card is too big to unpack below the models' table")
    const packed = compile(unpacker(data.subarray(0, length), out, end))
    // Make sure it comes out as it went in.
    const { s, m } = new WebAssembly.Instance(new WebAssembly.Module(packed)).exports
    const at = s(0)
    const memory = new Uint8Array(m.buffer)
    const size = new DataView(m.buffer).getUint32(at, true)
    if (size !== card.length || card.some((byte, i) => memory[at + 4 + i] !== byte)) throw new Error("the packed card doesn't unpack to the original")
    return { packed, data: length }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const [from, to] = process.argv.slice(2)
    const card = new Uint8Array(readFileSync(from))
    const start = performance.now()
    const { packed, data } = pack(card)
    console.log(`${from}: ${card.length} -> ${packed.length} bytes (unpacker ${packed.length - data}, data ${data}), ${(packed.length / card.length * 100).toFixed(1)}%, ${Math.round(performance.now() - start)} ms`)
    if (to) writeFileSync(to, packed)
}
