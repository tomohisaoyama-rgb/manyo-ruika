import json,sys
from difflib import SequenceMatcher
P=json.load(open(sys.argv[1]))
def lcs(a,b):
    m=SequenceMatcher(None,a,b,autojunk=False).find_longest_match(0,len(a),0,len(b));return m.size
pairs=set()
for i,p in enumerate(P):
    for j,s in p['e'][:3]:
        if s>=0.15 and abs(P[j]['no']-p['no'])>5: pairs.add(tuple(sorted((i,j))))
hidden=[];tot=0
for i,j in pairs:
    a,b=P[i],P[j]; ks=lcs(a['kn'],b['kn']); ts=lcs(a['tx'],b['tx'])
    if ks>=7:
        tot+=1
        if ts<5: hidden.append((ks,ts,a['no'],b['no']))
hidden.sort(reverse=True)
out={"pairs":len(pairs),"strong":tot,"hidden":len(hidden),"examples":[[x[2],x[3]] for x in hidden[:12]]}
print(out)
for k,t,a,b in hidden[:12]: print(a,P[a-1]['tx'][:30],'||',b,P[b-1]['tx'][:30],k,t)
json.dump(out,open(sys.argv[2],'w'))
