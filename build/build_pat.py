import csv,collections,json
routes={r["route_id"]:r for r in csv.DictReader(open("gtfs/routes.txt")) if r["route_type"]=="2"}
stops={s["stop_id"]:s for s in csv.DictReader(open("gtfs/stops.txt"))}
trips=[t for t in csv.DictReader(open("gtfs/trips.txt")) if t["route_id"] in routes]
tid={t["trip_id"]:t for t in trips}
st=collections.defaultdict(list)
for r in csv.DictReader(open("gtfs/stop_times.txt")):
    if r["trip_id"] in tid: st[r["trip_id"]].append(r)
for k in st: st[k].sort(key=lambda r:int(r["stop_sequence"]))
def secs(t):
    h,m,s=[int(x) for x in t.split(":")]; return h*3600+m*60+s
def num(t):
    n=t["trip_short_name"]
    try: v=int(n)
    except: v=99999
    return v-1000 if 1000<v<2000 else v      # 1006 is a calendar variant of 6

cand=collections.defaultdict(list)
for t in trips:
    rows=st.get(t["trip_id"])
    if not rows or len(rows)<2: continue
    if any(r["stop_id"] not in stops for r in rows): rows=[r for r in rows if r["stop_id"] in stops]
    if len(rows)<2: continue
    cand[(t["route_id"],t["direction_id"])].append((t,rows))

out=[]
for (rid,d),lst in sorted(cand.items()):
    # cluster by terminal pair, keep the fullest trip in each cluster
    cl=collections.defaultdict(list)
    for t,rows in lst: cl[(rows[0]["stop_id"],rows[-1]["stop_id"])].append((t,rows))
    reps=[]
    for key,items in cl.items():
        items.sort(key=lambda x:(-len(x[1]), num(x[0]), int(x[0]["trip_short_name"]) if x[0]["trip_short_name"].isdigit() else 99999))
        reps.append(items[0])
    reps.sort(key=lambda x:-len(x[1]))
    keep=[reps[0]]
    primary=set(r["stop_id"] for r in reps[0][1])
    for t,rows in reps[1:]:
        s=set(r["stop_id"] for r in rows)
        if not s <= primary:                 # a genuine branch, not a short-turn subset
            keep.append((t,rows)); primary |= s
    for t,rows in keep:
        t0=secs(rows[0]["departure_time"])
        seq=[[r["stop_id"], round((secs(r["departure_time"])-t0)/60), round((secs(r["departure_time"])-secs(r["arrival_time"]))/60)] for r in rows]
        out.append({"rid":rid,"name":routes[rid]["route_long_name"],"dir":int(d),
                    "train":t["trip_short_name"],"head":t["trip_headsign"],"shape":t["shape_id"],
                    "dep":rows[0]["departure_time"][:5],"stops":seq})
print("itineraries:",len(out))
c=collections.Counter(p["name"] for p in out)
for n,k in c.most_common(8): print(f"  {n:<28}{k}")
used=sorted({x[0] for p in out for x in p["stops"]})
print("stops used:",len(used))
json.dump({"patterns":out,"used":used},open("routes_raw.json","w"))
