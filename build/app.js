/* ================= station-first picker =================
   You name two stations; the page finds the services that run between them,
   in that order, and picks the quickest. The route select then only offers
   services that actually serve both. */
const routeSel=$("routeSel"),origIn=$("origIn"),destIn=$("destIn"),pkMsg=$("pkMsg"),
      liveOn=$("liveOn"),depDate=$("depDate"),scrub=$("scrub"),scrubRow=$("scrubRow"),
      scrubVal=$("scrubVal"),liveStatus=$("liveStatus"),delayEl=$("delay");
let fromCode=null,toCode=null;
(function fillStopList(){
  const dl=$("allStops"), seen=new Set();
  ITS.forEach(it=>it.s.forEach(s=>seen.add(s[0])));
  [...seen].map(c=>[stopLabel(c),c]).sort().forEach(([lab])=>{
    const o=document.createElement("option");o.value=lab;dl.appendChild(o);
  });
})();
const SERVED=(()=>{const m={};ITS.forEach(it=>it.s.forEach(s=>{m[s[0]]=(m[s[0]]||0)+1;}));return m;})();
function codeFromInput(v){
  if(!v) return null;
  v=v.trim(); if(!v) return null;
  const m=v.match(/\(([A-Z]{3})\)\s*$/);
  if(m&&ST[m[1]]) return m[1];
  const up=v.toUpperCase();
  if(ST[up]&&up.length===3) return up;
  const q=v.toLowerCase().replace(/[.,]/g," ").split(/\s+/).filter(Boolean);
  let best=null,bestScore=-1;
  for(const c in ST){
    if(!SERVED[c]) continue;
    const key=searchKey(c);
    if(!q.every(t=>key.indexOf(t)>=0)) continue;
    /* prefer an exact name, then a prefix, then whichever station more trains serve */
    const nm=stationName(c).toLowerCase();
    let score=SERVED[c];
    if(nm===v.toLowerCase()) score+=1e6;
    else if(nm.startsWith(q[0])) score+=1e3;
    if(score>bestScore){bestScore=score;best=c;}
  }
  return best;
}
/* every service running from a to b in that order, quickest first */
function servicesFor(a,b){
  const out=[];
  ITS.forEach((it,i)=>{
    const codes=it.s.map(x=>x[0]), ia=codes.indexOf(a);
    if(ia<0) return;
    if(b===null){ out.push({i:i,o:ia,e:codes.length-1,mins:it.s[codes.length-1][1]-it.s[ia][1]}); return; }
    const ib=codes.indexOf(b,ia+1);
    if(ib<0) return;
    out.push({i:i,o:ia,e:ib,mins:it.s[ib][1]-it.s[ia][1]});
  });
  out.sort((x,y)=>x.mins-y.mins);
  return out;
}
function fillRouteSel(list,keep){
  routeSel.innerHTML="";
  list.forEach(c=>{
    const it=ITS[c.i];
    const o=document.createElement("option");
    o.value=c.i+":"+c.o+":"+c.e;
    o.textContent=it.n+(it.tr?" ("+it.tr+")":"")+" · "+fmtDur(c.mins/60);
    routeSel.appendChild(o);
  });
  routeSel.value=keep||list[0].value||(list[0].i+":"+list[0].o+":"+list[0].e);
  if(!routeSel.value) routeSel.value=list[0].i+":"+list[0].o+":"+list[0].e;
}
function applyChoice(){
  const p=routeSel.value.split(":").map(Number);
  IT=ITS[p[0]];O=p[1];E=p[2];
  fromCode=IT.s[O][0];toCode=IT.s[E][0];
  origIn.value=stopLabel(fromCode);destIn.value=stopLabel(toCode);
  rebuild();
}
function repick(preferIdx){
  const a=codeFromInput(origIn.value), b=codeFromInput(destIn.value);
  if(!a){pkMsg.textContent="Pick a departure station from the list.";return;}
  const list=servicesFor(a,b&&b!==a?b:null);
  if(!list.length){
    pkMsg.textContent="No single Amtrak route runs "+shortName(ST[a][0])+" → "+
      shortName(ST[b][0])+". That journey needs a connection, so pick one leg of it.";
    return;
  }
  pkMsg.textContent=list.length>1?(list.length+" services run this, quickest first."):"";
  let keep=null;
  if(preferIdx!==undefined){const m=list.find(c=>c.i===preferIdx); if(m) keep=m.i+":"+m.o+":"+m.e;}
  fillRouteSel(list,keep);
  applyChoice();
}
origIn.addEventListener("change",()=>repick());
destIn.addEventListener("change",()=>repick());
routeSel.addEventListener("change",applyChoice);
$("swapBtn").addEventListener("click",()=>{
  const a=origIn.value; origIn.value=destIn.value; destIn.value=a;
  repick();
});
document.getElementById("carrierCtl").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  carrier=b.dataset.carrier;
  [...e.currentTarget.children].forEach(x=>x.classList.toggle("on",x===b));
  rebuild();
});
$("themeBtn").addEventListener("click",()=>{
  theme=theme==="dark"?"light":"dark";
  document.documentElement.dataset.theme=theme;
  $("themeBtn").textContent=theme==="dark"?"☀ Light":"☾ Dark";
  paintRoute();drawTimeline();drawCards();updateAgenda();
  if(window.__recolorLive)window.__recolorLive();
});

