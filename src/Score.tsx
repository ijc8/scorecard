// A card's score: the performance that's playing (this card, this seed), drawn before it's heard.
// Time runs across, 64 seconds to a page, and pitch runs up; the darker, the louder. A line shows
// where the music has got to, and tapping goes to that moment. It's a spectrogram, made by running
// the card ahead in a worker (score.worker.ts), which is given up on if the card gets stuck.
import { useEffect, useRef, useState } from "react"
import { COLUMNS, PAGE, ROWS, SAMPLE_RATE } from "./score"

// (Ordered dither: the card is black and white.)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const PATIENCE = 5000

let worker: Worker | null = null
let asked = 0

export function Score({ binary, seed, time, active, seek }: {
    // The loaded card, the seed it's playing with and how far it has got (in seconds); whether the score is to be seen.
    binary: Uint8Array | null, seed: number, time: number, active: boolean,
    seek: (seconds: number) => void,
}) {
    const canvas = useRef<HTMLCanvasElement>(null)
    // How loud each row of each column is on the page shown (255: not known yet).
    const levels = useRef(new Uint8Array(COLUMNS * ROWS))
    const known = useRef(0)
    const [message, setMessage] = useState("")
    const page = Math.floor(time / PAGE)

    const draw = () => {
        const context = canvas.current?.getContext("2d")
        if (!context) return
        const image = context.createImageData(COLUMNS, ROWS)
        const here = Math.floor((time - page * PAGE) / PAGE * COLUMNS)
        for (let column = 0; column < COLUMNS; column++) {
            for (let row = 0; row < ROWS; row++) {
                // (The top row of the picture is the highest pitch.)
                const y = ROWS - 1 - row, level = levels.current[column * ROWS + row]
                let dark = column < known.current ? level > (BAYER[(column % 4) + (y % 4) * 4] + 0.5) * 16 : (column + y) % 8 === 0
                if (column === here) dark = !dark || level < 24
                image.data[(y * COLUMNS + column) * 4 + 3] = dark ? 255 : 0
            }
        }
        context.putImageData(image, 0, 0)
    }

    useEffect(() => {
        if (!active || !binary) return
        known.current = 0
        setMessage("")
        draw()
        worker ??= new Worker(new URL("./score.worker.ts", import.meta.url), { type: "module" })
        const mine = worker, id = ++asked
        // A card that goes too long without a word is stuck, and so is its worker.
        let patience = 0
        const giveUp = (why: string) => {
            if (worker === mine) worker = null
            mine.terminate()
            setMessage(why)
        }
        const wait = () => {
            clearTimeout(patience)
            patience = window.setTimeout(() => giveUp("This card is taking too long to read ahead."), PATIENCE)
        }
        const hear = (e: MessageEvent) => {
            if (e.data.id !== id) return
            wait()
            if (e.data.error) return giveUp(e.data.error)
            if (e.data.done) return clearTimeout(patience)
            if (e.data.levels) {
                levels.current.set(e.data.levels, e.data.column * ROWS)
                known.current = e.data.column + 1
                // (Not at every column: a page comes in a few hundred at a second.)
                if (e.data.column % 4 === 3 || e.data.column === COLUMNS - 1) draw()
            }
        }
        mine.addEventListener("message", hear)
        mine.postMessage({ id, binary, seed, from: page * PAGE * SAMPLE_RATE, columns: COLUMNS })
        wait()
        return () => {
            clearTimeout(patience)
            mine.removeEventListener("message", hear)
        }
    }, [active, binary, seed, page])

    useEffect(draw, [time])

    return <>
        <canvas ref={canvas} className="score" width={COLUMNS} height={ROWS} style={{ display: active ? "block" : "none" }}
            title={`The score: ${PAGE} seconds across, low notes to high. Tap to go to a moment.`}
            onClick={e => {
                const box = e.currentTarget.getBoundingClientRect()
                seek((page + (e.clientX - box.left) / box.width) * PAGE)
            }}></canvas>
        {active && message && <div className="score-message">{message}</div>}
    </>
}
