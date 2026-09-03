/* ================= California Zephyr → any Amtrak leg =================
   DATA is built from Amtrak's published GTFS feed; coverage is modelled
   (see the footer) rather than measured. Everything here runs offline. */
const NS="http://www.w3.org/2000/svg";
const el=(n,a)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);return e;};
const $=id=>document.getElementById(id);
const TZ=DATA.tz, ST=DATA.stops, ITS=DATA.its;
const CARRIER_NAME={verizon:"Verizon",att:"AT&T",tmobile:"T-Mobile"};
const PAL={dark:{good:"#43b98a",spotty:"#e6a93c",dead:"#e5544a"},light:{good:"#1f9e6e",spotty:"#bd7c11",dead:"#cf3b31"}};
const STAT={good:"Usable",spotty:"Spotty",dead:"No service"};
const LONG={g:"good",s:"spotty",d:"dead"};
/* The feed's names are inconsistent for a few big stations, and three Boston
   stops share one name; these are display fixes, not new data. */
const NAME_FIX={NYP:"New York Penn Station",BOS:"Boston South Station",BBY:"Boston Back Bay",
  BON:"Boston North Station",WAS:"Washington Union Station",PHL:"Philadelphia 30th Street",
  NHV:"New Haven Union Station",STS:"New Haven State Street"};
/* extra words people are likely to type */
const ALIAS={NYP:"nyc new york city penn moynihan",WAS:"dc washington",LAX:"los angeles la union",
  CHI:"chicago union",EMY:"emeryville san francisco bay",SFC:"san francisco",PDX:"portland oregon",
  POR:"portland maine",SEA:"seattle king street",NOL:"new orleans"};
/* the feed title-cases crudely: Mccook, Ny State Fair */
const tidy=n=>n.replace(/\bMc([a-z])/g,(m,x)=>"Mc"+x.toUpperCase()).replace(/^Ny /,"New York ");
const stationName=c=>NAME_FIX[c]||tidy(ST[c][0]);
const stopLabel=c=>stationName(c)+(ST[c][4]?", "+ST[c][4]:"")+" ("+c+")";
const searchKey=c=>(stationName(c)+" "+(ST[c][4]||"")+" "+c+" "+(ALIAS[c]||"")).toLowerCase();


/* ---------- time zones ---------- */
const _dtf={};
function tzOffset(tz,d){                    // true minutes east of UTC for that zone at that instant
  const f=_dtf[tz]||(_dtf[tz]=new Intl.DateTimeFormat("en-US",{timeZone:tz,hour12:false,
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}));
  const p={}; f.formatToParts(d).forEach(x=>p[x.type]=x.value);
  return Math.round((Date.UTC(+p.year,+p.month-1,+p.day,(+p.hour)%24,+p.minute,+p.second)-d.getTime())/60000);
}
function fmtLocal(d,tz){
  const p=new Intl.DateTimeFormat("en-US",{timeZone:tz,hour:"numeric",minute:"2-digit",weekday:"short",hour12:true}).formatToParts(d);
  const g=t=>(p.find(x=>x.type===t)||{}).value||"";
  return {time:(g("hour")+":"+g("minute")+(g("dayPeriod")==="AM"?"a":"p")).replace(/ /g,""),day:g("weekday")};
}
const AGENCY_TZ="America/New_York";
function agencyInstant(dateStr,minutes){        // an agency-local wall time on a given agency date
  const d=dateStr.split("-").map(Number);
  const off=Math.floor(minutes/1440), mm=((minutes%1440)+1440)%1440;
  const base=()=>Date.UTC(d[0],d[1]-1,d[2]+off,Math.floor(mm/60),mm%60);
  let g=base();
  for(let k=0;k<3;k++) g=base()-tzOffset(AGENCY_TZ,new Date(g))*60000;
  return new Date(g);
}
function ymdIn(d,tz){
  const p={}; new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"})
    .formatToParts(d).forEach(x=>p[x.type]=x.value);
  return p.year+"-"+p.month+"-"+p.day;
}
/* The date the user picks is the date they board, local to the origin station. */
function originInstant(dateStr,originMin,oTz){
  if(!dateStr) dateStr="2026-01-01";
  let inst=agencyInstant(dateStr,originMin);
  const got=ymdIn(inst,oTz);
  if(got!==dateStr){
    const diff=Math.round((Date.parse(got+"T12:00:00Z")-Date.parse(dateStr+"T12:00:00Z"))/86400000);
    if(diff){
      const d=dateStr.split("-").map(Number);
      const shifted=new Date(Date.UTC(d[0],d[1]-1,d[2]-diff));
      inst=agencyInstant(shifted.toISOString().slice(0,10),originMin);
    }
  }
  return inst;
}
const ZAB={"America/Los_Angeles":"PT","America/Denver":"MT","America/Chicago":"CT","America/New_York":"ET"};

