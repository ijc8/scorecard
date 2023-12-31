const bases = {
    10: "0123456789",
    // QR spec's alphanumeric set, minus the URL unsafe characters "%" and " ".
    43: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:",
}

function arrayToBigInt(array: Uint8Array) {
    let bits = 8n
    let ret = 0n
    for (const x of array) {
        ret = (ret << bits) | BigInt(x)
    }
    return ret
  }

export function baseEncode(data: Uint8Array, base: 10 | 43) {
    const chars = bases[base]
    const bigBase = BigInt(base)
    let offset = data.findIndex(x => x !== 0)
    if (offset === -1) offset = data.length
    let num = arrayToBigInt(data.subarray(offset))
    const out = []
    while (num) {
        out.unshift(chars[Number(num % bigBase)])
        num /= bigBase
    }
    return chars[0].repeat(offset) + out.join("")
}

export function baseDecode(encoded: string, base: 10 | 43) {
    const chars = bases[base]
    const bigBase = BigInt(base)
    let offset = [...encoded].findIndex(c => c !== chars[0])
    if (offset === -1) offset = encoded.length
    let num = 0n
    for (const char of encoded.slice(offset)) {
        num *= bigBase
        num += BigInt(chars.indexOf(char)) // TODO optimize
    }
    // This is all rather ridiculous.
    // (Missing Python's `int.bit_length()`, `int.to_bytes()`...)
    const bitLength = num === 0n ? 0 : num.toString(2).length
    const byteLength = Math.floor((bitLength + 7) / 8)
    const data = new Uint8Array(offset + byteLength)
    const byteBase = BigInt(256)
    for (let i = 0; i < byteLength; i++) {
        data[data.length - 1 - i] = Number(num % byteBase)
        num /= byteBase
    }
    return data
}
