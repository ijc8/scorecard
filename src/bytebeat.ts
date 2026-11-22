// Bytebeat: a whole card from one expression in `t`, written straight to WebAssembly (no C compiler
// needed, so it's instant, and comfortable to type on a phone).
//
//     // title (optional)
//     @11025 (optional: how many times a second t counts up; 8000 if not given)
//     t * (42 & t >> 10)
//
// The expression uses C's integer operators and precedence. Its low 8 bits are the output.
import { getWabt } from "./lazyWabt"

class BeatError extends Error {}

// Binary operators, loosest first. Each is [symbol, WebAssembly text for it].
const LEVELS: [string, string][][] = [
    [["||", "or"]],
    [["&&", "and"]],
    [["|", "i32.or"]],
    [["^", "i32.xor"]],
    [["&", "i32.and"]],
    [["==", "i32.eq"], ["!=", "i32.ne"]],
    [["<=", "i32.le_s"], [">=", "i32.ge_s"], ["<", "i32.lt_s"], [">", "i32.gt_s"]],
    [["<<", "i32.shl"], [">>>", "i32.shr_u"], [">>", "i32.shr_s"]],
    [["+", "i32.add"], ["-", "i32.sub"]],
    [["*", "i32.mul"], ["/", "div"], ["%", "rem"]],
]

const TOKEN = /\s*(0x[\da-f]+|\d+|[a-z_]\w*|>>>|<<|>>|<=|>=|==|!=|&&|\|\||\S)/gi

function translate(expression: string) {
    const tokens = expression.match(TOKEN)?.map(t => t.trim()) ?? []
    let pos = 0
    const used = new Set<string>()
    const peek = () => tokens[pos]
    const expect = (token: string) => {
        if (tokens[pos++] !== token) {
            throw new BeatError(`expected "${token}" ${pos > tokens.length ? "at the end" : `before "${tokens[pos - 1]}"`}`)
        }
    }

    function ternary(): string {
        const condition = binary(0)
        if (peek() !== "?") return condition
        pos++
        const yes = ternary()
        expect(":")
        return `(select ${yes} ${ternary()} ${condition})`
    }

    function binary(level: number): string {
        if (level === LEVELS.length) return unary()
        let left = binary(level + 1)
        for (;;) {
            const op = LEVELS[level].find(([symbol]) => symbol === peek())
            if (!op) return left
            pos++
            const right = binary(level + 1)
            if (op[1] === "or") {
                left = `(i32.ne (i32.or ${left} ${right}) (i32.const 0))`
            } else if (op[1] === "and") {
                left = `(i32.and (i32.ne ${left} (i32.const 0)) (i32.ne ${right} (i32.const 0)))`
            } else if (op[1] === "div" || op[1] === "rem") {
                used.add(op[1])
                left = `(call $${op[1]} ${left} ${right})`
            } else {
                left = `(${op[1]} ${left} ${right})`
            }
        }
    }

    function unary(): string {
        const token = tokens[pos++]
        if (token === undefined) throw new BeatError("the expression stops short")
        if (token === "-") return `(i32.sub (i32.const 0) ${unary()})`
        if (token === "+") return unary()
        if (token === "~") return `(i32.xor ${unary()} (i32.const -1))`
        if (token === "!") return `(i32.eqz ${unary()})`
        if (token === "(") {
            const inner = ternary()
            expect(")")
            return inner
        }
        if (token === "t") return "(local.get $t)"
        if (/^\d/.test(token)) return `(i32.const ${Number(token) | 0})`
        throw new BeatError(/^\w+$/.test(token) ? `"${token}" isn't something bytebeat knows (there's only t)` : `unexpected "${token}"`)
    }

    const code = ternary()
    if (pos < tokens.length) throw new BeatError(`unexpected "${tokens[pos]}"`)
    return { code, used }
}

// Division that gives 0 instead of trapping (which would stop the card) when dividing by zero.
const safe = (name: string, op: string) => `
  (func $${name} (param i32 i32) (result i32)
    (if (result i32) (local.get 1)
      (then (i32.wrap_i64 (i64.${op} (i64.extend_i32_s (local.get 0)) (i64.extend_i32_s (local.get 1)))))
      (else (i32.const 0))))`

export function bytebeatToWAT(source: string) {
    let title = "", rate = 8000
    const lines = []
    for (const line of source.split("\n")) {
        const comment = line.match(/^\s*\/\/\s*(.*)/)
        const setting = line.match(/^\s*@\s*(\d+)\s*$/)
        if (comment) title ||= comment[1].trim()
        else if (setting) rate = Math.min(Math.max(Number(setting[1]), 1), 44100)
        else lines.push(line.replace(/\/\/.*/, ""))
    }
    const { code, used } = translate(lines.join(" "))
    const t = rate === 44100 ? "(global.get $n)"
        : `(i32.wrap_i64 (i64.div_u (i64.mul (i64.extend_i32_u (global.get $n)) (i64.const ${rate})) (i64.const 44100)))`
    const escaped = [...new TextEncoder().encode(title)].map(byte => `\\${byte.toString(16).padStart(2, "0")}`).join("")
    return `(module${used.has("div") ? safe("div", "div_s") : ""}${used.has("rem") ? safe("rem", "rem_s") : ""}
  (global $n (mut i32) (i32.const 0))
  (func (export "p") (result f32) (local $t i32)
    (local.set $t ${t})
    (global.set $n (i32.add (global.get $n) (i32.const 1)))
    (f32.sub (f32.mul (f32.convert_i32_u (i32.and ${code} (i32.const 255))) (f32.const 0.0078125)) (f32.const 1)))${title && `
  (memory (export "m") 1)
  (global (export "d") i32 (i32.const 16))
  (data (i32.const 16) "${escaped}\\00")`})`
}

export async function compileBytebeat(source: string): Promise<{ binary?: Uint8Array, log: string }> {
    let wat
    try {
        wat = bytebeatToWAT(source)
    } catch (e: any) {
        if (e instanceof BeatError) return { log: e.message }
        throw e
    }
    const wabt = await getWabt()
    const module = wabt.parseWat("beat.wat", wat)
    try {
        return { binary: module.toBinary({}).buffer, log: "" }
    } finally {
        module.destroy()
    }
}
