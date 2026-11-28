// The measure of a card's score (see Score.tsx), shared with the worker that works it out.
export const SAMPLE_RATE = 44100
// How many samples are looked at at once to tell the pitches apart; each column of the score is one such look.
export const FRAME = 4096
// The score is 128 columns across: about 12 seconds, of which the first third has been heard.
export const COLUMN = 4134, COLUMNS = 128, HEARD = 42
export const COLUMN_SECONDS = COLUMN / SAMPLE_RATE
// Each row is a band of pitch: 128 of them, from 40 Hz up to 14 kHz (about fifteen to the octave).
export const ROWS = 128, LOWEST = 40, HIGHEST = 14000

// Where each row's band starts, in bins of the transform (and where the last one ends).
export function rowBins() {
    return Array.from({ length: ROWS + 1 }, (_, row) => Math.round(LOWEST * (HIGHEST / LOWEST) ** (row / ROWS) * FRAME / SAMPLE_RATE))
}
