# Load a card in the real player (vite preview build) in headless Chromium/WebKit, press Play,
# and measure the audio actually reaching the destination via an injected AnalyserNode.
# usage: uv run --with playwright python playercheck.py <url-file> [chromium|webkit] [seconds]
import sys, asyncio, json
from playwright.async_api import async_playwright
url = open(sys.argv[1]).read().strip().replace("https://ijc8.me/s", "http://127.0.0.1:4789/")
engine = sys.argv[2] if len(sys.argv) > 2 else "chromium"
secs = float(sys.argv[3]) if len(sys.argv) > 3 else 6
HOOK = """
(() => {
  const orig = AudioNode.prototype.connect;
  window.__levels = [];
  AudioNode.prototype.connect = function (dst, ...rest) {
    if (dst instanceof AudioDestinationNode && !this.__tapped) {
      this.__tapped = true;
      const an = this.context.createAnalyser(); an.fftSize = 2048;
      orig.call(this, an);
      const buf = new Float32Array(2048);
      setInterval(() => { an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x;
        window.__levels.push(Math.sqrt(s / buf.length)); }, 250);
    }
    return orig.call(this, dst, ...rest);
  };
})();
"""
async def main():
    async with async_playwright() as p:
        b = await getattr(p, engine).launch(executable_path="/usr/bin/google-chrome" if engine == "chromium" else None, headless=True, args=["--mute-audio", "--autoplay-policy=no-user-gesture-required"] if engine == "chromium" else [])
        pg = await b.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.add_init_script(HOOK)
        await pg.goto(url)
        await pg.wait_for_timeout(1500)
        title = await pg.evaluate("document.body.innerText.split('\\n').slice(0, 12).join(' | ')")
        title += " seed=" + str(await pg.evaluate("[...document.querySelectorAll(\"input\")].map(i => i.value).join(\",\")"))
        await pg.click("#start")
        await pg.wait_for_timeout(secs * 1000)
        lv = await pg.evaluate("window.__levels")
        print(json.dumps({"engine": engine, "page": title[:200], "rms_samples": [round(x, 3) for x in lv], "errors": errs[:5]}))
        await b.close()
asyncio.run(main())
