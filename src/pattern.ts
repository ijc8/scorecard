// Patterns: a little of Tidal's (and Strudel's) mini-notation, turned into a card.
//
//     // title (optional)
//     bpm 120                              (or: cps 0.5; one cycle is one bar)
//     saw: c2 [~ c2] eb2 <g2 bb2>          (a sound, then a pattern; one line per layer)
//     sqr: <[c4 eb4 g4] [bb3 d4 f4]>*2
//     drums: bd*2 [~ sd] hh*4
//
// In a pattern, things separated by spaces share the cycle equally; [ ] nests a sequence inside
// one step; < > takes one of its steps per cycle, in turn; a comma layers alternatives; ~ rests.
// After any step: *n plays it n times as fast, /n slows it, !n repeats it, @n makes it n times as long.
// Notes are names (c, eb3, f#4; octave 3 unless given) or MIDI numbers; drums are bd, sd, hh, cp.
//
// The pattern is worked out here, for as many cycles as it takes to come back round, as a list of
// events. They're added as data to a player that's built ahead of time (examples/pattern-player.c),
// so patterns don't need the C compiler.
import playerBase64 from "./patternPlayer"

class PatternError extends Error {}

// Exact fractions (of a cycle), as [numerator, denominator].
type Fraction = [number, number]
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a)
const lcm = (a: number, b: number) => a / gcd(a, b) * b
const fraction = (n: number, d: number): Fraction => {
    const g = gcd(n, d) || 1
    return [n / g, d / g]
}
const add = (a: Fraction, b: Fraction) => fraction(a[0] * b[1] + b[0] * a[1], a[1] * b[1])
const times = (a: Fraction, b: Fraction) => fraction(a[0] * b[0], a[1] * b[1])

interface Event {
    start: Fraction  // within the cycle
    length: Fraction
    value: number    // MIDI pitch, or which drum
}

// A pattern says what happens in any given cycle, and after how many cycles it repeats.
interface Pattern {
    period: number
    query: (cycle: number) => Event[]
}

const silence: Pattern = { period: 1, query: () => [] }
const atom = (value: number): Pattern => ({ period: 1, query: () => [{ start: [0, 1], length: [1, 1], value }] })

function stack(patterns: Pattern[]): Pattern {
    if (patterns.length === 1) return patterns[0]
    return { period: patterns.map(p => p.period).reduce(lcm, 1), query: cycle => patterns.flatMap(p => p.query(cycle)) }
}

// Steps one after another within the cycle, each taking a share of it in proportion to its weight.
function sequence(steps: { pattern: Pattern, weight: number }[]): Pattern {
    if (steps.length === 0) return silence
    const total = steps.reduce((sum, step) => sum + step.weight, 0)
    return {
        period: steps.map(step => step.pattern.period).reduce(lcm, 1),
        query: cycle => {
            let before = 0
            return steps.flatMap(({ pattern, weight }) => {
                const offset = fraction(before, total), share = fraction(weight, total)
                before += weight
                return pattern.query(cycle).map(e => ({ ...e, start: add(offset, times(e.start, share)), length: times(e.length, share) }))
            })
        },
    }
}

function fast(pattern: Pattern, n: number): Pattern {
    return {
        period: pattern.period / gcd(pattern.period, n),
        query: cycle => Array.from({ length: n }, (_, k) => pattern.query(cycle * n + k).map(e => (
            { ...e, start: times(add(e.start, [k, 1]), [1, n]), length: times(e.length, [1, n]) }
        ))).flat(),
    }
}

function slow(pattern: Pattern, n: number): Pattern {
    return {
        period: pattern.period * n,
        query: cycle => {
            // This cycle is one nth of one of the pattern's cycles. Whatever starts in it plays (and may ring on past it).
            const part = cycle % n
            return pattern.query(Math.floor(cycle / n))
                .filter(e => e.start[0] * n >= part * e.start[1] && e.start[0] * n < (part + 1) * e.start[1])
                .map(e => ({ ...e, start: add(times(e.start, [n, 1]), [-part, 1]), length: times(e.length, [n, 1]) }))
        },
    }
}

const DRUMS = ["bd", "sd", "hh", "cp"]
const SEMITONES: { [name: string]: number } = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

