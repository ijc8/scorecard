// A card's score: the performance that's playing (this card, this seed), drawn as it goes by. Time
// runs across, about twelve seconds of it: a line marks now, with what has just been heard to its
// left and what's coming to its right. Pitch runs up; the darker, the louder. Tapping goes to that
// moment. It's a spectrogram, made by running the card ahead in a worker (score.worker.ts), which
// is given up on if the card gets stuck.
import { useEffect, useRef, useState } from "react"
import { COLUMNS, COLUMN_SECONDS, HEARD, ROWS } from "./score"

// (Ordered dither: the card is black and white.)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
// How far past the right-hand edge the worker is kept, how many columns are remembered, and how
// long the worker may go without a word when there's work to do.
const AHEAD = 48, REMEMBERED = 1500, PATIENCE = 5000

let worker: Worker | null = null
let asked = 0

export function Score({ binary, seed, time, active, seek }: {
    // The loaded card, the seed it's playing with and how far it has got (in seconds); whether the score is to be seen.
    binary: Uint8Array | null, seed: number, time: number, active: boolean,
    seek: (seconds: number) => void,
}) {
    const canvas = useRef<HTMLCanvasElement>(null)
    // How loud each row of each column is, for the columns known (by their number from the start).
    const columns = useRef(new Map<number, Uint8Array>())
    // What the worker has been asked for: which card, the next column it will send, and how far it's to go.
    const job = useRef<{ id: number, binary: Uint8Array, seed: number, worker: Worker, next: number, upTo: number, patience: number, wait: () => void } | null>(null)
    // (A card whose worker was given up on isn't tried again.)
    const stuck = useRef<Uint8Array | null>(null)
    const [message, setMessage] = useState("")
    const now = Math.floor(time / COLUMN_SECONDS), first = now - HEARD

    const draw = () => {
        const context = canvas.current?.getContext("2d")
        if (!context) return
        const image = context.createImageData(COLUMNS, ROWS)
        for (let x = 0; x < COLUMNS; x++) {
            const column = first + x, levels = columns.current.get(column)
            for (let row = 0; row < ROWS; row++) {
                // (The top row of the picture is the highest pitch. The dither goes by with the music, so it doesn't shimmer.)
                const y = ROWS - 1 - row, level = levels?.[row] ?? 0
                let dark = levels ? level > (BAYER[(column & 3) + (y % 4) * 4] + 0.5) * 16 : column >= 0 && (column + y) % 8 === 0
                if (column === now) dark = !dark || level < 24
                image.data[(y * COLUMNS + x) * 4 + 3] = dark ? 255 : 0
            }
        }
        context.putImageData(image, 0, 0)
    }

    const stop = () => {
        clearTimeout(job.current?.patience)
        job.current = null
    }
    useEffect(() => stop, [])

    // Keep the worker far enough ahead of what's shown, starting it again if it's somewhere else.
    useEffect(() => {
        if (!active || !binary || stuck.current === binary) return stop()
        const from = Math.max(0, first), upTo = first + COLUMNS + AHEAD
        let j = job.current
        if (j && (j.binary !== binary || j.seed !== seed)) {
            columns.current.clear()
            j = null
        }
        let missing: number | undefined
        for (let column = from; column < first + COLUMNS && missing === undefined; column++) if (!columns.current.has(column)) missing = column
        if (!j || (missing !== undefined && (missing < j.next || missing > j.next + 400))) {
            // (From here: it's a new card, or we've gone back to before what's remembered, or far ahead.)
            stop()
            setMessage("")
            const mine = worker ??= new Worker(new URL("./score.worker.ts", import.meta.url), { type: "module" })
            const giveUp = (why: string) => {
                if (worker === mine) worker = null
                mine.terminate()
                if (job.current === fresh) stop()
                stuck.current = binary
                setMessage(why)
            }
            // A card that goes too long without a word, with work to do, is stuck, and so is its worker.
            const wait = () => {
                clearTimeout(fresh.patience)
                if (fresh.next < fresh.upTo) fresh.patience = window.setTimeout(() => giveUp("This card is taking too long to read ahead."), PATIENCE)
            }
            const id = ++asked, fresh = job.current = { id, binary, seed, worker: mine, next: missing ?? from, upTo, patience: 0, wait }
            mine.addEventListener("message", (e: MessageEvent) => {
                if (e.data.id !== id || job.current !== fresh) return
                if (e.data.error) return giveUp(e.data.error)
                if (e.data.levels) {
                    columns.current.set(e.data.column, e.data.levels)
                    fresh.next = e.data.column + 1
                    // (The oldest go, once there are a couple of minutes' worth.)
                    if (columns.current.size > REMEMBERED) columns.current.delete(columns.current.keys().next().value!)
                    if (fresh.next % 4 === 0 || fresh.next === fresh.upTo) redraw.current()
                }
                wait()
            })
            mine.postMessage({ id, binary, seed, from: fresh.next, upTo })
            wait()
        } else if (j.upTo < upTo) {
            const idle = j.next >= j.upTo
            j.upTo = upTo
            j.worker.postMessage({ id: j.id, upTo })
            if (idle) j.wait()
        }
    }, [active, binary, seed, now])

    const redraw = useRef(draw)
    redraw.current = draw
    useEffect(draw, [now, active, binary, seed])

    return <>
        <canvas ref={canvas} className="score" width={COLUMNS} height={ROWS} style={{ display: active ? "block" : "none" }}
            title="The score: what has just been heard, and what's coming; low notes to high. Tap to go to a moment."
            onClick={e => {
                const box = e.currentTarget.getBoundingClientRect()
                seek(Math.max(0, first + (e.clientX - box.left) / box.width * COLUMNS) * COLUMN_SECONDS)
            }}></canvas>
        {active && message && <div className="score-message">{message}</div>}
    </>
}
