// Load a card URL in the real player (headless, muted) and check that it loads, shows its title,
// plays (clock advances, the worklet emits non-silent audio) and survives the trace toggle.
// usage: node browser-test.mjs card.wasm [chromium|webkit] [base=http://127.0.0.1:5199/]
// Needs `playwright` resolvable (NODE_PATH) and a running `npm run dev -- --port 5199`.
import fs from "fs"
import { createRequire } from "module"
const require = createRequire(process.env.NODE_PATH ? process.env.NODE_PATH + "/" : import.meta.url)
const pw = require("playwright")
const [file, engine = "chromium", base = "http://127.0.0.1:5199/"] = process.argv.slice(2)
const url = fs.readFileSync(file.replace(/\.wasm$/, ".url"), "utf8").trim().replace(/^[^?]*/, base)
const browser = await pw[engine].launch({ args: engine === "chromium" ? ["--mute-audio", "--autoplay-policy=no-user-gesture-required"] : [] })
const page = await browser.newPage()
const logs = []
page.on("console", m => logs.push(m.text()))
page.on("pageerror", e => logs.push("PAGEERROR " + e.message))
await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode && !window.__tap) {
            const an = this.context.createAnalyser(); an.fftSize = 2048
            connect.call(this, an); window.__tap = an
        }
        return connect.call(this, dest, ...rest)
    }
    window.__rms = () => {
        if (!window.__tap) return -1
        const b = new Float32Array(2048); window.__tap.getFloatTimeDomainData(b)
        return Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length)
    }
})
await page.goto(url)
await page.waitForSelector("#start")
await page.waitForTimeout(1000)
const heading = await page.locator("h2").first().innerText()
console.log(engine, "heading:", JSON.stringify(heading))
await page.locator("#start").click()
const rms = []
for (let i = 0; i < 8; i++) { await page.waitForTimeout(500); rms.push((await page.evaluate(() => window.__rms())).toFixed(3)) }
const clock = await page.locator(".play-controls > div").first().innerText()
console.log(engine, "clock after 4s:", clock.replace(/\s+/g, ""), "| rms samples:", rms.join(" "))
// trace toggle (bullseye): reassembles the binary with logging imports
await page.locator(".play-controls > button").last().click()
await page.waitForTimeout(2500)
const rms2 = await page.evaluate(() => window.__rms())
console.log(engine, "after trace toggle: rms", rms2.toFixed(3), "| errors:", logs.filter(l => /error|PAGEERROR|TOO BIG/i.test(l)).join(" / ") || "none")
await browser.close()
