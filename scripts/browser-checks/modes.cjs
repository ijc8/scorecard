const { chromium } = require('playwright');
(async () => {
  const S = process.argv[2]
  const lib = require(require('path').join(__dirname, '../../src/library.json'))
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
  const page = await browser.newPage({ viewport: { width: 375, height: 720 }, deviceScaleFactor: 2 })
  page.on("pageerror", e => console.log("ERR", e.message))
  page.on("console", m => m.type() === "error" && console.log("console.error", m.text().slice(0, 300)))
  page.on("dialog", d => d.accept())
  const info = async () => `h2=${(await page.locator("h2").first().innerText()).replace(/\s+/g, " ")}| status="${await page.locator(".source > div > span").innerText()}" | mode=${await page.locator(".modes .active").innerText()} | clock=${(await page.locator(".play-controls").innerText()).replace(/\s+/g, " ").trim().split(" ")[0]}`
  const play = async () => { const b = await page.locator("#start").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up() }
  await page.goto("http://localhost:4173/"); await page.waitForTimeout(500)
  await page.click(".tabs button[title='Create']"); await page.waitForTimeout(600)
  // Bytebeat
  await page.click(".modes >> text=Beat"); await page.waitForTimeout(200)
  await page.screenshot({ path: `${S}/m-beat.png` })
  let t = Date.now(); await play(); await page.waitForTimeout(1500)
  console.log("beat:", await info())
  await play(); await page.locator(".editor textarea").fill("// oops\nt * (42 & "); await play(); await page.waitForTimeout(600)
  console.log("beat error:", await info(), "|", await page.locator(".source > .log").innerText())
  // Pattern
  await page.click(".modes >> text=Pattern"); await page.waitForTimeout(200)
  await page.screenshot({ path: `${S}/m-pattern.png` })
  await play(); await page.waitForSelector(".source > div > span:text-matches('bytes left')", { timeout: 60000 }).catch(() => console.log("pattern build timed out")); await page.waitForTimeout(1200)
  console.log("pattern:", await info(), "| log:", await page.locator(".source > .log").count() ? await page.locator(".source > .log").innerText() : "none")
  // reload: remembered as a pattern?
  const url = page.url(); await page.goto(url); await page.waitForTimeout(700); await page.click(".tabs button[title='Create']"); await page.waitForTimeout(500)
  console.log("after reload:", await info(), "| first line:", (await page.locator(".editor textarea").inputValue()).split("\n")[0])
  // Trace heat on the WebAssembly text
  await page.locator(".play-controls > button").last().click(); await page.waitForTimeout(1500)
  console.log("tracing from source:", await info(), "| tab", await page.locator(".tabs button.active").getAttribute("title"))
  await play(); await page.waitForTimeout(1500)
  const lit = await page.evaluate(() => { const c = document.querySelector(".editor canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return [n, c.width, c.height] })
  console.log("heat pixels lit:", lit)
  await page.locator("#table").screenshot({ path: `${S}/m-heat.png` })
  await browser.close()
})()