/* ---------- geo helpers ---------- */
function hav(a,b,c,d){const p=Math.PI/180;
  return 12742*Math.asin(Math.sqrt(Math.max(0,0.5-Math.cos((c-a)*p)/2+Math.cos(a*p)*Math.cos(c*p)*(1-Math.cos((d-b)*p))/2)));}
/* Distance from a point to a track segment, not just to its endpoints: the
   polyline is simplified hardest where the country is flattest, so vertices
   alone can be tens of km from a feature the train runs straight past. */
function distToSeg(plat,plng,alat,alng,blat,blng){
  const k=Math.cos(plat*Math.PI/180);
  const ax=(alng-plng)*k, ay=alat-plat, bx=(blng-plng)*k, by=blat-plat;
  const dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy;
  let t=L?-(ax*dx+ay*dy)/L:0; t=Math.max(0,Math.min(1,t));
  return Math.hypot(ax+dx*t,ay+dy*t)*111.32;
}
function bearing(a,b,c,d){const p=Math.PI/180,y=Math.sin((d-b)*p)*Math.cos(c*p),
  x=Math.cos(a*p)*Math.sin(c*p)-Math.sin(a*p)*Math.cos(c*p)*Math.cos((d-b)*p);
  return (Math.atan2(y,x)/p+360)%360;}
/* solar altitude in degrees — drives the darkness bands, no lookup tables */
function sunAlt(date,lat,lng){
  const rad=Math.PI/180, n=date.getTime()/86400000+2440587.5-2451545.0;
  const L=(280.460+0.9856474*n)%360, g=((357.528+0.9856003*n)%360)*rad;
  const lam=(L+1.915*Math.sin(g)+0.020*Math.sin(2*g))*rad, eps=(23.439-0.0000004*n)*rad;
  const dec=Math.asin(Math.sin(eps)*Math.sin(lam));
  const ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam));
  const gmst=(18.697374558+24.06570982441908*n)%24;
  const H=((gmst*15+lng)*rad)-ra;
  return Math.asin(Math.sin(lat*rad)*Math.sin(dec)+Math.cos(lat*rad)*Math.cos(dec)*Math.cos(H))/rad;
}

