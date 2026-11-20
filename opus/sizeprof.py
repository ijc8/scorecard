import subprocess,re,sys
src=open(sys.argv[1]).read()
def size(s):
    open('_t.c','w').write(s)
    out=subprocess.run(['./build.sh','_t.c'],capture_output=True,text=True)
    m=re.findall(r'_t.wasm: (\d+)',out.stdout)
    return int(m[0]) if m else None
base=size(src); print('base',base)
def cut(name,a,b,repl=''):
    i=src.index(a); j=src.index(b,i)
    print(f'{name:12s}', base-(size(src[:i]+repl+src[j:]) or 0))
cut('tick','static void tick(void) {','// ---- effects','static void tick(void){}\n')
cut('delay','    // dotted-eighth','    // reverb')
cut('reverb','    // reverb','    return sat')
cut('voiceloop','    for (Voice *o','    // dotted-eighth')
cut('newsong-body','    int m = 0x5','    bar = -1;')
cut('s-decode','    for (int i = 0; i < 7; i++)\n        for','    rs = seed')
cut('chords','        int c = prog[sec & 1][bar & 3];\n        for','    fill =','    }\n')
cut('lead','    if (parts & 32','    if (parts & 64)')
cut('arp','    if (parts & 64)','}\n\n// ---- effects','')
cut('bass','    if (parts & 16','    if (parts & 32')
cut('drums','    if (parts & 2','    int c = prog')
