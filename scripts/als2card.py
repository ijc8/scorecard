#!/usr/bin/env python3
"""Turn an Ableton Live set's MIDI arrangement into the source of a score card.

    python3 scripts/als2card.py song.als "Song Title" [options] > examples/song.c
    examples/build.sh examples/song.c

Every MIDI track's arrangement clips are unrolled (loops included) and snapped to sixteenths. Each
track is given one of four built-in instruments by its name (organ, bass, horns, lead). Audio
tracks can't be read (the samples aren't in the set), so drums are described by hand:

    --loop KICK,SNARE,HAT   a four-bar drum pattern, as three 64-bit hit masks (bit 0 = first sixteenth)
    --loop-bars 3-12,19-28  the bars (from 0, end exclusive) in which that pattern plays
    --shaker-bars 4-44      bars with a steady shaker

To fit, bars that repeat are stored once; a note is two bytes, and a pitch that's hit several
times in a bar with short notes is stored as a three-byte hit mask instead.
"""
import argparse
import gzip
import sys
import xml.etree.ElementTree as ET

STEPS = 16
ORGAN, BASS, HORNS, LEAD = range(4)
# Lengths (in sixteenths) that a note can have; others are rounded to the nearest of these.
LENGTHS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 14, 15, 16, 18, 24, 28]


def instrument(name):
    name = name.lower()
    if "bass" in name:
        return BASS
    if "organ" in name or "key" in name or "piano" in name:
        return ORGAN
    if "horn" in name or "brass" in name or "pad" in name or "string" in name:
        return HORNS
    return LEAD


def read_notes(path):
    """All arrangement notes as (instrument, start step, length in steps, MIDI pitch), plus the tempo."""
    with gzip.open(path) as f:
        live_set = ET.parse(f).getroot().find("LiveSet")
    value = lambda element, where: element.find(where).attrib["Value"]
    tempo = float(value(live_set, ".//MasterTrack//Tempo/Manual"))
    notes = set()
    for track in live_set.find("Tracks").findall("MidiTrack"):
        inst = instrument(value(track, "Name/EffectiveName"))
        for clip in track.findall(".//MainSequencer/ClipTimeable/ArrangerAutomation/Events/MidiClip"):
            start, end = float(clip.attrib["Time"]), float(value(clip, "CurrentEnd"))
            loop_start, loop_end = float(value(clip, "Loop/LoopStart")), float(value(clip, "Loop/LoopEnd"))
            looping = value(clip, "Loop/LoopOn") == "true"
            clip_notes = [(float(n.attrib["Time"]), float(n.attrib["Duration"]), int(value(key, "MidiKey")))
                          for key in clip.findall(".//KeyTracks/KeyTrack") for n in key.findall("Notes/MidiNoteEvent")
                          if n.attrib.get("IsEnabled", "true") == "true"]
            # Play the clip's loop over and over until the clip ends.
            position, offset = start, loop_start + float(value(clip, "Loop/StartRelative"))
            while position < end - 1e-6:
                span = min(end - position, loop_end - offset)
                for time, duration, pitch in clip_notes:
                    if offset - 1e-6 <= time < offset + span - 1e-6:
                        notes.add((inst, round((position + time - offset) * 4), max(1, round(duration * 4)), pitch))
                position, offset = position + span, loop_start
                if not looping:
                    break
    return tempo, sorted(notes)


def find_streams(notes, min_count=6, max_period=32):
    """Pull out long runs of one short note repeated at a fixed interval (pedal notes, arpeggiator
    lines that drift across the bar lines...), which are far cheaper to describe as such.
    Returns the streams as (instrument, pitch, first step, period, count), and the remaining notes."""
    left, streams, onsets = set(notes), [], {}
    for inst, start, length, pitch in notes:
        if length == 1:
            onsets.setdefault((inst, pitch), set()).add(start)
    for (inst, pitch), steps in sorted(onsets.items()):
        while True:
            best = (0, 0, 0)
            for start in sorted(steps):
                for period in range(1, max_period + 1):
                    count = 1
                    while start + count * period in steps:
                        count += 1
                    best = max(best, (min(count, 255), -start, period))
            count, start, period = best[0], -best[1], best[2]
            if count < min_count:
                break
            streams.append((inst, pitch, start, period, count))
            for k in range(count):
                steps.discard(start + k * period)
                left.discard((inst, start + k * period, 1, pitch))
    return sorted(streams, key=lambda s: s[2]), sorted(left)


