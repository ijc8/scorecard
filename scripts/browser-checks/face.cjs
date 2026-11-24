const { chromium } = require('playwright');
(async () => {
  const S = process.argv[2]
  const lib = require(require('path').join(__dirname, '../../src/library.json'))
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
  const page = await browser.newPage({ viewport: { width: 375, height: 720 } })
  page.on("pageerror", e => console.log("ERR", e.message))
  page.on("console", m => m.type() === "error" && console.log("console.error", m.text().slice(0, 300)))
  page.on("dialog", d => d.accept())
  const info = async () => `tab=${await page.locator(".tabs button.active").getAttribute("title")} h2=${(await page.locator("h2").first().innerText()).replace(/\s+/g, " ")} status="${await page.locator(".source > div > span").innerText()}" clock=${(await page.locator(".play-controls").innerText()).replace(/\s+/g, " ").trim().split(" ")[0]}`
  const play = async () => { const b = await page.locator("#start").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up() }
  // 1. Fresh visit: write a new card and press play.
  await page.goto("http://localhost:4173/"); await page.waitForTimeout(500)
  await page.click(".tabs button[title='Create']"); await page.waitForTimeout(800)
  await page.screenshot({ path: `${S}/f1.png` })
  console.log("fresh:", await info())
  await play(); await page.waitForTimeout(6000)
  console.log("after play:", await info(), "| pause shown:", await page.locator("#start svg").count())
  await page.waitForTimeout(1200); console.log("later:", await info())
  // 2. Edit -> dirty; error; fix
  await play(); // pause
  const src = await page.locator(".source textarea").inputValue()
  await page.locator(".source textarea").fill(src.replace('"my card"', '"my card 2"').replace("gen_end(0);", "gen_end(0)"))
  console.log("edited:", await info())
  await play(); await page.waitForTimeout(1500); console.log("error:", await info(), "|", (await page.locator(".source > .log").innerText()).slice(0, 80).replace(/\n/g, " "))
  await page.screenshot({ path: `${S}/f2.png` })
  await page.locator(".source textarea").fill(src.replace('"my card"', '"my card 2"'))
  await play(); await page.waitForTimeout(2500); console.log("fixed:", await info())
  // 3. Flip to QR and bits
  await page.click(".tabs button[title='Listen']"); await page.waitForTimeout(250); await page.screenshot({ path: `${S}/f3-mid.png` }); await page.waitForTimeout(700); await page.screenshot({ path: `${S}/f3.png` })
  await page.click(".tabs button[title='Create']"); await page.waitForTimeout(800)
  await page.locator("button[title='Show the card at work']").first().click(); await page.waitForTimeout(1500); console.log("bullseye from source:", await info()); await page.screenshot({ path: `${S}/f4.png` })
  await page.locator("button[title='Show the card at work']").first().click(); await page.waitForTimeout(800)
  // 4. Load a starter card (known source) and an unknown one
  await page.goto("http://localhost:4173/?c=" + encodeURIComponent(lib[6].code)); await page.waitForTimeout(600)
  await page.click(".tabs button[title='Create']"); await page.waitForTimeout(600)
  console.log("starter source:", (await page.locator(".source textarea").inputValue()).split("\n")[0], "| mode:", await page.locator(".modes .active").innerText(), "|", await info())
  await page.click("text=Wasm"); await page.waitForTimeout(2500); console.log("wasm view chars:", (await page.locator(".source textarea").inputValue()).length, await info())
  // reload: my compiled card is remembered?
  await browser.close()
})()