/* ---------- scenery: geographic, so any route passing near picks it up ---------- */
const SIGHTS=[
 {lat:39.10,lng:-120.90,r:18,dir:"S",n:"Cape Horn & American River Canyon",
  d:"The line clings to a cliff ~1,200 ft above the North Fork American River. Look down into the gorge as you round the point."},
 {lat:39.32,lng:-120.24,r:16,dir:"N",n:"Donner Lake & Donner Pass",
  d:"A bird's-eye drop to the lake from Schallenberger Ridge at 7,000 ft, past snowsheds and tunnels of the first transcontinental railroad."},
 {lat:39.42,lng:-120.02,r:16,dir:"BOTH",n:"Truckee River Canyon",
  d:"The tracks trace the Truckee River down toward Reno; watch for rafters and anglers in summer."},
 {lat:39.15,lng:-109.70,r:30,dir:"N",n:"Book Cliffs",
  d:"A ~200-mile wall of desert cliffs runs along the northern horizon between Green River and Grand Junction."},
 {lat:39.13,lng:-108.95,r:20,dir:"S",n:"Ruby Canyon",
  d:"A red-rock gorge on the Colorado River with no road access, reachable only by rail or raft. It straddles the Utah–Colorado line."},
 {lat:39.55,lng:-107.10,r:22,dir:"BOTH",n:"Glenwood Canyon",
  d:"The Colorado River threads a narrow limestone canyon beside I-70. River on the canyon side."},
 {lat:39.95,lng:-106.55,r:20,dir:"BOTH",n:"Gore Canyon",
  d:"Whitewater rapids and sheer walls with no road alongside, rail or raft only."},
 {lat:40.05,lng:-106.05,r:18,dir:"BOTH",n:"Byers & Fraser Canyons",
  d:"The Fraser River through remote canyons, climbing toward Winter Park ski country."},
 {lat:39.90,lng:-105.64,r:16,dir:"TUNNEL",n:"Moffat Tunnel",
  d:"6.2 miles in darkness beneath the Continental Divide at 9,239 ft, the highest point on the route."},
 {lat:39.80,lng:-105.35,r:18,dir:"E",n:"Front Range descent into Denver",
  d:"Coming off the foothills, the Great Plains and the Denver skyline open out below; the horseshoe curves show both sides."},
 {lat:40.81,lng:-91.11,r:12,dir:"BOTH",n:"Mississippi River at Burlington",
  d:"Cross the Mississippi on the long bridge at the Iowa–Illinois state line."},
 {lat:37.90,lng:-81.05,r:28,dir:"BOTH",n:"New River Gorge",
  d:"The line follows the New River through a deep Appalachian gorge for most of a morning, with no road on the far bank for long stretches."},
 {lat:41.25,lng:-122.28,r:32,dir:"E",n:"Mount Shasta",
  d:"A 14,179 ft volcano stands alone above the treeline as the track climbs the Sacramento River canyon toward Dunsmuir."},
 {lat:35.35,lng:-120.64,r:16,dir:"BOTH",n:"Cuesta Grade",
  d:"Horseshoe curves and tunnels lift the line out of San Luis Obispo; the train doubles back on itself, so both sides get the view."},
 {lat:45.70,lng:-121.50,r:32,dir:"S",n:"Columbia River Gorge",
  d:"The track runs the north bank of the Columbia beneath basalt cliffs, with waterfalls on the Oregon side across the water."},
 {lat:47.95,lng:-122.31,r:26,dir:"W",n:"Puget Sound shoreline",
  d:"North of Seattle the line runs at the water's edge below the bluffs, with the Olympics across the Sound."},
 {lat:39.325,lng:-77.73,r:9,dir:"BOTH",n:"Harpers Ferry",
  d:"The train crosses the Potomac on a bridge at the confluence with the Shenandoah, right through the old town."},
 {lat:29.70,lng:-91.30,r:26,dir:"BOTH",n:"Atchafalaya Basin",
  d:"Miles of elevated track across open swamp and cypress, the largest wetland in the country."},
 {lat:48.32,lng:-113.36,r:30,dir:"N",n:"Marias Pass & Glacier National Park",
  d:"The railroad crosses the Continental Divide at 5,213 ft along the southern edge of Glacier National Park."},
 {lat:47.75,lng:-120.95,r:12,dir:"TUNNEL",n:"Cascade Tunnel",
  d:"7.8 miles under Stevens Pass, the longest railroad tunnel in the United States."},
 {lat:34.55,lng:-120.50,r:30,dir:"W",n:"Gaviota & Vandenberg coast",
  d:"Miles of open Pacific shoreline with no road access, reachable only by this train."},
 {lat:41.40,lng:-73.97,r:22,dir:"W",n:"Hudson River",
  d:"The line runs along the water's edge below the Hudson Highlands, with West Point across the river."},
 {lat:40.498,lng:-78.484,r:8,dir:"BOTH",n:"Horseshoe Curve",
  d:"The track bends through 220 degrees against the Allegheny hillside to gain height; you can see the rest of your own train."},
 {lat:36.99,lng:-104.48,r:20,dir:"BOTH",n:"Raton Pass",
  d:"A 7,588 ft crossing of the Colorado–New Mexico line, the steepest main-line grade Amtrak runs."},
 {lat:44.50,lng:-73.38,r:25,dir:"W",n:"Lake Champlain",
  d:"The train runs along the lake shore with the Adirondacks rising on the far side."},
];
const CARD={N:"north",NE:"northeast",E:"east",SE:"southeast",S:"south",SW:"southwest",W:"west",NW:"northwest"};
const DIRV={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};

