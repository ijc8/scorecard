// The player's base43 (src/base43Encoder.ts), for scripts.
const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:"
export function encodeBlob(data) {
  let zeros = 0
  while (zeros < data.length && data[zeros] === 0) zeros++
  let num = 0n
  for (const byte of data.subarray(zeros)) num = (num << 8n) | BigInt(byte)
  let out = ""
  while (num) { out = chars[Number(num % 43n)] + out; num /= 43n }
  return chars[0].repeat(zeros) + out
}
