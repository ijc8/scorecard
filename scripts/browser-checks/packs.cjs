const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const S = process.argv[2]
  const lib = require(require('path').join(__dirname, '../../src/library.json'))
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 860 }, acceptDownloads: true })
  const page = await ctx.newPage()
  page.on("pageerror", e => console.log("ERR", e.message))
  page.on("dialog", d => d.accept(d.type() === "prompt" ? "Road trip" : undefined))
  const titles = () => page.locator(".pcard-head b").allInnerTexts()
  await page.goto("http://localhost:4173/?c=" + encodeURIComponent(lib[6].code)); await page.waitForTimeout(900)
  await page.screenshot({ path: `${S}/p1-sealed.png` })
  await page.click(".pack"); await page.waitForTimeout(430); await page.screenshot({ path: `${S}/p2-opening.png` })
  await page.waitForTimeout(1200); await page.screenshot({ path: `${S}/p3-opened.png` })
  console.log("after open:", (await titles()).length, "cards; packs:", await page.locator(".pack").count())
  // export
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Wrap as a pack")])
  const file = `${S}/${dl.suggestedFilename()}`; await dl.saveAs(file)
  const pack = JSON.parse(fs.readFileSync(file)); console.log("exported:", dl.suggestedFilename(), pack.format, pack.name, pack.cards.length)
  // remove two cards, then import the pack and open it: they come back
  for (let i = 0; i < 2; i++) { await page.locator(".pcard-face").nth(1).click({ position: { x: 30, y: 10 } }); await page.waitForTimeout(600); await page.click(".pcard-extras button[title='Remove from deck']", { force: true }) }
  console.log("after removing:", (await titles()).length)
  await page.setInputFiles(".deck-actions input", file); await page.waitForTimeout(500)
  console.log("imported packs:", await page.locator(".pack").allInnerTexts())
  await page.click(".pack"); await page.waitForTimeout(1500)
  console.log("after reopening:", (await titles()).length, "packs:", await page.locator(".pack").count())
  // junk file
  fs.writeFileSync(`${S}/junk.json`, '{"hello":1}'); await page.setInputFiles(".deck-actions input", `${S}/junk.json`); await page.waitForTimeout(300)
  console.log("after junk: packs", await page.locator(".pack").count())
  await page.reload(); await page.waitForTimeout(800); console.log("after reload:", (await titles()).length, "packs:", await page.locator(".pack").count())
  // flip
  await page.locator(".play-controls > button").last().click(); await page.waitForTimeout(250); await page.screenshot({ path: `${S}/p4-flipping.png` })
  await page.waitForTimeout(1200); await page.locator("#start").dispatchEvent("mousedown"); await page.waitForTimeout(1500)
  await page.screenshot({ path: `${S}/p5-flipped.png` })
  await ctx.close()
  const m = await browser.newPage({ viewport: { width: 375, height: 720 } })
  await m.goto("http://localhost:4173/?c=" + encodeURIComponent(lib[1].code)); await m.waitForTimeout(600)
  await m.screenshot({ path: `${S}/p6-narrow.png` })
  await m.click(".deck-handle"); await m.waitForTimeout(900); await m.screenshot({ path: `${S}/p7-drawer.png` })
  await browser.close()
})()
