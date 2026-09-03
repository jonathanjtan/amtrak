import json,math,csv,re,collections
geo=json.load(open("geo_raw.json"))
GRID={}
for lat,lng,pop,nm in geo["cities"]: GRID.setdefault((int(lat),int(lng)),[]).append((lat,lng,pop))
def hav(a,b,c,d):
    p=math.pi/180
    return 12742*math.asin(math.sqrt(max(0,0.5-math.cos((c-a)*p)/2+math.cos(a*p)*math.cos(c*p)*(1-math.cos((d-b)*p))/2)))
sh=[]
for r in csv.DictReader(open("gtfs/shapes.txt")):
    if r["shape_id"]=="174": sh.append((int(r["shape_pt_sequence"]),float(r["shape_pt_lat"]),float(r["shape_pt_lon"])))
pts=[(a,b) for _,a,b in sorted(sh)]
import subprocess
# the hand-authored coverage this model is fitted against lives in git history
src=subprocess.run(["git","-C","/Users/jtan/Workspace/amtrak","show","1be12e7:index.html"],
                   capture_output=True,text=True).stdout
orig=re.findall(r'\{c:"(\w+)",lng:(-?[\d.]+),lat:([\d.]+)',src)
m=re.search(r'const covByCarrier=\{(.*?)\n\};',src,re.S).group(1)
hand={k:[x.strip().strip('"') for x in re.search(k+r':\s*\[(.*?)\]',m,re.S).group(1).split(",") if x.strip()] for k in ("verizon","att","tmobile")}
idx=[min(range(len(pts)),key=lambda i:hav(float(a[2]),float(a[1]),pts[i][0],pts[i][1])) for a in orig]
feat=[]
for i in range(len(orig)-1):
    seg=pts[idx[i]:idx[i+1]+1]
    path=sum(hav(seg[j][0],seg[j][1],seg[j+1][0],seg[j+1][1]) for j in range(len(seg)-1)) or 1
    turn=0
    for j in range(1,len(seg)-1):
        h1=math.atan2(seg[j][1]-seg[j-1][1],seg[j][0]-seg[j-1][0]); h2=math.atan2(seg[j+1][1]-seg[j][1],seg[j+1][0]-seg[j][0])
        dh=abs(math.degrees(h2-h1)); turn+=min(dh,360-dh)
    mlat,mlng=seg[len(seg)//2]
    near=[];dens=0.0
    for gi in range(int(mlat)-3,int(mlat)+4):
        for gj in range(int(mlng)-3,int(mlng)+4):
            for clat,clng,pop in GRID.get((gi,gj),()):
                d=hav(mlat,mlng,clat,clng); near.append((d,pop))
                if d<=75: dens+=pop
    near.sort(); feat.append((near[:60],turn/path,dens))
M={"good":"g","spotty":"s","dead":"d"}
best=None
for A in (11,14,18,22):
 for B in (0.35,0.40,0.45):
  for C in (0.0,0.08,0.15,0.25,0.4):
   for D in (3.5,4.0,4.5,5.0):
    raw=[max((A*(p/5000.0)**B)/max(d,2.0) for d,p in n)+C*max(0.0,math.log10(1+dn)-D) for n,t,dn in feat]
    for K in (25,35,45):
     for S in (15,25,40):
      st=[raw[i]/(1+max(0.0,feat[i][1]-K)/S) for i in range(len(raw))]
      for Tg in (0.6,0.8,1.0,1.2):
       for Ts in (0.3,0.4,0.5,0.65):
        if Ts>=Tg: continue
        for fv in (1.0,1.15,1.3):
         for fa in (0.85,1.0):
          for ft in (0.5,0.6,0.7):
           ok=0
           for k,f in (("verizon",fv),("att",fa),("tmobile",ft)):
            for i,s in enumerate(st):
             v=s*f; ok+= ("g" if v>=Tg else ("s" if v>=Ts else "d"))==M[hand[k][i]]
           if best is None or ok>best[0]: best=(ok,A,B,C,D,K,S,Tg,Ts,fv,fa,ft)
ok,A,B,C,D,K,S,Tg,Ts,fv,fa,ft=best
print(f"best {ok}/99 = {100*ok/99:.0f}%  A={A} B={B} C={C} D={D} K={K} S={S} Tg={Tg} Ts={Ts} v={fv} a={fa} t={ft}")
raw=[max((A*(p/5000.0)**B)/max(d,2.0) for d,p in n)+C*max(0.0,math.log10(1+dn)-D) for n,t,dn in feat]
st=[raw[i]/(1+max(0.0,feat[i][1]-K)/S) for i in range(len(raw))]
conf={}
for k,f in (("verizon",fv),("att",fa),("tmobile",ft)):
    for i,s in enumerate(st):
        v=s*f; conf[(M[hand[k][i]],"g" if v>=Tg else ("s" if v>=Ts else "d"))]=conf.get((M[hand[k][i]],"g" if v>=Tg else ("s" if v>=Ts else "d")),0)+1
for a in "gsd": print("  ",a,{p:conf.get((a,p),0) for p in "gsd"})
json.dump({"A":A,"B":B,"C":C,"D":D,"K":K,"S":S,"Tg":Tg,"Ts":Ts,"f":{"verizon":fv,"att":fa,"tmobile":ft}},open("cov_params.json","w"))