/* ---------- state ---------- */
let theme=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark";
let carrier="verizon";
let IT=null, O=0, E=0, LEG=null, DELAY=0;

/* ---------- build the leg the user picked ---------- */
function buildLeg(){
  const stops=IT.s, o=O, e=E;
  const oTz=TZ[ST[stops[o][0]][3]];
  /* GTFS stop_times are in the agency's zone (Eastern for Amtrak), not the stop's.
     Elapsed time is therefore the raw difference; only the displayed clock changes zone. */
  const depHM=IT.dep.split(":").map(Number);
  const originMin=depHM[0]*60+depHM[1]+stops[o][1];
  const inst=originInstant($("depDate").value,originMin,oTz);
  const L={stops:[],poly:[],polyT:[],cov:[],dep:inst,TOTAL:0};
  for(let i=o;i<=e;i++){
    const c=stops[i][0], s=ST[c];
    const t=(stops[i][1]-stops[o][1])/60;
    L.stops.push({code:c,name:stationName(c),lat:s[1],lng:s[2],tz:TZ[s[3]],t:t,
                  inst:new Date(inst.getTime()+t*3600000)});
  }
  L.TOTAL=L.stops[L.stops.length-1].t;
  /* polyline slice, with elapsed time distributed along track distance */
  const a=IT.i[o], b=IT.i[e];
  L.poly=IT.p.slice(a,b+1).map(q=>[q[0],q[1]]);
  L.polyT=new Array(L.poly.length).fill(0);
  for(let i=o;i<e;i++){
    const s0=IT.i[i]-a, s1=IT.i[i+1]-a, t0=L.stops[i-o].t, t1=L.stops[i-o+1].t;
    let cum=0; const dd=[0];
    for(let j=s0;j<s1;j++){cum+=hav(L.poly[j][0],L.poly[j][1],L.poly[j+1][0],L.poly[j+1][1]);dd.push(cum);}
    for(let j=s0;j<=s1;j++) L.polyT[j]=t0+(t1-t0)*(cum?dd[j-s0]/cum:(j-s0)/Math.max(1,s1-s0));
  }
  /* coverage sub-segments, each with a time span */
  const cv=IT.cv[carrier]; let base=0;
  for(let i=0;i<o;i++) base+=IT.sn[i];
  for(let i=o;i<e;i++){
    const n=IT.sn[i], t0=L.stops[i-o].t, t1=L.stops[i-o+1].t;
    for(let k=0;k<n;k++)
      L.cov.push({t0:t0+(t1-t0)*k/n, t1:t0+(t1-t0)*(k+1)/n, st:LONG[cv[base+k]]});
    base+=n;
  }
  if(!L.cov.length) L.cov.push({t0:0,t1:Math.max(L.TOTAL,0.01),st:"good"});
  /* darkness + meals, sampled on the real local clock and real sun angle */
  L.night=[]; L.meals=[];
  const STEP=Math.max(2/60,L.TOTAL/900);
  let curN=null, curM=null;
  const MEALS=[[6.5,9.5,"Breakfast"],[11.5,14.5,"Lunch"],[17,21,"Dinner"]];
  const dining=L.TOTAL>=10;
  for(let t=0;t<=L.TOTAL+1e-9;t+=STEP){
    const pos=posAt(t,L), inst2=new Date(inst.getTime()+t*3600000);
    const dark=sunAlt(inst2,pos.lat,pos.lng)<-6;
    if(dark&&!curN) curN={a:t}; else if(!dark&&curN){curN.b=t;L.night.push(curN);curN=null;}
    if(dining){
      const tz=nearestStop(t,L).tz, o2=tzOffset(tz,inst2);
      const loc=((inst2.getTime()/60000+o2)%1440+1440)%1440/60;
      const m=MEALS.find(M=>loc>=M[0]&&loc<M[1]);
      if(m&&(!curM||curM.name!==m[2])){ if(curM){curM.b=t;L.meals.push(curM);} curM={a:t,name:m[2]}; }
      else if(!m&&curM){curM.b=t;L.meals.push(curM);curM=null;}
    }
  }
  if(curN){curN.b=L.TOTAL;L.night.push(curN);}
  if(curM){curM.b=L.TOTAL;L.meals.push(curM);}
  L.night=L.night.filter(n=>n.b-n.a>0.2);
  /* a window the leg only clips the tail of is not a meal you can plan on */
  const FULL={Breakfast:3,Lunch:3,Dinner:4};
  L.meals=L.meals.filter(m=>(m.b-m.a)>=Math.min(1.5,FULL[m.name]*0.5));
  L.dining=dining;
  /* scenery on this leg, with the side computed from the direction of travel */
  L.sights=[];
  SIGHTS.forEach(s=>{
    let bi=-1,bd=1e9;
    for(let j=0;j<L.poly.length-1;j++){
      const d=distToSeg(s.lat,s.lng,L.poly[j][0],L.poly[j][1],L.poly[j+1][0],L.poly[j+1][1]);
      if(d<bd){bd=d;bi=j;}
    }
    if(L.poly.length===1){bd=hav(s.lat,s.lng,L.poly[0][0],L.poly[0][1]);bi=0;}
    if(bi<0||bd>s.r) return;
    const j2=Math.min(L.poly.length-1,bi+1), j1=Math.max(0,bi-1);
    const head=bearing(L.poly[j1][0],L.poly[j1][1],L.poly[j2][0],L.poly[j2][1]);
    let side="Both";
    if(s.dir==="TUNNEL") side="Tunnel";
    else if(s.dir!=="BOTH"&&DIRV[s.dir]!==undefined){
      const rel=((DIRV[s.dir]-head)%360+360)%360; side=rel<180?"Right":"Left";
    }
    L.sights.push(Object.assign({},s,{t:L.polyT[bi],side:side}));
  });
  L.sights.sort((x,y)=>x.t-y.t);
  L.km=0; for(let i=o;i<e;i++) L.km+=IT.kl[i];
  return L;
}
/* adjacent sub-segments of the same status, merged — the fine grid is for lookups,
   the runs are what gets drawn */
