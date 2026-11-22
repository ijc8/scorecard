#!/usr/bin/env python3
"""Turn a recording of a song into the source of a score card.

A card can't hold audio (under 3 kB!), so this is a transcription: it finds the tempo, follows the
most prominent high and low pitch on every sixteenth note, works out typical drum patterns, and
writes a C file that performs the result with small synthesized instruments. Expect a chiptune
cover, at best. It suits music with a steady tempo, a clear tune and a clear bass line.

    pip install numpy librosa soundfile
    python3 scripts/song2card.py song.opus "Song Title" > examples/song.c
    examples/build.sh examples/song.c

Bars that repeat are stored once, and notes are packed one per byte (pitch from a palette, plus
length), which is what makes three minutes of music fit.
"""
import sys
import numpy as np
import librosa
import soundfile

SR, HOP = 22050, 128
FPS = SR / HOP
LOW = 23  # MIDI pitch of the lowest row of the pitch spectrogram
STEPS = 16  # sixteenths per bar (4/4 is assumed)


def load(path):
    y, sr = soundfile.read(path)
    if y.ndim > 1:
        y = y.mean(axis=1)
    return librosa.resample(y.astype(np.float32), orig_sr=sr, target_sr=SR)


def find_grid(y):
    """Tempo (BPM) and the time of the first sixteenth, by sliding a comb over the onset envelope."""
    onsets = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    rough = float(np.atleast_1d(librosa.beat.beat_track(y=y, sr=SR)[0])[0])
    best = (0, rough, 0)
    for bpm in np.arange(rough - 4, rough + 4, 0.01):
        period = 60 / bpm / 4 * FPS
        count = int(len(onsets) / period) - 1
        for phase in np.linspace(0, period, 24, endpoint=False):
            score = onsets[(phase + np.arange(count) * period).astype(int)].sum()
            if score > best[0]:
                best = (score, bpm, phase / FPS)
    return round(best[1], 2), best[2]


