// Packs a score card into a smaller one that unpacks it: an experiment in cards that generate their
// own WebAssembly (the `g` export; see the ABI notes in AGENTS.md).
//
//   node scripts/pack-card.mjs card.wasm [packed.wasm]
//
// The packed card is a small unpacker, written here in WebAssembly text, followed by the original
// card squeezed by arithmetic coding. Each bit is predicted from what came before by four models
// (the bits so far of this byte, alone and after the last one, two and three bytes), each keeping a
// running probability per context, mixed by how sure they are. The packer runs the very same model
// (the same WebAssembly, with its two halves exported) to choose the code, so the two can't disagree.
import { readFileSync, writeFileSync } from "fs"
import { compile } from "watr"

const OUT = 8192     // where the unpacked card goes (its length first, as `g` must return it)
const TABLE = 65536  // the models' table: 2^20 entries of two floats (probability - 1/2, count)
const MODELS = 4

// The address of model $j's entry for the present context.
const ENTRY = `
  (func $entry (param $j i32) (result i32)
    ;; hash(the last j bytes, j) for the high bits, the bits so far of this byte below, eight bytes an entry
    (i32.add (i32.const ${TABLE}) (i32.shl
      (i32.xor
        (i32.shr_u
          (i32.mul
            (i32.or
              (i32.and (global.get $hist) (i32.sub (i32.shl (i32.const 1) (i32.shl (local.get $j) (i32.const 3))) (i32.const 1)))
              (i32.shl (local.get $j) (i32.const 24)))
            (i32.const 0x9E3779B1))
          (i32.const 12))
        (i32.shl (global.get $c0) (i32.const 12)))
      (i32.const 3))))`

// Leaves on the stack how likely the next bit is to be 1, out of 4096 (never 0 or 4096).
// Uses locals $j, $q (f32), $w (f32), $num (f32), $den (f32).
const ONE = "(f32.convert_i32_u (i32.const 1))"  // (two bytes shorter than a float constant)
const PREDICT = `
    (local.set $num (f32.const 0))
    (local.set $den (f32.const 0))
    (local.set $j (i32.const ${MODELS}))
    (loop $models
      (local.set $q (f32.load (call $entry (local.tee $j (i32.sub (local.get $j) (i32.const 1))))))
      ;; A model counts for more the further its probability is from a half: 1 / (p(1 - p) + a little).
      (local.set $w (f32.div ${ONE} (f32.sub (f32.const 0.27) (f32.mul (local.get $q) (local.get $q)))))
      (local.set $num (f32.add (local.get $num) (f32.mul (local.get $w) (local.get $q))))
      (local.set $den (f32.add (local.get $den) (local.get $w)))
      (br_if $models (local.get $j)))
    (i32.add (i32.trunc_f32_s (f32.mul (f32.div (local.get $num) (local.get $den)) (f32.const 4094))) (i32.const 2048))`

// Takes in what the bit ($bit) turned out to be. Uses locals $j, $a, $q (f32), $w (f32).
const UPDATE = `
    (local.set $j (i32.const ${MODELS}))
    (loop $models
      (local.set $q (f32.load (local.tee $a (call $entry (local.tee $j (i32.sub (local.get $j) (i32.const 1)))))))
      (local.set $w (f32.load offset=4 (local.get $a)))
      ;; Move the probability towards the bit: nearly all the way at first, then by less and less.
      (f32.store (local.get $a) (f32.add (local.get $q)
        (f32.div
          (f32.sub (f32.sub (f32.convert_i32_u (local.get $bit)) (f32.const 0.5)) (local.get $q))
          (f32.add (local.get $w) (f32.const 1.2)))))
      (f32.store offset=4 (local.get $a) (f32.min (f32.add (local.get $w) ${ONE}) (f32.convert_i32_u (i32.const 4))))
      (br_if $models (local.get $j)))
    (global.set $c0 (i32.or (i32.shl (global.get $c0) (i32.const 1)) (local.get $bit)))
    (if (i32.ge_u (global.get $c0) (i32.const 256)) (then
      ;; A whole byte: write it out, and remember it.
      (i32.store8 (global.get $pos) (global.get $c0))
      (global.set $pos (i32.add (global.get $pos) (i32.const 1)))
      (global.set $hist (i32.or (i32.shl (global.get $hist) (i32.const 8)) (i32.and (global.get $c0) (i32.const 255))))
      (global.set $c0 (i32.const 1))))`