/* ================= live position ================= */
function computeTNow(){
  if(liveOn.checked){ if(!depDate.value) return null;
    return (Date.now()-LEG.dep.getTime())/3600000-DELAY; }
  return +scrub.value;
}
function updateTrain(){
  const t=computeTNow();
  if(window.__onTrain)window.__onTrain(t);
  updateAgenda(t);
  if(!trainG) return;
  if(t===null){trainG.style.display="none";liveStatus.textContent="set a date";return;}
  if(t<-0.001){trainG.style.display="none";liveStatus.textContent="departs in "+fmtDur(-t);
    if(scrubVal)scrubVal.textContent="";return;}
  trainG.style.display="";
  const tc=Math.min(t,LEG.TOTAL), p=posAt(tc), x=px(p.lng), y=py(p.lat);
  trHalo.setAttribute("cx",x);trHalo.setAttribute("cy",y);
  trCore.setAttribute("cx",x);trCore.setAttribute("cy",y);
  trGlyph.setAttribute("x",x);trGlyph.setAttribute("y",y-11);
  if(t>=LEG.TOTAL){liveStatus.textContent="arrived · "+shortName(LEG.stops[LEG.stops.length-1].name);}
  else{const i=stopIndexAt(t);
    liveStatus.textContent=fmtDur(t)+" in · past "+stopName(i)+" · next "+stopName(i+1);}
  if(scrubVal)scrubVal.textContent=fmtDur(Math.min(t,LEG.TOTAL))+" in";
}
let liveTimer=null;
function setLiveMode(){
  if(liveOn.checked){scrubRow.classList.add("hidden");if(!liveTimer)liveTimer=setInterval(updateTrain,30000);}
  else{scrubRow.classList.remove("hidden");if(liveTimer){clearInterval(liveTimer);liveTimer=null;}}
  updateTrain();
}
liveOn.addEventListener("change",setLiveMode);
depDate.addEventListener("change",()=>rebuild());
scrub.addEventListener("input",updateTrain);
delayEl.addEventListener("input",()=>applyDelay(+delayEl.value/60));
$("delayReset").addEventListener("click",()=>{delayEl.value=0;applyDelay(0);});
function applyDelay(h){
  DELAY=h;
  const mins=Math.round(h*60),dv=$("delayVal");
  if(mins===0) dv.textContent="On schedule";
  else if(mins<0) dv.textContent="~"+(-mins)+" min early";
  else{const H=Math.floor(mins/60),M=mins%60;
    dv.textContent="~"+(H?H+"h ":"")+M+"m late · in "+shortName(LEG.stops[LEG.stops.length-1].name)+" ~"+clockAt(LEG.TOTAL).time;}
  refreshTimes();updateTrain();
}
$("anchorSet").addEventListener("click",()=>{
  const i=+$("anchorStop").value, tv=$("anchorTime").value; if(!tv) return;
  const s=LEG.stops[i], sched=new Date(LEG.dep.getTime()+s.t*3600000);
  const off=tzOffset(s.tz,sched), schedLocal=((sched.getTime()/60000+off)%1440+1440)%1440;
  const p=tv.split(":"), obs=(+p[0])*60+(+p[1]);
  let d=obs-schedLocal; if(d<-180)d+=1440; if(d>720)d-=1440;
  d=Math.max(-30,Math.min(360,d));
  delayEl.value=Math.round(d/5)*5; applyDelay(d/60);
});
function fillAnchor(){
  const sel=$("anchorStop");sel.innerHTML="";
  LEG.stops.forEach((s,i)=>{
    const o=document.createElement("option");o.value=i;
    o.textContent=shortName(s.name)+" (sched "+clockAt(s.t).time+")";sel.appendChild(o);});
}

