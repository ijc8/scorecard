import sys
b=open(sys.argv[1],'rb').read(); i=8
def leb(i):
    r=s=0
    while True:
        x=b[i]; i+=1; r|=(x&127)<<s; s+=7
        if x<128: return r,i
names={0:'custom',1:'type',2:'import',3:'func',4:'table',5:'memory',6:'global',7:'export',8:'start',9:'elem',10:'code',11:'data',12:'datacount'}
while i<len(b):
    sid=b[i]; n,j=leb(i+1); print(f'{names[sid]:10s} {n+j-i:5d}'); i=j+n
# per-function body sizes
i=8
while i<len(b):
    sid=b[i]; n,j=leb(i+1)
    if sid==10:
        cnt,k=leb(j)
        for f in range(cnt):
            sz,k2=leb(k); print(f'  func {f}: {sz}'); k=k2+sz
    i=j+n
