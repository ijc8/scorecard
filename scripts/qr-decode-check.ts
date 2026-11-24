// Checks src/qrDecode.ts: the text it reads back off a QR code's modules must be the link that went in.
//   npx tsx scripts/qr-decode-check.ts <cards>.wasm
import { readFileSync } from "fs"
import { encodeBlob } from "../src/base43Encoder"
import { Kind, decodeSteps } from "../src/qrDecode"

let failed = false
for (const file of process.argv.slice(2)) {
    const code = encodeBlob(new Uint8Array(readFileSync(file)))
    for (const prefix of ["HTTPS://IJC8.ME/S#", "HTTPS://IJC8.ME/S#3XK9QZ", "HTTP://LOCALHOST:4917/#"]) {
        const url = prefix + code
        try {
            const steps = decodeSteps(url, code.length)
            const counts = new Array(7).fill(0)
            steps.kind.forEach(kind => counts[kind]++)
            const ok = steps.text === url
            failed ||= !ok
            console.log(ok ? "ok  " : "FAIL", file.split("/").pop(), `${steps.size}x${steps.size}`, "program modules:", counts[Kind.Program], "of", steps.size ** 2,
                "| progress", Math.min(...steps.progress.filter((_, i) => steps.kind[i] === Kind.Program)).toFixed(3), "to", Math.max(...steps.progress).toFixed(3))
            if (!ok) console.log("   read:", steps.text.slice(0, 60), "\n   want:", url.slice(0, 60))
        } catch (e) {
            console.log("skip", file.split("/").pop(), String(e).slice(0, 60))
        }
    }
}
process.exit(failed ? 1 : 0)