function covRuns(){
  const out=[];
  LEG.cov.forEach(s=>{
    const last=out[out.length-1];
    if(last&&last.st===s.st) last.t1=s.t1; else out.push({t0:s.t0,t1:s.t1,st:s.st});
  });
  return out;
}
function posAt(t,L){
  L=L||LEG; const P=L.poly,T=L.polyT;
  if(t<=T[0])return {lat:P[0][0],lng:P[0][1],i:0};
  for(let i=0;i<P.length-1;i++) if(t<=T[i+1]){
    const f=(t-T[i])/((T[i+1]-T[i])||1);
    return {lat:P[i][0]+(P[i+1][0]-P[i][0])*f,lng:P[i][1]+(P[i+1][1]-P[i][1])*f,i:i};
  }
  const n=P.length-1; return {lat:P[n][0],lng:P[n][1],i:n};
}
function nearestStop(t,L){L=L||LEG; let b=L.stops[0];
  for(const s of L.stops){ if(s.t<=t+1e-9) b=s; } return b;}
function stopIndexAt(t){let i=0; for(let k=0;k<LEG.stops.length;k++) if(LEG.stops[k].t<=t+1e-9) i=k; return i;}
function covAt(t){const c=LEG.cov; for(const s of c) if(t<s.t1) return s.st; return c[c.length-1].st;}
function covRun(t){const c=LEG.cov; let i=c.findIndex(s=>t<s.t1); if(i<0)i=c.length-1;
  const st=c[i].st; let a=i,b=i;
  while(a>0&&c[a-1].st===st)a--; while(b<c.length-1&&c[b+1].st===st)b++;
  return {st:st,t0:c[a].t0,t1:c[b].t1};}
function nextRunOf(t,want){const c=LEG.cov; let i=c.findIndex(s=>t<s.t1); if(i<0)return null;
  for(let j=i+1;j<c.length;j++) if(c[j].st===want&&c[j-1].st!==want){const r=covRun(c[j].t0+1e-6);return {t:c[j].t0,len:r.t1-r.t0,end:r.t1};}
  return null;}
