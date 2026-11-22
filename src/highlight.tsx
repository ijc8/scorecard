// A small syntax highlighter for the card's source side: enough C and WebAssembly text to make
// comments, strings, numbers and keywords stand apart, without pulling in an editor library.
// The highlighted copy is drawn behind a see-through textarea, so the two must stay character for
// character the same.

const C_KEYWORDS = "auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while uint8_t uint16_t uint32_t int8_t int16_t int32_t size_t"

const languages = {
    C: new RegExp([
        /(?<comment>\/\/.*|\/\*[\s\S]*?(?:\*\/|$))/,
        /(?<string>"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)/,
        /(?<directive>^[ \t]*#[ \t]*\w+)/,
        /(?<number>\b(?:0x[\da-f]+|\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)[fu]?\b)/,
        new RegExp(`(?<keyword>\\b(?:${C_KEYWORDS.replace(/ /g, "|")})\\b)`),
    ].map(r => r.source).join("|"), "gim"),
    Beat: new RegExp([
        /(?<comment>\/\/.*)/,
        /(?<directive>^[ \t]*@[ \t]*\d+)/,
        /(?<number>\b(?:0x[\da-f]+|\d+)\b)/,
        /(?<keyword>\bt\b)/,
    ].map(r => r.source).join("|"), "gim"),
    Pattern: new RegExp([
        /(?<comment>\/\/.*)/,
        /(?<directive>^[ \t]*\w+[ \t]*:|^[ \t]*(?:cps|bpm)\b)/,
        /(?<keyword>~|\b(?:bd|sd|hh|cp)\b)/,
        /(?<number>[*/!@]\d*)/,
    ].map(r => r.source).join("|"), "gim"),
    Wasm: new RegExp([
        /(?<comment>;;.*|\(;[\s\S]*?(?:;\)|$))/,
        /(?<string>"(?:\\.|[^"\\\n])*"?)/,
        /(?<number>(?<![\w$.])[+-]?(?:0x[\da-f.p+-]+|\d[\d.e+-]*|inf|nan)\b)/,
        /(?<directive>\$[\w.$]+)/,
        /(?<keyword>\b(?:module|func|param|result|local|global|memory|data|export|import|type|table|elem|mut|block|loop|if|else|end|br|br_if|br_table|return|call|call_indirect|drop|select|unreachable|nop|[if](?:32|64)(?:\.[\w.]+)?|(?:local|global|memory)\.\w+)\b)/,
    ].map(r => r.source).join("|"), "gim"),
}

export function highlight(text: string, language: keyof typeof languages) {
    const out = []
    let last = 0
    for (const match of text.matchAll(languages[language])) {
        const kind = Object.entries(match.groups!).find(([, value]) => value !== undefined)![0]
        out.push(text.slice(last, match.index), <span key={match.index} className={kind}>{match[0]}</span>)
        last = match.index! + match[0].length
    }
    out.push(text.slice(last))
    return out
}