function parse(text: string, drums: boolean): Pattern {
    const tokens = text.match(/[[\]<>,]|[*/!@]\d*|[^\s[\]<>,*/!@]+/g) ?? []
    let pos = 0

    function value(word: string): Pattern {
        if (word === "~") return silence
        if (drums) {
            const drum = DRUMS.indexOf(word)
            if (drum < 0) throw new PatternError(`"${word}" isn't a drum (there's ${DRUMS.join(", ")})`)
            return atom(drum)
        }
        const note = word.toLowerCase().match(/^([a-g])(#|s|b)?(-?\d)?$/)
        if (note) return atom(SEMITONES[note[1]] + (note[2] ? (note[2] === "b" ? -1 : 1) : 0) + 12 * (Number(note[3] ?? 3) + 1))
        if (/^\d+$/.test(word) && Number(word) < 128) return atom(Number(word))
        throw new PatternError(`"${word}" isn't a note`)
    }

    // The steps up to a closing bracket (or the end), as layers separated by commas.
    function layers(close: string | undefined, turns: boolean): Pattern {
        const all: Pattern[] = []
        let steps: { pattern: Pattern, weight: number }[] = []
        const finish = () => {
            // < > plays one step per cycle: the same as a sequence slowed down by its number of steps.
            all.push(turns && steps.length ? slow(sequence(steps), steps.reduce((sum, step) => sum + step.weight, 0)) : sequence(steps))
            steps = []
        }
        for (;;) {
            const token = tokens[pos++]
            if (token === close) {
                finish()
                return stack(all)
            }
            if (token === undefined) throw new PatternError(`missing "${close}"`)
            if (token === ",") {
                finish()
                continue
            }
            let pattern
            if (token === "[") pattern = layers("]", false)
            else if (token === "<") pattern = layers(">", true)
            else if (/^[\]>*/!@]/.test(token)) throw new PatternError(`unexpected "${token}"`)
            else pattern = value(token)
            let weight = 1, repeats = 1
            while (/^[*/!@]/.test(tokens[pos] ?? "")) {
                const modifier = tokens[pos++]
                const n = modifier.length > 1 ? Number(modifier.slice(1)) : modifier[0] === "!" ? 2 : NaN
                if (!(n >= 1 && n <= 64)) throw new PatternError(`"${modifier}" needs a whole number from 1 to 64 after it`)
                if (modifier[0] === "*") pattern = fast(pattern, n)
                else if (modifier[0] === "/") pattern = slow(pattern, n)
                else if (modifier[0] === "!") repeats = n
                else weight = n
            }
            for (let i = 0; i < repeats; i++) steps.push({ pattern, weight })
        }
    }

    return layers(undefined, false)
}

const SOUNDS = ["saw", "sqr", "tri", "sine", "drums"]
const MAX_CYCLES = 64, MAX_TICKS = 65535

// Works out the pattern's events, or throws a PatternError describing what's wrong.
function patternEvents(source: string) {
    let title = "", cps = 0.5
    const layers: { sound: number, pattern: Pattern }[] = []
    for (const line of source.split("\n")) {
        const text = line.replace(/\/\/.*/, "").trim()
        const comment = line.match(/^\s*\/\/\s*(.*)/)
        const setting = text.match(/^(cps|bpm)\s+([\d.]+)$/)
        if (comment) title ||= comment[1].trim()
        if (!text) continue
        if (setting) {
            cps = setting[1] === "cps" ? Number(setting[2]) : Number(setting[2]) / 240
            if (!(cps > 0.01 && cps < 20)) throw new PatternError(`"${text}" is out of range`)
            continue
        }
        const named = text.match(/^(\w+)\s*:\s*(.*)$/)
        const sound = named ? SOUNDS.indexOf(named[1]) : 2
        if (sound < 0) throw new PatternError(`"${named![1]}" isn't a sound (there's ${SOUNDS.join(", ")})`)
        layers.push({ sound, pattern: parse(named ? named[2] : text, sound === 4) })
    }
    if (layers.length === 0) throw new PatternError("there's no pattern yet")
    const cycles = layers.map(layer => layer.pattern.period).reduce(lcm, 1)
    if (cycles > MAX_CYCLES) throw new PatternError(`this takes ${cycles} cycles to come back round, which is too many (the most is ${MAX_CYCLES})`)

    const events = layers.flatMap(({ sound, pattern }) =>
        Array.from({ length: cycles }, (_, cycle) => pattern.query(cycle).map(e => ({ ...e, sound, cycle }))).flat())
    // The grid: fine enough for every event to start and stop exactly on a tick.
    const ticks = events.flatMap(e => [e.start[1], e.length[1]]).reduce(lcm, 1)
    if (ticks * cycles > MAX_TICKS) throw new PatternError("the rhythms here are too finely divided to line up on one grid")
    const timed = events.map(e => ({
        tick: e.cycle * ticks + e.start[0] * ticks / e.start[1],
        length: Math.min(Math.max(Math.round(e.length[0] * ticks / e.length[1]), 1), 255),
        sound: e.sound, value: e.value,
    })).sort((a, b) => a.tick - b.tick)
    return { title, tickDur: 1 / cps / ticks, ticks: ticks * cycles, events: timed }
}

// The player, and where it expects to find the pattern (see examples/pattern-player.c).
const player = Uint8Array.from(atob(playerBase64), c => c.charCodeAt(0))
const PATTERN = 0x20000

const leb = (n: number) => {
    const bytes = []
    do {
        bytes.push(n & 0x7f | (n >= 0x80 ? 0x80 : 0))
        n >>>= 7
    } while (n)
    return bytes
}
const sleb = (n: number) => {
    const bytes = []
    for (;;) {
        const byte = n & 0x7f
        n >>= 7
        if ((n === 0 && !(byte & 0x40)) || (n === -1 && byte & 0x40)) return [...bytes, byte]
        bytes.push(byte | 0x80)
    }
}

// Adds the pattern to the player: a data segment, and a global pointing at its title, exported as "d".
// (This leans on the player as built: it has no globals and no title, but a data count section.)
function addPattern(data: Uint8Array, titleOffset: number | null) {
    const sections: { id: number, body: number[] }[] = []
    for (let p = 8; p < player.length;) {
        const id = player[p++]
        let size = 0, shift = 0, byte
        do {
            byte = player[p++]
            size |= (byte & 0x7f) << shift
            shift += 7
        } while (byte & 0x80)
        sections.push({ id, body: [...player.subarray(p, p + size)] })
        p += size
    }
    // Vectors here have fewer than 128 entries, so their counts are one byte.
    const append = (id: number, entry: number[]) => {
        const section = sections.find(s => s.id === id)!
        section.body[0]++
        section.body.push(...entry)
    }
    const order = [1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 12, 10, 11]
    if (titleOffset !== null) sections.splice(sections.findIndex(s => order.indexOf(s.id) > order.indexOf(6)), 0, { id: 6, body: [0] })
    if (titleOffset !== null) {
        append(6, [0x7f, 0, 0x41, ...sleb(PATTERN + titleOffset), 0x0b])
        append(7, [1, "d".charCodeAt(0), 3, 0])
    }
    append(12, [])
    append(11, [0, 0x41, ...sleb(PATTERN), 0x0b, ...leb(data.length), ...data])
    return new Uint8Array([...player.subarray(0, 8), ...sections.flatMap(({ id, body }) => [id, ...leb(body.length), ...body])])
}

export function patternToCard(source: string) {
    const { title, tickDur, ticks, events } = patternEvents(source)
    const titleBytes = new TextEncoder().encode(title)
    const n = events.length
    if (n > 0xffff) throw new PatternError("there are too many notes in this")
    const data = new Uint8Array(8 + 5 * n + (title ? titleBytes.length + 1 : 0))
    const view = new DataView(data.buffer)
    view.setFloat32(0, tickDur, true)
    view.setUint16(4, ticks, true)
    view.setUint16(6, n, true)
    events.forEach((e, i) => {
        view.setUint16(8 + 5 * i, e.tick, true)
        data.set([e.value, e.length, e.sound], 8 + 5 * i + 2)
    })
    data.set(titleBytes, 8 + 5 * n)
    return addPattern(data, title ? 8 + 5 * n : null)
}

// For callers: the card, or what's wrong with the pattern.
export function compilePattern(source: string): { binary?: Uint8Array, log: string } {
    try {
        return { binary: patternToCard(source), log: "" }
    } catch (e: any) {
        if (e instanceof PatternError) return { log: e.message }
        throw e
    }
}