def encode(notes, bars):
    """Pack the notes as (palettes, bar orders per instrument group, bytes of the distinct bars)."""
    palettes = [sorted({pitch for inst, _, _, pitch in notes if inst == i}) for i in range(4)]
    assert all(len(p) <= 31 for p in palettes), "too many different pitches in one instrument"
    streams, notes = find_streams(notes)
    nearest = lambda length: min(range(16), key=lambda i: abs(LENGTHS[i] - length))
    # Three groups of instruments, each with its own sequence of bars, so that a part which repeats
    # can be reused whatever the other parts are doing.
    groups = [[ORGAN], [BASS], [HORNS, LEAD]]
    data, distinct, orders = [], {(): 0}, []
    data.append(0)  # bar 0 is the empty bar
    for group in groups:
        order = []
        for bar in range(bars):
            content = tuple(sorted((inst, start % STEPS, length, pitch) for inst, start, length, pitch in notes
                                   if inst in group and start // STEPS == bar))
            if content not in distinct:
                distinct[content] = len(distinct)
                short = {}
                for inst, start, length, pitch in content:
                    if length == 1:
                        short.setdefault((inst, pitch), []).append(start)
                for inst, start, length, pitch in content:
                    hits = short.get((inst, pitch), [])
                    index = palettes[inst].index(pitch) + 1
                    if length == 1 and len(hits) > 1:
                        if start == hits[0]:  # one item for all of this pitch's short notes
                            mask = sum(1 << s for s in hits)
                            data += [0x80 | inst << 5 | index, mask & 255, mask >> 8]
                    else:
                        data += [inst << 5 | index, start << 4 | nearest(length)]
                data.append(0)
            order.append(distinct[content])
        orders.append(order)
    assert len(distinct) <= 256
    stream_data = []
    for inst, pitch, start, period, count in streams:
        assert start < 2048
        packed = start | (period - 1) << 11
        stream_data += [inst << 5 | palettes[inst].index(pitch) + 1, packed & 255, packed >> 8, count]
    # The order of bars is mostly runs: the same bar over and over (silence, especially), or bars
    # one after another as first written. So it's stored as runs: (bar, length, with the top bit set
    # if the bar number counts up along the run).
    flat, runs = [b for order in orders for b in order], []
    i = 0
    while i < len(flat):
        same = up = 1
        while i + same < len(flat) and flat[i + same] == flat[i] and same < 127:
            same += 1
        while i + up < len(flat) and flat[i + up] == flat[i] + up and up < 127:
            up += 1
        runs += [flat[i], up | 0x80] if up > same else [flat[i], same]
        i += max(same, up)
    return palettes, runs, data, stream_data


def c_array(name, ctype, values, fmt="{}"):
    return f"const {ctype} {name}[] = {{{','.join(fmt.format(v) for v in values)}}};"


def ranges(text):
    return [tuple(int(x) for x in r.split("-")) for r in text.split(",")] if text else []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("set")
    parser.add_argument("title")
    parser.add_argument("--loop", default="0,0,0")
    parser.add_argument("--loop-bars", default="")
    parser.add_argument("--shaker-bars", default="")
    args = parser.parse_args()

    tempo, notes = read_notes(args.set)
    bars = -(-max(start + length for _, start, length, _ in notes) // STEPS)
    palettes, orders, data, streams = encode(notes, bars)
    print(f"{tempo} BPM, {bars} bars, {len(notes)} notes -> {len(data)} bytes of bars, {len(streams)} of streams", file=sys.stderr)

    # Which bars have the drum loop (bit 0) and the shaker (bit 1), two bits per bar.
    drums = [0] * bars
    for bit, spans in enumerate([ranges(args.loop_bars), ranges(args.shaker_bars)]):
        for first, last in spans:
            for bar in range(first, min(last, bars)):
                drums[bar] |= 1 << bit
    offsets = [0]
    for palette in palettes:
        offsets.append(offsets[-1] + len(palette))
    print("\n".join([
        f"// The MIDI arrangement of an Ableton Live set, converted by scripts/als2card.py: {bars} bars at {tempo:g} BPM.",
        '#include "deck.h"', "", f'card_title("{args.title}");', "",
        f"#define BARS {bars}", f"#define STEP_DUR {60 / tempo / 4:.6f}f", "",
        "// Each instrument's pitches, one after another (bass an octave down, as it sounds).",
        c_array("pitches", "char", [p - (12 if i == BASS else 0) for i, palette in enumerate(palettes) for p in palette]),
        c_array("pitch_offsets", "char", [o - 1 for o in offsets[:4]]),
        c_array("lengths", "char", LENGTHS),
        "// Which bar each of the three groups of instruments plays, as runs (see als2card.py).",
        c_array("order", "uint8_t", orders),
        "// The distinct bars, back to back. Each is a list of items ending in a zero byte: either a note",
        "// (instrument and pitch; start and length) or a pitch with a mask of the sixteenths it's hit on.",
        c_array("bars", "uint8_t", data),
        "// Notes that repeat at a steady interval: instrument and pitch; first step (11 bits) and interval - 1 (5 bits); count.",
        c_array("streams", "uint8_t", streams),
        c_array("drum_loop", "uint64_t", [int(x, 0) for x in args.loop.split(",")], "0x{:x}"),
        c_array("drum_bars", "uint8_t", [sum(drums[b + i] << 2 * i for i in range(4) if b + i < bars) for b in range(0, bars, 4)]),
        PLAYER]))


PLAYER = r"""
#define VOICES 12
enum { ORGAN, BASS, HORNS, LEAD };

// How each instrument differs: how bright its filtered saw is, how fast it speaks, how loud it is.
// (The organ is a plain triangle instead.)
const float brightness[] = {1, 0.07f, 0.12f, 0.35f}, attack[] = {250, 250, 20, 50}, level[] = {0.14f, 0.3f, 0.09f, 0.09f};

typedef struct {
    float freq, phase, t, dur, lp;
    int inst;
} voice_t;

voice_t voices[VOICES];
int next_voice, step = -1;
// Each drum's level falls from 1 (when it's hit) to 0.
float tick = STEP_DUR, drums[3], kick_phase;
unsigned int rng;

void play(int item, int steps) {
    voice_t *v = &voices[next_voice++ % VOICES];
    v->inst = item >> 5 & 3;
    v->freq = m2f(pitches[pitch_offsets[v->inst] + (item & 31)]);
    v->dur = steps * STEP_DUR;
    v->t = 0;
    // (Only in native debug builds: list the notes as they're played, to check against the set.)
    debug("%d %d %d %d\n", step, v->inst, pitches[pitch_offsets[v->inst] + (item & 31)], steps);
}

float process() {
    if (tick >= STEP_DUR) {
        tick -= STEP_DUR;
        step = (step + 1) % (BARS * 16);
        int bar = step / 16, pos = step % 16;
        for (int group = 0; group < 3; group++) {
            // Find this group's bar by skipping over the ones before it.
            // (Items that are hit masks take three bytes; plain notes take two.)
            const uint8_t *item = bars, *run = order;
            int skip = group * BARS + bar;
            for (; skip >= (run[1] & 127); run += 2) skip -= run[1] & 127;
            skip = *run + (run[1] >> 7 ? skip : 0);
            for (; skip; item += *item ? 2 + (*item >> 7) : 1) {
                if (!*item) skip--;
            }
            // Start whatever begins on this sixteenth.
            for (; *item; item += 2 + (*item >> 7)) {
                if (*item & 0x80) {
                    if ((item[1] | item[2] << 8) >> pos & 1) play(*item, 1);
                } else if (item[1] >> 4 == pos) {
                    play(*item, lengths[item[1] & 15]);
                }
            }
        }
        for (const uint8_t *s = streams; s < streams + sizeof(streams); s += 4) {
            int since = step - (s[1] | (s[2] & 7) << 8), every = (s[2] >> 3) + 1;
            if (since >= 0 && since % every == 0 && since / every < s[3]) play(*s, 1);
        }
        int on = drum_bars[bar / 4] >> bar % 4 * 2;
        for (int i = 0; i < 3; i++) {
            if (on & 1 && drum_loop[i] >> step % 64 & 1) drums[i] = 1;
        }
        // The shaker: every sixteenth, leaning on the eighths.
        if (on & 2 && drums[2] < 0.5f) drums[2] = pos % 2 ? 0.4f : 0.7f;
    }
    tick += dt;

    float out = 0;
    for (int i = 0; i < VOICES; i++) {
        voice_t *v = &voices[i];
        float x = saw(&v->phase, v->freq);
        x = v->inst ? lp1(&v->lp, x, brightness[v->inst]) : fabsf(x) * 2 - 1;
        // Fade in, hold for the note's length, then fade out quickly.
        float e = v->t * attack[v->inst], over = (v->dur - v->t) * 25;
        if (e > 1) e = 1;
        if (over < 1) e *= over;
        if (over > 0) out += x * e * level[v->inst];
        v->t += dt;
    }

    // Drums: a falling triangle for the kick, and noise bursts (a short one for the hat).
    // (A tiny random number generator of our own is smaller than the C library's.)
    rng = rng * 1664525 + 1013904223;
    float n = (int)rng * 4.656613e-10f, e = drums[0] * drums[0];
    out += (fabsf(saw(&kick_phase, 45 + 160 * e * e)) * 2 - 1) * e * 0.35f;
    out += n * (drums[1] * drums[1] * 0.12f + drums[2] * drums[2] * 0.06f);
    for (int i = 0; i < 3; i++) {
        // (They die away at different rates: kick, snare, hat.)
        drums[i] -= dt * (5 + i * i * 5);
        if (drums[i] < 0) drums[i] = 0;
    }
    return out;
}
"""

if __name__ == "__main__":
    main()
