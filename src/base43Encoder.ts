function arrayToBigInt(array: Uint8Array) {
    let offset = array.findIndex(x => x !== 0)
    if (offset === -1) offset = array.length
    let bits = 8n
    let num = 0n
    for (const x of array.subarray(offset)) {
        num = (num << bits) | BigInt(x)
    }
    return { num, offset }
}

function bigIntToArray(num: bigint, offset: number) {
    // Missing Python's `int.bit_length()`, `int.to_bytes()`...
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


const base = 43n

// QR spec's alphanumeric set, minus the URL unsafe characters "%" and " ".
const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:"
const invChars = Object.fromEntries([...chars].map((c, i) => [c, i]))

export function encode(data: Uint8Array) {
    let { num, offset } = arrayToBigInt(data)
    const out = []
    while (num) {
        out.unshift(chars[Number(num % base)])
        num /= base
    }
    return chars[0].repeat(offset) + out.join("")
}

export function decode(encoded: string) {
    let offset = [...encoded].findIndex(c => c !== chars[0])
    if (offset === -1) offset = encoded.length
    let num = 0n
    for (const char of encoded.slice(offset)) {
        num *= base
        num += BigInt(invChars[char])
    }
    return bigIntToArray(num, offset)
}