/* ================= shareable state ================= */
/* Stop codes rather than indices, so a link survives a rebuild of the data. */
function writeURL(){
  /* opening the saved file locally gives an opaque origin, where replaceState throws.
     The page has to keep working there, so a failed URL update is not fatal. */
  try{
  const q=new URLSearchParams();
  q.set("t",IT.tr||"");q.set("r",IT.n);
  q.set("from",IT.s[O][0]);q.set("to",IT.s[E][0]);
  if(depDate.value)q.set("on",depDate.value);
  if(carrier!=="verizon")q.set("c",carrier);
  history.replaceState(null,"",location.pathname+"?"+q.toString());
  }catch(e){}
}
function readURL(){
  try{
  const q=new URLSearchParams(location.search);
  const r=q.get("r"),tr=q.get("t"),from=q.get("from"),to=q.get("to");
  if(q.get("on")) depDate.value=q.get("on");
  const c=q.get("c");
  if(c&&CARRIER_NAME[c]){carrier=c;
    [...$("carrierCtl").children].forEach(b=>b.classList.toggle("on",b.dataset.carrier===c));}
  if(!r||!from||!to) return -1;
  let best=-1;
  ITS.forEach((it,i)=>{
    if(it.n!==r) return;
    const codes=it.s.map(x=>x[0]), a=codes.indexOf(from), b=codes.indexOf(to);
    if(a<0||b<0||b<=a) return;
    if(best<0||(tr&&it.tr===tr)) best=i;
  });
  if(best<0) return -1;
  const codes=ITS[best].s.map(x=>x[0]);
  return {i:best,o:codes.indexOf(from),e:codes.indexOf(to)};
  }catch(e){ return -1; }
}

/* ================= assemble ================= */
function rebuild(){
  LEG=buildLeg();
  scrub.max=LEG.TOTAL.toFixed(2);
  if(+scrub.value>LEG.TOTAL) scrub.value=0;
  const a=LEG.stops[0], b=LEG.stops[LEG.stops.length-1];
  $("legTitle").textContent=shortName(a.name)+" → "+shortName(b.name);
  $("legSub").innerHTML=IT.n+(IT.tr?' · train <span class="mono">'+IT.tr+'</span>':'')+
    ' · departs <span class="mono">'+clockAt(0).day+" "+clockAt(0).time+" "+(ZAB[a.tz]||"")+'</span>'+
    ' · <span class="mono">'+fmtDur(LEG.TOTAL)+'</span> · <span class="mono">'+Math.round(legKm()).toLocaleString()+' mi</span>'+
    ' · <span class="mono">'+LEG.stops.length+'</span> stops.';
  drawMap();drawTimeline();drawCards();drawSights();drawDining();fillAnchor();
  applyDelay(+delayEl.value/60);
  if(window.__rebuildLive)window.__rebuildLive();
  updateTrain();
  writeURL();
  document.title=shortName(a.name)+" → "+shortName(b.name)+" · Amtrak signal map";
}
(function init(){
  document.documentElement.dataset.theme=theme;
  $("themeBtn").textContent=theme==="dark"?"☀ Light":"☾ Dark";
  const n=new Date();
  depDate.value=n.getFullYear()+"-"+("0"+(n.getMonth()+1)).slice(-2)+"-"+("0"+n.getDate()).slice(-2);
  const fromURL=readURL();
  if(fromURL!==-1){
    origIn.value=stopLabel(ITS[fromURL.i].s[fromURL.o][0]);
    destIn.value=stopLabel(ITS[fromURL.i].s[fromURL.e][0]);
    repick(fromURL.i);
  }else{
    /* open on the California Zephyr, the route this page started as */
    origIn.value=stopLabel("EMY"); destIn.value=stopLabel("CHI");
    const z=ITS.findIndex(it=>it.n==="California Zephyr"&&it.s[0][0]==="EMY");
    repick(z<0?undefined:z);
  }
  setLiveMode();
})();

