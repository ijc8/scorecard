#!/usr/bin/env python3
"""Ask an audio-capable model (via OpenRouter, ZDR) to critique a rendered card.
usage: listen.py file.wav [prompt] [model]. Only send our own synthesized renders."""
import base64, json, subprocess, sys, tempfile, os
wav = sys.argv[1]
prompt = sys.argv[2] if len(sys.argv) > 2 else (
    "You are a strict, experienced music producer. This is a generative piece made by a ~3 KB program. "
    "Listen and critique it honestly: timeline of what happens, mix balance (which parts are too loud/quiet/harsh/muddy), "
    "sound design of each instrument, harmony/melody quality, groove, any clicks/glitches/artifacts, and the 5 most "
    "impactful concrete fixes. Rate 1-10 overall vs. good human-made electronic music.")
model = sys.argv[3] if len(sys.argv) > 3 else "google/gemini-4-carbon"
mp3 = tempfile.mktemp(suffix=".mp3")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-b:a", "128k", mp3], check=True)
data = base64.b64encode(open(mp3, "rb").read()).decode(); os.unlink(mp3)
key = subprocess.run(["pass", "show", "OpenRouter-API-Key"], capture_output=True, text=True, check=True).stdout.split("\n")[0].strip()
body = {"model": model, "provider": {"data_collection": "deny", "zdr": True},
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt},
                      {"type": "input_audio", "input_audio": {"data": data, "format": "mp3"}}]}]}
tf = tempfile.mktemp(suffix=".json"); open(tf, "w").write(json.dumps(body))
r = subprocess.run(["curl", "-sS", "https://openrouter.ai/api/v1/chat/completions", "-H", f"Authorization: Bearer {key}",
                    "-H", "Content-Type: application/json", "--data-binary", "@" + tf], capture_output=True, text=True)
os.unlink(tf)
resp = json.loads(r.stdout)
if "error" in resp: sys.exit(f"error: {resp['error']}")
print(resp["choices"][0]["message"]["content"])
print(f"\n[{model} cost={resp.get('usage', {}).get('cost')}]", file=sys.stderr)
