// const base = 10n

// function arrayToBigInt(array: Uint8Array) {
//     let offset = array.findIndex(x => x !== 0)
//     if (offset === -1) offset = array.length
//     let bits = 8n
//     let num = 0n
//     for (const x of array.subarray(offset)) {
//         num = (num << bits) | BigInt(x)
//     }
//     return { num, offset }
// }

// function bigIntToArray(num: bigint, offset: number) {
//     // This is all rather ridiculous.
//     // (Missing Python's `int.bit_length()`, `int.to_bytes()`...)
//     const bitLength = num === 0n ? 0 : num.toString(2).length
//     const byteLength = Math.floor((bitLength + 7) / 8)
//     const data = new Uint8Array(offset + byteLength)
//     const byteBase = BigInt(256)
//     for (let i = 0; i < byteLength; i++) {
//         data[data.length - 1 - i] = Number(num % byteBase)
//         num /= byteBase
//     }
//     return data
// }

// export function encode(data: Uint8Array) {
//     let { num, offset } = arrayToBigInt(data)
//     const out = []
//     while (num) {
//         out.unshift(num % base + "")
//         num /= base
//     }
//     return "0".repeat(offset) + out.join("")
// }

// export function decode(encoded: string) {
//     let offset = [...encoded].findIndex(c => c !== "0")
//     if (offset === -1) offset = encoded.length
//     let num = 0n
//     for (const char of encoded.slice(offset)) {
//         num *= base
//         num += BigInt(+char)
//     }
//     return bigIntToArray(num, offset)
// }


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

export function encode(data: Uint8Array, base: 10 | 43=43) {
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

export function decode(encoded: string, base: 10 | 43=43) {
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
