// A page of mock-ups for the spread (the whole deck at once), to choose between. Static: nothing on it works.
//   npx tsx scripts/spread-mockups.ts > dist/spread.html   (from the repository, after `npm run build`: it uses the built font, and the example cards built in examples/)
import { readFileSync, readdirSync } from "fs"
import { createHash } from "crypto"
import QRCode from "qrcode"
import { PNG } from "pngjs"
import { decodeBlob, encodeBlob } from "../src/base43Encoder"
import lib from "../src/library.json"

const SR = 44100
interface Card { title: string, size: number, binary: Uint8Array, hash: string, added: string, plays: number, listened: string, seeds: number, qr: string, picture: string, band: string, small: string }

// The card's picture: a spectrogram of its first seconds (seed 0), in black and white.
function fft(re: Float64Array, im: Float64Array) {
    const n = re.length
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len
        for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
            const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, b = a + len / 2
            const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr
            re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi
        }
    }
}
function picture(binary: Uint8Array, W = 64, H = 40, seconds = 16) {
    const { exports } = new WebAssembly.Instance(new WebAssembly.Module(binary), {}) as any
    const p = exports.p ?? exports.process
    exports.s?.(0)
    const input = p.length > 0, N = 2048, hop = Math.floor(seconds * SR / W)
    const x = new Float32Array(seconds * SR + N)
    for (let i = 0; i < x.length; i++) x[i] = input ? p(i % 22050 < 400 ? Math.random() - 0.5 : 0) : p()
    const grid = new Float64Array(W * H)
    let max = 1e-9
    for (let c = 0; c < W; c++) {
        const re = new Float64Array(N), im = new Float64Array(N)
        for (let i = 0; i < N; i++) re[i] = x[c * hop + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))
        fft(re, im)
        for (let r = 0; r < H; r++) {
            // log frequency, 60 Hz to 8 kHz
            const f0 = 60 * Math.pow(8000 / 60, r / H), f1 = 60 * Math.pow(8000 / 60, (r + 1) / H)
            let sum = 0, count = 0
            for (let b = Math.floor(f0 * N / SR); b <= Math.ceil(f1 * N / SR); b++) { sum += Math.hypot(re[b], im[b]); count++ }
            const v = grid[(H - 1 - r) * W + c] = sum / count
            if (v > max) max = v
        }
    }
    // ordered dither of the level in dB over a 40 dB range
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
    const png = new PNG({ width: W, height: H })
    for (let i = 0; i < W * H; i++) {
        const level = Math.max(0, 1 + 20 * Math.log10(grid[i] / max + 1e-9) / 40)
        const on = level > (bayer[(i % W % 4) + (Math.floor(i / W) % 4) * 4] + 0.5) / 16
        png.data.set(on ? [0, 0, 0, 255] : [255, 255, 255, 255], i * 4)
    }
    return "data:image/png;base64," + PNG.sync.write(png).toString("base64")
}