/* ================= live high-res map (Esri tiles, needs internet) ================= */
(function(){
  const note=$("live-note");
  if(!window.L){ if(note) note.textContent="Live-map library didn't load. Open this page in a browser with internet."; return; }
  try{
    const lmap=L.map("live-map",{scrollWheelZoom:true,attributionControl:true});
    const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {maxZoom:18,attribution:"Esri, Maxar, USGS"}).addTo(lmap);
    const topo=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",{maxZoom:18,attribution:"Esri"});
    const street=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",{maxZoom:18,attribution:"Esri"});
    L.control.layers({Satellite:sat,Topographic:topo,Streets:street}).addTo(lmap);
    let warned=false;
    sat.on("tileerror",()=>{if(warned)return;warned=true;
      if(note) note.textContent="Tiles are blocked in this viewer. Open the page in a browser to see the imagery; the offline map above works everywhere.";});
    let segs=[],marks=[],lTrain=null;
    window.__rebuildLive=function(){
      segs.forEach(o=>lmap.removeLayer(o.pl));segs=[];
      marks.forEach(m=>lmap.removeLayer(m));marks=[];
      const pal=PAL[theme];
      covRuns().forEach(s=>{
        const pts=[];
        const a=posAt(s.t0),b=posAt(s.t1);
        pts.push([a.lat,a.lng]);
        for(let i=0;i<LEG.poly.length;i++) if(LEG.polyT[i]>=s.t0&&LEG.polyT[i]<=s.t1) pts.push(LEG.poly[i]);
        pts.push([b.lat,b.lng]);
        const pl=L.polyline(pts,{color:pal[s.st],weight:4,opacity:.95}).addTo(lmap);
        segs.push({pl:pl,st:s.st});
      });
      LEG.stops.forEach((s,i)=>{
        const major=(i===0||i===LEG.stops.length-1);
        const m=L.circleMarker([s.lat,s.lng],{radius:major?6:4,color:"#fff",weight:major?2:1.4,
          fillColor:major?"#EAE7DE":"#9aa6b2",fillOpacity:1}).addTo(lmap).bindPopup(s.name);
        marks.push(m);
      });
      LEG.sights.forEach(s=>{
        const m=L.circleMarker([s.lat,s.lng],{radius:5,color:"#1fbccd",weight:2,fillColor:"#1fbccd",fillOpacity:.55})
          .addTo(lmap).bindPopup("<b>"+s.n+"</b><br>"+lookText(s));
        marks.push(m);
      });
      lmap.fitBounds(L.latLngBounds(LEG.poly),{padding:[24,24]});
    };
    window.__recolorLive=function(){const pal=PAL[theme];segs.forEach(o=>o.pl.setStyle({color:pal[o.st]}));};
    window.__onTrain=function(t){
      if(t===null||t<-0.001){ if(lTrain){lmap.removeLayer(lTrain);lTrain=null;} return; }
      const p=posAt(Math.min(t,LEG.TOTAL));
      const icon=L.divIcon({className:"",iconSize:[16,16],iconAnchor:[8,8],
        html:'<div style="width:14px;height:14px;border-radius:50%;background:#a855f7;border:2px solid #fff;box-shadow:0 0 0 4px rgba(168,85,247,.35)"></div>'});
      if(!lTrain) lTrain=L.marker([p.lat,p.lng],{icon:icon,zIndexOffset:1000}).addTo(lmap);
      else lTrain.setLatLng([p.lat,p.lng]);
    };
    window.__rebuildLive(); updateTrain();
  }catch(e){ if(note) note.textContent="Live map couldn't start: "+e.message; }
})();
