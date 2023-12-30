# interactive session to convert https://github.com/teropa/in-c/blob/master/src/score.json
import json

d = json.load(open("in-c.json"))

[x["number"] for x in d] == list(range(1,54))

import music21 as m21

m21.pitch.Pitch("C4").ps

# duration = 0 -> gracenote = true

for f in d:
    for n in f["score"]:
        if "gracenote" in n:
            del n["gracenote"]

for f in d:
    for n in f["score"]:
        if "note" in n:
            n["pitch"] = int(m21.pitch.Pitch(n["note"]).ps)
        else:
            n["pitch"] = 0 # rest

for f in d:
    for n in f["score"]:
        if "note" in n:
            del n["note"]

e = [f["score"] for f in d]

for f in e:
    for n in f:
        if "velocity" in n:
            n["velocity"] = {"low": 1, "medium": 2, "high": 3}[n["velocity"]]
        else:
            n["velocity"] = 0 # rest

all(n["duration"]*2 == int(n["duration"]*2) for f in e for n in f)

for f in e:
    for n in f:
        n["duration"] = int(n["duration"]*2)

for f in e:
    for n in f:
        m = n.copy()
        for k in ["pitch", "velocity", "duration"]:
            del n[k]
            n[k] = m[k]

e[0]

e[6]

for f in e:
    rest_dur = 0
    new_f = []
    for n in f:
        if n["pitch"] == 0:
            rest_dur += n["duration"]
        else:
            if rest_dur:
                new_f.append({"pitch": 0, "velocity": 0, "duration": rest_dur})
                rest_dur = 0
            new_f.append(n)
    if rest_dur:
        new_f.append({"pitch": 0, "velocity": 0, "duration": rest_dur})
        rest_dur = 0
    f[:] = new_f

e[6]

def print_def():
    print("note_t score[] = {")
    for i, f in enumerate(e):
        print(f"    // Fragment {i + 1}")
        for n in f:
            if n["pitch"]:
                print(f"    {{.pitch = {n['pitch']}, .velocity = {n['velocity']}, .duration = {n['duration']}}},")
            else:
                print(f"    {{.duration = {n['duration']}}},")
    print("};\n")
    print("int fragments[53][2] = {")
    i = 0
    for f in e:
        print(f"    {{{i}, {i + len(f)}}},")
        i += len(f)
    print("};")

print_def()