async function main() {
    const sources: { title: string, binary: Uint8Array }[] = (lib as any[]).map(c => ({ title: c.title, binary: decodeBlob(c.code) }))
    for (const [title, file] of [["changes", "changes"], ["fireflies", "fireflies"], ["sitting in a card", "sitting"], ["canyon", "canyon"], ["Return True", "return-true"]]) sources.push({ title, binary: new Uint8Array(readFileSync(`examples/${file}.wasm`)) })
    // (Two cards with one name, to see how they're told apart.)
    const twin = new Uint8Array(sources[2].binary.length + 4); twin.set(sources[2].binary); twin.set([0, 2, 1, 49], sources[2].binary.length)
    sources.splice(5, 0, { title: sources[2].title, binary: twin })
    const dates = ["Nov 3", "Nov 3", "Nov 3", "Nov 9", "Nov 9", "Nov 12", "Nov 14", "Nov 14", "Nov 20", "Nov 22", "Nov 24", "Nov 25", "Nov 25", "Nov 25"]
    const cards: Card[] = []
    for (const [i, { title, binary }] of sources.entries()) {
        cards.push({
            title, binary, size: binary.length, hash: createHash("sha256").update(binary).digest("hex").slice(0, 4), added: dates[i % dates.length],
            plays: [12, 3, 31, 1, 7, 0, 5, 18, 2, 9, 4, 1, 0, 6][i % 14], listened: ["41 min", "6 min", "2 h 10", "1 min", "19 min", "-", "8 min", "55 min", "3 min", "22 min", "9 min", "2 min", "-", "14 min"][i % 14], seeds: [2, 0, 5, 0, 1, 0, 0, 3, 0, 1, 0, 0, 0, 1][i % 14],
            qr: await QRCode.toDataURL("HTTPS://IJC8.ME/S?c=" + encodeBlob(binary), { errorCorrectionLevel: "L", margin: 0, scale: 1 }),
            picture: picture(binary), band: picture(binary, 160, 12, 24), small: picture(binary, 48, 20, 12),
        })
    }
    const font = readdirSync("dist/assets").find(f => /^sysfont.*\.woff2$/.test(f)), logo = "data:image/png;base64," + readFileSync("src/assets/logo.png").toString("base64")
    const current = 2
    const heart = `<svg viewBox="0 0 24 24" class="h"><path d="M9 2H5v2H3v2H1v6h2v2h2v2h2v2h2v2h2v2h2v-2h2v-2h2v-2h2v-2h2v-2h2V6h-2V4h-2V2h-4v2h-2v2h-2V4H9V2z" fill="currentColor"/></svg>`
    const seeds = (c: Card) => c.seeds ? `<span class="kept">${heart}${c.seeds}</span>` : ""
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")

    const index = (withQR: boolean) => `<div class="grid">${cards.map((c, i) => `<div class="card index${i === current ? " cur" : ""}" style="--tilt:${((i * 7) % 5 - 2) * 0.5}deg">
        <b>${esc(c.title)}</b>
        <img class="pic" src="${withQR ? c.qr : c.picture}">
        <span class="row"><span>${c.size} B</span><span class="dim">${c.hash}</span></span>
        <span class="row"><span class="dim">${c.added}</span>${seeds(c)}</span>
    </div>`).join("")}</div>`

    const strip = (c: Card, i: number, extra = "") => `<div class="card strip${i === current ? " cur" : ""}" style="--nudge:${((i * 5) % 7 - 3)}px"><span class="row"><b>${esc(c.title)}</b><span>${extra}${c.size} bytes</span></span></div>`
    const full = (c: Card) => `<div class="card strip fullcard"><span class="row"><b>${esc(c.title)}</b><span>${c.size} bytes</span></span><img class="logo" src="${logo}"><img class="qr" src="${c.qr}"></div>`
    const half = Math.ceil(cards.length / 2)
    const cascade = `<div class="columns">${[cards.slice(0, half), cards.slice(half)].map((col, k) => `<div class="cascade">${col.map((c, i) => i === col.length - 1 ? full(c) : strip(c, i + k * half)).join("")}</div>`).join("")}</div>`

    const box = `<div class="cascade one">${cards.map((c, i) => `<div class="card strip tall${i === current ? " cur" : ""}" style="--nudge:${((i * 5) % 7 - 3)}px">
        <span class="row"><b>${esc(c.title)}</b><span>${c.size} bytes</span></span>
        <span class="row small"><span class="dim">${c.hash} &middot; ${c.added} &middot; ${c.plays} plays</span>${seeds(c)}</span></div>`).join("")}</div>`

    const list = `<div class="dex">${cards.map((c, i) => `<div class="entry${i === current ? " cur" : ""}">
        <span class="no">${String(i + 1).padStart(3, "0")}</span><img class="pic" src="${c.picture}">
        <span class="what"><span class="row"><b>${esc(c.title)}</b><span>${c.size} B</span></span>
        <span class="row small dim"><span>${c.hash} &middot; ${c.added}</span><span>${c.plays ? `${c.plays} plays &middot; ${c.listened}` : "not played"}</span>${seeds(c)}</span></span>
    </div>`).join("")}</div>
    <div class="card detail"><span class="row"><b>${esc(cards[current].title)}</b><span>${cards[current].size} bytes</span></span>
        <div class="two"><img class="qr" src="${cards[current].qr}"><span class="small">No. 003<br>${cards[current].hash}<br>scanned ${cards[current].added}<br>${cards[current].plays} plays<br>${cards[current].listened} heard<br>23 seeds heard<br>${cards[current].seeds} kept</span></div></div>`

    // Round 2: the card box again, with the pictures.
    const lift = (c: Card) => `<div class="card lifted"><span class="row"><b>${esc(c.title)}</b><span>${c.size} bytes</span></span>
        <img class="pic" src="${c.picture}">
        <span class="row small"><span>${c.hash} &middot; scanned ${c.added}</span><span>${c.plays} plays &middot; ${c.listened}</span></span>
        <span class="row small"><span class="seedrow"><u>1234abcd</u><u>0000004d</u><u>9f3e2a10</u></span><span class="acts"><u>Play</u><u>Remove</u></span></span></div>`
    const box2 = (kind: string) => `<div class="cascade one ${kind}">${cards.map((c, i) => i === current && kind !== "bands" ? lift(c) : `<div class="card strip tall" style="--nudge:${((i * 5) % 7 - 3)}px">
        <span class="row"><b>${esc(c.title)}</b>${kind === "thumbs" ? `<img class="thumb" src="${c.small}">` : ""}<span>${c.size} bytes</span></span>
        ${kind === "bands" ? `<img class="band" src="${c.band}">` : `<span class="row small"><span class="dim">${c.hash} &middot; ${c.added} &middot; ${c.plays} plays</span>${seeds(c)}</span>`}</div>`).join("")}</div>`
    const round2: [string, string, string][] = [
        ["C1. Card box, one card lifted", "The box as before, but the card on top of the pile is lifted out of it and shows its picture (12 seconds of its sound, seed 0), its counts and its kept performances. Tapping another card's edge lifts that one instead; tapping the lifted card plays it.", box2("plain")],
        ["C2. Card box, a picture on every edge", "The same, with a small picture of each card beside its name, so that cards can be told apart at a glance without lifting them.", box2("thumbs")],
        ["C3. Card box, the edge is the picture", "Each card's top edge carries a band of its sound (24 seconds) under its name, in place of the small print. Nothing is lifted: tapping an edge plays that card. The densest of the three to look at, and the one with the least text.", box2("bands")],
    ]
    const variants: [string, string, string][] = [
        ["A. Index cards", "Each card is a plain index card: its name, a picture of its sound (a spectrogram of its first 16 seconds with seed 0), size, a short hash, the date it was scanned and how many performances are kept. No wordmark, no controls.", index(false)],
        ["A2. Index cards, with the code", "The same, with the card's QR code where the picture was.", index(true)],
        ["B. Cascade", "As in FreeCell: columns of overlapping cards, each showing its top edge, the last one whole. For this to be honest the name and size have to be the top line of the card, above the wordmark (drawn that way on the whole cards here).", cascade],
        ["C. Card box", "One column, like looking down into a box of index cards: every card shows its top edge, with a second line of small print. Fits the most on a phone (14 here; about 20 a screen).", box],
        ["D. Catalogue", "Not cards at all: a numbered list (the Pok&eacute;dex), with the chosen entry opened below. Room for counts: plays, time heard, seeds heard and kept.", list],
    ]
    console.log(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Spread mock-ups</title>
<style>
@font-face { font-family: Sysfont; src: url("assets/${font}") format("woff2"); }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; background: #ccf; font: 16px/1.25 Sysfont, monospace; }
h1 { font-size: 20px; font-weight: normal; margin: 4px 0 2px; } p { margin: 0 0 12px; font: 13px/1.4 system-ui, sans-serif; max-width: 366px; }
main { display: flex; flex-wrap: wrap; gap: 28px 36px; align-items: flex-start; } section { width: 366px; max-width: 100%; }
img { image-rendering: pixelated; display: block; } b { font-weight: normal; }
.card { background: white; border: 1px solid black; box-shadow: 3px 3px 0 black; }
.row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; white-space: nowrap; } .row > b { overflow: hidden; text-overflow: ellipsis; }
.dim { opacity: .55; } .small { font-size: 12px; } .h { height: 10px; vertical-align: -1px; margin-right: 2px; } .kept { white-space: nowrap; }
.cur { outline: 3px solid black; z-index: 1; position: relative; } .strip.cur { z-index: auto; outline: none; border-width: 3px; padding: 3px 7px 0; left: calc(var(--nudge, 0px) - 8px); }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 12px; }
.index { padding: 7px 8px 6px; font-size: 12px; transform: rotate(var(--tilt)); display: flex; flex-direction: column; gap: 3px; min-height: 150px; }
.index > b { font-size: 15px; line-height: 1.1; min-height: 2.2em; } .index .pic { width: 100%; aspect-ratio: 64 / 40; margin: auto 0 2px; border: 1px solid black; }
.columns { display: flex; gap: 14px; } .cascade { flex: 1; min-width: 0; padding-bottom: 6px; }
.strip { padding: 5px 9px 0; height: 60px; margin-bottom: -32px; font-size: 14px; position: relative; left: var(--nudge, 0); border-radius: 0; }
.fullcard { height: auto; margin-bottom: 0; padding-bottom: 10px; } .fullcard .logo { width: 100%; margin: 8px 0; } .fullcard .qr { width: 100%; }
.one .strip { font-size: 16px; height: 70px; margin-bottom: -28px; margin-right: 6px; } .one .strip:last-child { margin-bottom: 0; height: 46px; } .one .small { margin-top: 1px; }
.dex { background: white; border: 1px solid black; box-shadow: 3px 3px 0 black; height: 330px; overflow-y: auto; }
.entry { display: flex; gap: 8px; align-items: center; padding: 4px 8px; border-bottom: 1px solid black; } .entry.cur { outline: none; background: black; color: white; } .entry.cur .pic { filter: invert(1); }
.entry .no { font-size: 12px; opacity: .6; } .entry .pic { width: 48px; height: 30px; flex-shrink: 0; } .what { flex: 1; min-width: 0; }
.lifted { position: relative; z-index: 1; margin: 6px -4px 10px 6px; padding: 8px 10px; outline: 3px solid black; display: flex; flex-direction: column; gap: 5px; } .lifted .pic { width: 100%; aspect-ratio: 64 / 26; object-fit: cover; border: 1px solid black; }
u { text-decoration: none; border: 1px solid black; padding: 0 4px; margin-right: 3px; } .acts u { margin: 0 0 0 3px; }
.thumb { height: 20px; width: 48px; border: 1px solid black; margin-left: auto; align-self: center; } .thumbs .strip .row:first-child > span:last-child { width: 5.2em; text-align: right; }
.band { width: 100%; height: 14px; margin-top: 3px; border-top: 1px solid black; border-bottom: 1px solid black; } .bands .strip { height: 62px; margin-bottom: -22px; } .bands .strip:last-child { height: 46px; }
.detail { margin-top: 12px; padding: 10px 12px; } .two { display: flex; gap: 12px; margin-top: 8px; align-items: flex-start; } .two .qr { width: 55%; } .two .small { line-height: 1.6; }
</style>
<h1>The spread, round 2: the card box with pictures</h1>
<p>Mock-ups with the real cards (one name is used twice on purpose); the counts are made up. Nothing here works.</p>
<main>${round2.map(([name, note, body]) => `<section><h1>${name}</h1><p>${note}</p>${body}</section>`).join("")}</main>
<h1 style="margin-top: 40px">Round 1: five ways to show the deck</h1>
<p>The outlined card is the one on top of the pile.</p>
<main>${variants.map(([name, note, body]) => `<section><h1>${name}</h1><p>${note}</p>${body}</section>`).join("")}</main>`)
}
main()
