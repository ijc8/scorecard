# Collects the built library cards into the JSON index that the player's Library tab reads.
# Usage: python3 index.py > ../../src/library.json  (normally run by build.sh)
import json
import re
import sys
from pathlib import Path

here = Path(__file__).parent
sys.path.insert(0, str(here.parent.parent))
import base43

MAX_SIZE = 2900  # roughly what fits in a QR code after URL encoding

cards = []
for source in sorted(here.glob("*.c")):
    text = source.read_text()
    binary = source.with_suffix(".wasm").read_bytes()
    if len(binary) > MAX_SIZE:
        sys.exit(f"{source.name}: {len(binary)} bytes is too big for a card")
    cards.append({
        "title": re.search(r'card_title\("(.*)"\)', text).group(1),
        # By convention, the first line of each card is a comment describing it.
        "description": text.splitlines()[0].removeprefix("//").strip(),
        "source": source.name,
        "size": len(binary),
        "code": base43.encode(binary).decode(),
    })

cards.sort(key=lambda card: card["title"])
json.dump(cards, sys.stdout, indent=2)
print()
