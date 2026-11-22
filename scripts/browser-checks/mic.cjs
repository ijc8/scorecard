const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const S = process.argv[2]
  const lib = require(require('path').join(__dirname, '../../src/library.json')); const canyon = fs.readFileSync(`${S}/canyon.b43`, 'utf8')
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] })
  const ctx = await browser.newContext({ viewport: { width: 375, height: 720 }, permissions: ["microphone"] })
  const page = await ctx.newPage()
  page.on("pageerror", e => console.log("ERR", e.message))
  const play = async () => { const b = await page.locator("#start").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up() }
  const mic = async () => ((await page.locator("body").innerText()).match(/mic[^\n]*/) || ["(no mic line)"])[0]
  const tracks = () => page.evaluate(() => navigator.mediaDevices.enumerateDevices().then(d => d.length))
  await page.goto("http://localhost:4173/?debug#" + canyon); await page.waitForTimeout(800)
  console.log("loaded:", (await page.locator("h2").first().innerText()).replace(/\s+/g, " "), "| listens icon:", await page.locator("h2 span[title^='This card listens']").count(), "|", await mic())
  await play(); await page.waitForTimeout(2000)
  console.log("playing:", await mic(), "| clock", (await page.locator(".play-controls").innerText()).replace(/\s+/g, " ").trim().split(" ")[0])
  await page.screenshot({ path: `${S}/mic.png` })
  await play(); await page.waitForTimeout(500)
  console.log("paused:", await mic())
  await play(); await page.waitForTimeout(1200); console.log("playing again:", await mic())
  // another card: mic let go
  await page.evaluate(c => { location.hash = c }, lib[3].code); await page.waitForTimeout(1200)
  console.log("other card:", (await page.locator("h2").first().innerText()).replace(/\s+/g, " "), "| listens icon:", await page.locator("h2 span[title^='This card listens']").count(), "|", await mic())
  // write an effect in the editor
  await page.click(".tabs button[title='Create']"); await page.waitForTimeout(300); await page.click(".modes >> text=C"); 
  await page.locator(".editor textarea").fill('#define INPUT\n#include "deck.h"\ncard_title("half");\nfloat process(float in) { return in * 0.5f; }\n')
  await play(); await play(); await page.waitForTimeout(5000)
  console.log("compiled effect:", (await page.locator("h2").first().innerText()).replace(/\s+/g, " "), "|", await mic(), "| status:", await page.locator(".source > div > span").innerText())
  await browser.close()
})()