def pitch_steps(y, step, phase):
    """Strength of each semitone during each sixteenth, from the harmonic part of the signal."""
    harmonic = librosa.effects.hpss(y, margin=2.0)[0]
    cqt = np.abs(librosa.cqt(harmonic, sr=SR, hop_length=HOP, fmin=librosa.midi_to_hz(LOW), n_bins=8 * 36,
                             bins_per_octave=36, filter_scale=0.6))
    semitones = np.stack([cqt[max(0, 3 * k - 1):3 * k + 2].max(axis=0) for k in range(cqt.shape[0] // 3)])
    count = int((semitones.shape[1] / FPS - phase) / step)
    count -= count % STEPS
    frames = lambda n, a, b: slice(int((phase + (n + a) * step) * FPS), int((phase + (n + b) * step) * FPS))
    return np.stack([semitones[:, frames(n, 0.15, 0.9)].mean(axis=1) for n in range(count)], axis=1)


def follow(steps, low, high, harmonics, rest, change):
    """The most salient pitch in [low, high) on each step (0 for a rest), discouraging needless jumps."""
    count = steps.shape[1]
    salience = np.zeros((high - low, count))
    for i, pitch in enumerate(range(low, high)):
        for h, weight in enumerate(harmonics, 1):
            row = pitch - LOW + int(round(12 * np.log2(h)))
            if 0 <= row < steps.shape[0]:
                salience[i] += weight * steps[row]
    salience /= np.percentile(salience.max(axis=0), 90)
    emit = np.vstack([np.full((1, count), rest), salience])
    score, back = emit[:, 0].copy(), np.zeros(emit.shape, int)
    for n in range(1, count):  # Viterbi
        best = score.argmax()
        back[:, n] = np.where(score >= score[best] - change, np.arange(len(score)), best)
        score = np.maximum(score, score[best] - change) + emit[:, n]
    path = [int(score.argmax())]
    for n in range(count - 1, 0, -1):
        path.append(int(back[path[-1], n]))
    notes = [low + k - 1 if k else 0 for k in reversed(path)]
    for n in range(1, count - 1):  # a one-step blip between two steps of the same note is noise
        if notes[n - 1] == notes[n + 1] != notes[n]:
            notes[n] = notes[n - 1]
    return notes


def find_drums(y, step, phase, count):
    """Per-step onset strength in three bands: kick, snare, hat."""
    spectrum = np.abs(librosa.stft(y, n_fft=1024, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=1024)
    out = []
    for low, high in [(30, 110), (1500, 5000), (8000, 11000)]:
        energy = np.log1p(50 * spectrum[(freqs >= low) & (freqs < high)]).sum(axis=0)
        flux = np.maximum(0, energy[2:] - energy[:-2])
        strength = np.array([flux[int((phase + (n - 0.25) * step) * FPS):int((phase + (n + 0.35) * step) * FPS)].max()
                             for n in range(count)])
        out.append(strength / np.percentile(strength, 95))
    return np.array(out)


def drum_sections(drums, threshold=0.45):
    """Summarize the drums as a few typical one-bar patterns, and which pattern each bar uses (0 = none).

    Individual hits are too unreliable to transcribe one by one, but averaged over the bars of a
    section the pattern comes through. Sections are found by clustering bars by their kick pattern."""
    bars = drums.reshape(3, -1, STEPS)
    active = bars[0].mean(axis=1) + bars[2].mean(axis=1) > 0.5
    # Two clusters is plenty for a card: split the active bars by similarity to the first vs. last third.
    idx = np.flatnonzero(active)
    if len(idx) == 0:
        return [], np.zeros(bars.shape[1], int)
    first, last = idx[:len(idx) // 3], idx[-len(idx) // 3:]
    flat = lambda b: np.concatenate([bars[k][b] for k in range(3)])
    protos = [np.mean([flat(b) for b in group], axis=0) for group in (first, last)]
    use = np.zeros(bars.shape[1], int)
    for b in idx:
        use[b] = 1 + int(np.linalg.norm(flat(b) - protos[1]) < np.linalg.norm(flat(b) - protos[0]))
    patterns = []
    for which in (1, 2):
        members = np.flatnonzero(use == which)
        masks = []
        for k in range(3):
            mean = bars[k][members].mean(axis=0) if len(members) else np.zeros(STEPS)
            masks.append(sum(1 << i for i in range(STEPS) if mean[i] > threshold))
        patterns.append(masks)
    return patterns, use


def pack(notes):
    """Pack a track as (palette, order of bars, bytes of the distinct bars)."""
    counts = {}
    for p in notes:
        counts[p] = counts.get(p, 0) + 1
    # 5 bits of pitch: rest plus the 31 most common pitches; anything rarer moves by octaves onto one of those.
    palette = [0] + sorted(sorted((p for p in counts if p), key=lambda p: -counts[p])[:31])
    def index(p):
        if p in palette:
            return palette.index(p)
        same_class = [q for q in palette[1:] if (q - p) % 12 == 0]
        return palette.index(min(same_class or palette[1:], key=lambda q: abs(q - p)))
    order, bars, data = [], [], []
    for b in range(len(notes) // STEPS):
        bar = tuple(index(p) for p in notes[b * STEPS:(b + 1) * STEPS])
        if bar not in bars:
            bars.append(bar)
            n = 0
            while n < STEPS:  # one byte per note: 5 bits of palette index, 3 bits of length - 1
                length = 1
                while n + length < STEPS and bar[n + length] == bar[n] and length < 8:
                    length += 1
                data.append(bar[n] | (length - 1) << 5)
                n += length
        order.append(bars.index(bar))
    assert len(bars) <= 256
    return palette, order, data


def c_array(name, ctype, values, fmt="{}"):
    return f"const {ctype} {name}[] = {{{','.join(fmt.format(v) for v in values)}}};"


def main():
    path, title = sys.argv[1], sys.argv[2]
    y = load(path)
    bpm, phase = find_grid(y)
    step = 60 / bpm / 4
    steps = pitch_steps(y, step, phase)
    count = steps.shape[1]
    bass = follow(steps, 28, 50, (0.4, 1.0, 0.8, 0.5), rest=0.15, change=0.18)
    lead = follow(steps, 55, 98, (1, 0.3, 0.15), rest=0.15, change=0.15)
    patterns, use = drum_sections(find_drums(y, step, phase, count))
    print(f"{bpm} BPM, {count // STEPS} bars", file=sys.stderr)

    out = [f"// A transcription of a recording, made by scripts/song2card.py: {count // STEPS} bars at {bpm} BPM.",
           '#include "deck.h"', "", f'card_title("{title}");', "",
           f"#define BARS {count // STEPS}", f"#define STEP_DUR {step:.6f}f", ""]
    for name, notes in [("lead", lead), ("bass", bass)]:
        palette, order, data = pack(notes)
        print(f"{name}: {len(set(order))} distinct bars, {len(data)} notes", file=sys.stderr)
        out += [c_array(f"{name}_pitches", "char", palette), c_array(f"{name}_order", "uint8_t", order),
                c_array(f"{name}_notes", "uint8_t", data), ""]
    out += [c_array("drum_patterns", "uint16_t", [m for p in patterns for m in p], "0x{:x}"),
            "// Which drum pattern each bar uses (two bits per bar; 0 for none).",
            c_array("drum_use", "uint8_t", [sum(int(use[b + i]) << 2 * i for i in range(4) if b + i < len(use))
                                           for b in range(0, len(use), 4)]), ""]
    out.append(PLAYER)
    print("\n".join(out))


PLAYER = r"""
typedef struct {
    const char *pitches;
    const uint8_t *order, *notes, *next;
    int left, pitch;
    float freq, t, phase[2], lp;
} track_t;

track_t tracks[2] = {
    {lead_pitches, lead_order, lead_notes},
    {bass_pitches, bass_order, bass_notes},
};

float clock = STEP_DUR, drum_t[3], kick_phase, hat_lp;
int step = -1;

// Move a track on by one step, starting its next note when the current one runs out.
void advance(track_t *track, int bar, int start_of_bar) {
    if (start_of_bar) {
        // Find this bar's notes: bars are stored back to back, each adding up to 16 steps.
        track->next = track->notes;
        for (int skip = track->order[bar] * 16; skip > 0; track->next++) {
            skip -= (*track->next >> 5) + 1;
        }
        track->left = 0;
    }
    if (track->left-- > 0) return;
    int note = *track->next++;
    int pitch = track->pitches[note & 31];
    track->left = note >> 5;
    // A note that just carries on (over a bar line, or past the longest length) isn't struck again.
    if (pitch != track->pitch) {
        track->pitch = pitch;
        track->t = 0;
        if (pitch) track->freq = m2f(pitch);
    }
}

float process() {
    if (clock >= STEP_DUR) {
        clock -= STEP_DUR;
        step = (step + 1) % (BARS * 16);
        int bar = step / 16, pos = step % 16;
        for (int i = 0; i < 2; i++) advance(&tracks[i], bar, !pos);
        int use = drum_use[bar / 4] >> bar % 4 * 2 & 3;
        for (int i = 0; i < 3; i++) {
            if (use && drum_patterns[(use - 1) * 3 + i] >> pos & 1) drum_t[i] = 0;
        }
    }
    clock += dt;

    // Lead: a hollow, slightly detuned pair of squares, fading as the note is held.
    track_t *lead = &tracks[0], *bass = &tracks[1];
    float out = 0;
    if (lead->pitch) {
        float x = sqr(&lead->phase[0], lead->freq) + tri(&lead->phase[1], lead->freq * 1.005f);
        out += lp1(&lead->lp, x, 0.25f) * (0.08f + 0.07f / (1 + lead->t * 6));
    }
    // Bass: a saw with the top taken off.
    if (bass->pitch) {
        out += lp1(&bass->lp, saw(&bass->phase[0], bass->freq), 0.06f) * (0.16f + 0.16f / (1 + bass->t * 8));
    }
    lead->t += dt;
    bass->t += dt;

    // Drums: a falling sine for the kick, and noise bursts (the hat's with the low end removed).
    float n = noise(), e;
    if (drum_t[0] < 0.2f) {
        e = env(drum_t[0], 0.2f);
        out += sine(&kick_phase, 45 + 160 * e * e) * e * 0.35f;
    }
    if (drum_t[1] < 0.12f) out += n * env(drum_t[1], 0.12f) * 0.14f;
    float high = n - lp1(&hat_lp, n, 0.5f);
    if (drum_t[2] < 0.04f) out += high * env(drum_t[2], 0.04f) * 0.1f;
    for (int i = 0; i < 3; i++) drum_t[i] += dt;
    return soft_clip(out);
}
"""

if __name__ == "__main__":
    main()
