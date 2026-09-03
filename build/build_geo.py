import json,math
# ---------- states: decode topojson, simplify, emit lat/lng rings ----------
d=json.load(open("states-10m.json"))
sx,sy=d["transform"]["scale"]; tx,ty=d["transform"]["translate"]
def arc(i):
    rev=i<0
    if rev: i=~i
    x=y=0; pts=[]
    for dx,dy in d["arcs"][i]:
        x+=dx; y+=dy; pts.append((x*sx+tx, y*sy+ty))
    return pts[::-1] if rev else pts
def rings(geom):
    out=[]
    if geom["type"]=="Polygon": polys=[geom["arcs"]]
    elif geom["type"]=="MultiPolygon": polys=geom["arcs"]
    else: return out
    for poly in polys:
        for ring in poly:
            pts=[]
            for i in ring:
                seg=arc(i)
                pts.extend(seg[1:] if pts else seg)
            out.append(pts)
    return out
def rdp_ring(pts,eps):
    """RDP on a closed ring: split at the point farthest from pts[0] first,
    otherwise the coincident endpoints make every perpendicular distance zero."""
    if len(pts)<5: return pts
    if pts[0]==pts[-1]: pts=pts[:-1]
    x0,y0=pts[0]
    k=max(range(1,len(pts)),key=lambda i:(pts[i][0]-x0)**2+(pts[i][1]-y0)**2)
    a=rdp(pts[:k+1],eps); b=rdp(pts[k:]+[pts[0]],eps)
    return a[:-1]+b
def rdp(pts,eps):
    if len(pts)<3: return pts
    dmax=0; idx=0
    (x1,y1),(x2,y2)=pts[0],pts[-1]
    for i in range(1,len(pts)-1):
        x0,y0=pts[i]
        num=abs((y2-y1)*x0-(x2-x1)*y0+x2*y1-y2*x1)
        den=math.hypot(y2-y1,x2-x1) or 1e-12
        dd=num/den
        if dd>dmax: dmax,idx=dd,i
    if dmax>eps:
        return rdp(pts[:idx+1],eps)[:-1]+rdp(pts[idx:],eps)
    return [pts[0],pts[-1]]
SKIP={"02","15","60","66","69","72","78"}   # AK, HI, territories
states=[];labels=[]
for g in d["objects"]["states"]["geometries"]:
    fid=g.get("id","")
    if fid in SKIP: continue
    nm=g["properties"]["name"]
    rs=[]
    for r in rings(g):
        if len(r)<4: continue
        # drop tiny islands
        xs=[p[0] for p in r]; ys=[p[1] for p in r]
        if (max(xs)-min(xs))<0.25 and (max(ys)-min(ys))<0.25: continue
        s=rdp_ring(r,0.035)
        if len(s)>=4: rs.append([[round(x,3),round(y,3)] for x,y in s])
    if not rs: continue
    states.append({"n":nm,"r":rs})
    big=max(rs,key=len)
    labels.append({"n":nm,"lng":round(sum(p[0] for p in big)/len(big),3),
                   "lat":round(sum(p[1] for p in big)/len(big),3)})
pts=sum(len(r) for s in states for r in s["r"])
print("states:",len(states),"rings:",sum(len(s['r']) for s in states),"points:",pts)

# ---------- cities: US + Canada, pop >= 5000 ----------
cities=[]
for line in open("cities5000.txt",encoding="utf-8"):
    f=line.rstrip("\n").split("\t")
    if len(f)<15 or f[8] not in ("US","CA"): continue
    try: pop=int(f[14]); lat=float(f[4]); lng=float(f[5])
    except: continue
    if pop<5000 or lng<-130 or lng>-64 or lat<24 or lat>54: continue
    cities.append((round(lat,3),round(lng,3),pop,f[1]))
cities.sort(key=lambda c:-c[2])
print("cities:",len(cities),"top:",cities[0][3],cities[0][2])
json.dump({"states":states,"labels":labels,"cities":cities},open("geo_raw.json","w"))
