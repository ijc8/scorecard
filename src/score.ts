// The measure of a card's score (see Score.tsx), shared with the worker that works it out.
export const SAMPLE_RATE = 44100
// Each column is half a second of the card, and a page is 128 of them: 64 seconds.
export const COLUMN = SAMPLE_RATE / 2, COLUMNS = 128, PAGE = COLUMNS * COLUMN / SAMPLE_RATE
// Each row is a band of pitch: 128 of them, from 40 Hz up to 14 kHz (about fifteen to the octave).
export const ROWS = 128, LOWEST = 40, HIGHEST = 14000
// (How many samples are looked at at once to tell the pitches apart.)
export const FRAME = 4096

// Where each row's band starts, in bins of the transform (and where the last one ends).
export function rowBins() {
    return Array.from({ length: ROWS + 1 }, (_, row) => Math.round(LOWEST * (HIGHEST / LOWEST) ** (row / ROWS) * FRAME / SAMPLE_RATE))
}
