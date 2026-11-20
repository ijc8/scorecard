#!/usr/bin/env python3
"""Size pass: move 4-byte scalar variables from linear memory into wasm globals.

A constant-address load/store costs ~6 bytes (i32.const addr + load/store + align + offset); a
global.get/set costs 2. usage: globalize.py in.wat linker.map out.wat  (WAT as printed by wasm-dis)

Only .bss symbols of size 4 from the linker map are candidates, and one is converted only if every
appearance of its address in the module is as the direct address operand of a plain 4-byte
load/store (so anything whose address is taken, or that is touched by a wider/narrower access,
stays in memory). Variables that are read too rarely to pay for their global declaration stay too.
"""
import re, sys

def parse(src):
    toks = re.findall(r'"(?:\\.|[^"\\])*"|\(|\)|[^\s()]+', src)
    stack = [[]]
    for t in toks:
        if t == "(": stack.append([])
        elif t == ")":
            x = stack.pop(); stack[-1].append(x)
        else: stack[-1].append(t)
    return stack[0]

def dump(x, ind=0):
    if isinstance(x, str): return x
    flat = "(" + " ".join(dump(c) for c in x) + ")"
    if len(flat) < 100 or not any(isinstance(c, list) for c in x): return flat
    return "(" + dump(x[0]) + "".join(("\n" + " " * (ind + 1) + dump(c, ind + 1)) if isinstance(c, list) else " " + c for c in x[1:]) + ")"

ACCESS = re.compile(r"^(i32|f32|i64|f64)\.(load|store)(8|16|32)?(_[su])?$")

def info(node):
    """(type, kind, nbytes, address, operand index of the address) for a constant-address memory access."""
    if not (isinstance(node, list) and node and isinstance(node[0], str)): return None
    m = ACCESS.match(node[0])
    if not m: return None
    i, off = 1, 0
    while isinstance(node[i], str):
        if node[i].startswith("offset="): off = int(node[i][7:])
        i += 1
    ptr = node[i]
    if not (isinstance(ptr, list) and ptr[0] == "i32.const"): return None
    width = int(m.group(3)) // 8 if m.group(3) else int(m.group(1)[1:]) // 8
    return m.group(1), m.group(2), width, int(ptr[1]) + off, i

def main():
    wat, mapfile, out = sys.argv[1:4]
    cands = {}
    for line in open(mapfile):
        m = re.match(r"\s*([0-9a-f]+)\s+[0-9a-f]+\s+([0-9a-f]+)\s+\S+:\(\.bss\.(\S+)\)", line)
        if m and int(m.group(2), 16) == 4: cands[int(m.group(1), 16)] = m.group(3)
    tree = parse(open(wat).read())
    uses, bad = {}, set()

    def scan(node, parent_access=None):
        if not isinstance(node, list): return
        if node and node[0] == "i32.const" and parent_access is None:
            v = int(node[1])
            if v in cands: bad.add(v)  # address (or a coincidental equal integer) used as a value
            return
        inf = info(node)
        for idx, c in enumerate(node):
            scan(c, inf if inf and idx == inf[4] else None)
        if inf:
            ty, kind, width, addr, _ = inf
            for a in cands:
                if addr < a + 4 and a < addr + width:
                    if addr == a and width == 4 and ty in ("i32", "f32"): uses.setdefault(a, []).append(ty)
                    else: bad.add(a)
    scan(tree)

    chosen = {}
    for a, tys in uses.items():
        if a in bad: continue
        gty = "f32" if "f32" in tys else "i32"
        if len(tys) * 4 <= (8 if gty == "f32" else 5): continue  # declaration would cost more than it saves
        chosen[a] = gty

    def rewrite(node):
        if not isinstance(node, list): return node
        inf = info(node)
        node = [rewrite(c) for c in node]
        if inf and inf[3] in chosen and inf[2] == 4:
            ty, kind, _, addr, i = inf
            g, gty = "$g%d" % addr, chosen[addr]
            if kind == "load":
                r = ["global.get", g]
                return r if ty == gty else ["i32.reinterpret_f32", r]
            val = node[i + 1]
            return ["global.set", g, val if ty == gty else ["f32.reinterpret_i32", val]]
        return node
    module = rewrite(tree)[0]
    decls = [["global", "$g%d" % a, ["mut", t], [t + ".const", "0"]] for a, t in sorted(chosen.items())]
    pos = next(i for i, c in enumerate(module) if isinstance(c, list) and c[0] in ("memory", "data", "export", "func", "global"))
    module[pos:pos] = decls
    open(out, "w").write(dump(module) + "\n")
    print("globalize: %d variables moved to globals (%s); kept in memory: %s" % (
        len(chosen), " ".join(cands[a] for a in sorted(chosen)), " ".join(cands[a] for a in sorted(cands) if a not in chosen) or "none"), file=sys.stderr)

main()