const GLOBALS = `
  (global $hist (mut i32) (i32.const 0))
  (global $c0 (mut i32) (i32.const 1))
  (global $pos (mut i32) (i32.const ${OUT}))`

const PAGES = (TABLE + (8 << 20)) >> 16

// The model alone, for the packer to drive.
const MODEL = `(module
  (memory (export "m") ${PAGES})
  ${GLOBALS}
  ${ENTRY}
  (func (export "predict") (result i32) (local $j i32) (local $q f32) (local $w f32) (local $num f32) (local $den f32)
    ${PREDICT})
  (func (export "update") (param $bit i32) (local $j i32) (local $a i32) (local $q f32) (local $w f32)
    ${UPDATE}))`

// The unpacker: `g` unpacks the data that follows it and says where the result is.
const unpacker = data => `(module
  (memory (export "m") ${PAGES})
  ${GLOBALS}
  ${ENTRY}
  (func (export "g") (param $seed i32) (result i32)
    (local $range i32) (local $code i32) (local $in i32) (local $bound i32) (local $bit i32)
    (local $j i32) (local $a i32) (local $q f32) (local $w f32) (local $num f32) (local $den f32)
    (local.set $range (i32.const 1))
    (loop $bits
      ;; Keep the range wide by taking in more of the code, a byte at a time (three to begin with).
      (loop $more
        (if (i32.lt_u (local.get $range) (i32.const 0x1000000)) (then
          (local.set $range (i32.shl (local.get $range) (i32.const 8)))
          (local.set $code (i32.or (i32.shl (local.get $code) (i32.const 8)) (i32.load8_u (local.get $in))))
          (local.set $in (i32.add (local.get $in) (i32.const 1)))
          (br $more))))
      ;; The code falls in the part of the range that belongs to 1, or in the rest.
      (local.set $bound (i32.mul (i32.shr_u (local.get $range) (i32.const 12)) ${PREDICT}))
      (if (local.tee $bit (i32.lt_u (local.get $code) (local.get $bound)))
        (then (local.set $range (local.get $bound)))
        (else
          (local.set $code (i32.sub (local.get $code) (local.get $bound)))
          (local.set $range (i32.sub (local.get $range) (local.get $bound)))))
      ${UPDATE}
      ;; The first four bytes to come out are the length of the rest.
      (br_if $bits (i32.lt_u (global.get $pos) (i32.add (i32.load (i32.const ${OUT})) (i32.const ${OUT + 4})))))
    (i32.const ${OUT}))
  (data (i32.const 0) "${[...data].map(byte => "\\" + byte.toString(16).padStart(2, "0")).join("")}"))`

// Arithmetic coding, the packer's side: narrow [low, low + range) to the part that belongs to each
// bit. (`low` is kept whole, as a BigInt, which does away with the usual fuss over carries.)
export function pack(card) {
    const model = new WebAssembly.Instance(new WebAssembly.Module(compile(MODEL))).exports
    const input = new Uint8Array(card.length + 4)
    new DataView(input.buffer).setUint32(0, card.length, true)
    input.set(card, 4)
    let low = 0n, range = 1 << 24, bytes = 3
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
            model.update(bit)
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
    const packed = compile(unpacker(data.subarray(0, length)))
    // Make sure it comes out as it went in.
    const { g, m } = new WebAssembly.Instance(new WebAssembly.Module(packed)).exports
    const at = g(0)
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
