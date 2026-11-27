// The audio worklet's global scope has no TextEncoder or TextDecoder, which the assembler and the
// disassembler both want. These do UTF-8 only, which is all they're asked for.
const scope = globalThis as any

scope.TextEncoder ??= class {
    encode(text = "") {
        const out: number[] = []
        for (const char of text) {
            const c = char.codePointAt(0)!
            if (c < 0x80) out.push(c)
            else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63)
            else if (c < 0x10000) out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63)
            else out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63)
        }
        return new Uint8Array(out)
    }
}

scope.TextDecoder ??= class {
    decode(input?: ArrayBuffer | ArrayBufferView) {
        if (!input) return ""
        const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        let out = ""
        for (let i = 0; i < bytes.length;) {
            const b = bytes[i++]
            const more = b < 0x80 ? 0 : b < 0xe0 ? 1 : b < 0xf0 ? 2 : 3
            let c = more === 0 ? b : b & (0x3f >> more)
            for (let k = 0; k < more; k++) c = c << 6 | bytes[i++] & 63
            out += String.fromCodePoint(c)
        }
        return out
    }
}
