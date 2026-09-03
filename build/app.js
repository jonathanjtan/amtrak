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
    if(b===null){
      if(ia>=codes.length-1) return;                 /* already the end of this line */
      out.push({i:i,o:ia,e:codes.length-1,mins:it.s[codes.length-1][1]-it.s[ia][1]}); return;
    }
    const ib=codes.indexOf(b,ia+1);
    if(ib<0) return;
    out.push({i:i,o:ia,e:ib,mins:it.s[ib][1]-it.s[ia][1]});
  });
  /* a train that does not run on the chosen date is not the quickest option,
     whatever the timetable says */
  const runnable=c=>runsOn(ITS[c.i],depDate.value)?0:1;
  out.sort((x,y)=>runnable(x)-runnable(y)||x.mins-y.mins);
  return out;
}
/* Journeys no single train covers. Finds interchange stations served by one
   service from the origin and another to the destination, cheapest total time
   first, and falls back to two changes when one will not do. */
const MIN_CONNECT=30;                     /* minutes; anything tighter is not a plan */
/* A change is not thirty minutes just because you would like it to be. Work the
   wait out of the timetable, and out of the calendar: connecting onto a train
   that runs three days a week can mean sitting for two days. */
const clockMin=(it,idx)=>{
  const hm=it.dep.split(":").map(Number);
  return ((hm[0]*60+hm[1]+it.s[idx][1])%1440+1440)%1440;
};
const startWeekday=()=>{
  const v=depDate.value; if(!v) return 0;
  const p=v.split("-").map(Number);
  return (new Date(p[0],p[1]-1,p[2]).getDay()+6)%7;      /* 0 = Monday */
};
/* Walk the legs in order from a starting weekday, returning each wait. */
function chainWaits(legs){
  let wd=startWeekday(), clock=clockMin(ITS[legs[0].i],legs[0].o), waits=[];
  let dayOff=0, offsets=[0];
  for(let n=0;n<legs.length;n++){
    const leg=legs[n];
    const arrAbs=clock+leg.mins;
    dayOff+=Math.floor(arrAbs/1440);
    wd=(wd+Math.floor(arrAbs/1440))%7;
    clock=((arrAbs%1440)+1440)%1440;
    const next=legs[n+1];
    if(!next) break;
    const dep=clockMin(ITS[next.i],next.o), dy=ITS[next.i].dy||"1111111";
    let w=null;
    for(let k=0;k<8;k++){
      if(dy[(wd+k)%7]!=="1") continue;
      const cand=k*1440+dep-clock;
      if(cand>=MIN_CONNECT){ w=cand; break; }
    }
    if(w===null) w=7*1440;                 /* nothing within a week; treat as unusable */
    waits.push(w);
    const abs=clock+w;
    dayOff+=Math.floor(abs/1440);
    wd=(wd+Math.floor(abs/1440))%7;
    clock=((abs%1440)+1440)%1440;
    offsets.push(dayOff);
  }
  return {waits:waits,offsets:offsets};
}
function withWaits(vias,legs){
  const {waits,offsets}=chainWaits(legs);
  const total=legs.reduce((a,l)=>a+l.mins,0)+waits.reduce((a,w)=>a+w,0);
  return {vias:vias,legs:legs,waits:waits,offsets:offsets,total:total};
}
/* Everywhere reachable from a in one train, and everywhere from which b is
   reachable in one; the interchanges are the overlap. */
function reachMaps(a,b){
  const fromA=new Map(), toB=new Map();
  ITS.forEach((it,i)=>{
    const codes=it.s.map(x=>x[0]);
    const ia=codes.indexOf(a);
    if(ia>=0) for(let j=ia+1;j<codes.length;j++){
      const m=it.s[j][1]-it.s[ia][1], cur=fromA.get(codes[j]);
      if(m>0&&(!cur||m<cur.mins)) fromA.set(codes[j],{mins:m,i:i,o:ia,e:j});
    }
    const ib=codes.lastIndexOf(b);
    if(ib>0) for(let j=0;j<ib;j++){
      const m=it.s[ib][1]-it.s[j][1], cur=toB.get(codes[j]);
      if(m>0&&(!cur||m<cur.mins)) toB.set(codes[j],{mins:m,i:i,o:j,e:ib});
    }
  });
  return {fromA:fromA,toB:toB};
}
/* the same pair of trains changing at neighbouring towns is one option, not three */
function dedupe(list,n){
  const seen=new Set(), keep=[];
  for(const c of list){
    const k=c.legs.map(l=>ITS[l.i].n).join("|");
    if(seen.has(k)) continue;
    seen.add(k); keep.push(c);
    if(keep.length===n) break;
  }
  return keep;
}
function connectionsFor(a,b){
  const {fromA,toB}=reachMaps(a,b);
  const one=[];
  fromA.forEach((v,x)=>{
    if(x===a||x===b) return;
    const w=toB.get(x);
    if(!w||v.i===w.i) return;
    one.push(withWaits([x],[v,w]));
  });
  if(one.length){ one.sort((p,q)=>p.total-q.total); return dedupe(one,3); }
  /* nothing direct enough: allow a middle train between two interchanges */
  const two=[];
  ITS.forEach((it,i)=>{
    const codes=it.s.map(x=>x[0]);
    let best=null;
    for(let p=0;p<codes.length;p++){
      const v=fromA.get(codes[p]);
      if(!v||v.i===i||codes[p]===a||codes[p]===b) continue;
      for(let q=p+1;q<codes.length;q++){
        const w=toB.get(codes[q]);
        if(!w||w.i===i||codes[q]===b) continue;
        const mid=it.s[q][1]-it.s[p][1];
        if(mid<=0) continue;
        const cand=withWaits([codes[p],codes[q]],[v,{mins:mid,i:i,o:p,e:q},w]);
        if(!best||cand.total<best.total) best=cand;
      }
    }
    if(best) two.push(best);
  });
  two.sort((p,q)=>p.total-q.total);
  return dedupe(two,2);
}
let journey=null;                          /* a multi-leg journey being explored */
function showConnections(a,b){
  const list=connectionsFor(a,b);
  if(!list.length){
    journey=null;
    pkMsg.textContent=deadEndMessage(a,b);
    return;
  }
  journey={a:a,b:b,list:list,pick:0,leg:1,start:depDate.value};
  drawJourney();
  loadLeg(list[0].legs[0],0);                /* show the first leg rather than nothing */
}
/* Say why, when there is a why. Usually one line ends somewhere nothing else
   calls at, which is worth knowing before you go looking for a connection. */
function deadEndMessage(a,b){
  const {fromA}=reachMaps(a,b);
  const generic="No Amtrak route in the feed joins "+shortName(stationName(a))+" and "+
                shortName(stationName(b))+" in under three changes.";
  if(!fromA.size) return generic;
  let far=null;
  fromA.forEach((v,x)=>{ if(!far||v.mins>far.mins) far={code:x,mins:v.mins}; });
  /* does anything leave the far end for somewhere new? the same line running back
     the way you came does not count */
  const onward=ITS.some(it=>{
    const c=it.s.map(x=>x[0]), i=c.indexOf(far.code);
    if(i<0) return false;
    for(let j=i+1;j<c.length;j++) if(c[j]!==a&&!fromA.has(c[j])) return true;
    return false;
  });
  if(onward) return generic;
  return "Trains out of "+shortName(stationName(a))+" reach as far as "+stationName(far.code)+
         ", and no Amtrak route continues from there. Reaching "+shortName(stationName(b))+
         " means changing stations by some other means, which breaks the journey in two.";
}
function drawJourney(){
  if(!journey) return;
  const J=journey, n=J.list[J.pick].legs.length;
  pkMsg.innerHTML="";
  const head=document.createElement("span");
  head.innerHTML=shortName(stationName(J.a))+" → "+shortName(stationName(J.b))+
    " needs "+(n-1===1?"one change":(n-1)+" changes")+". Showing <b>leg "+J.leg+" of "+n+"</b>.";
  pkMsg.appendChild(head);
  const box=document.createElement("div"); box.className="connect";
  J.list.forEach((c,ci)=>{
    const row=document.createElement("div"); row.className="cx";
    const waitTxt=(c.waits||[]).map(w=>fmtDur(w/60)).join(" + ");
    row.innerHTML='<span class="cx-via">via '+c.vias.map(v=>shortName(stationName(v))).join(", ")+'</span>'+
      '<span class="cx-tot mono">'+fmtDur(c.total/60)+' total'+(waitTxt?", "+waitTxt+" waiting":"")+'</span>';
    c.legs.forEach((leg,li)=>{
      const btn=document.createElement("button");
      btn.type="button";
      const on=(ci===J.pick&&li+1===J.leg);
      btn.className="cx-leg"+(on?" on":"");
      btn.setAttribute("aria-pressed",String(on));
      btn.innerHTML='<b>'+(li+1)+'</b> '+ITS[leg.i].n+' <span class="mono">'+fmtDur(leg.mins/60)+'</span>';
      btn.addEventListener("click",()=>{J.pick=ci;J.leg=li+1;drawJourney();
        loadLeg(leg,(c.offsets&&c.offsets[li])||0);});
      row.appendChild(btn);
    });
    box.appendChild(row);
  });
  pkMsg.appendChild(box);
}
function loadLeg(c,dayOffset){
  /* leg two of a journey departs after the ride and the wait, not on the day
     you set for leg one */
  if(journey&&journey.start&&dayOffset)
    depDate.value=shiftDate(journey.start,dayOffset);
  else if(journey&&journey.start)
    depDate.value=journey.start;
  IT=ITS[c.i]; O=c.o; E=c.e;
  origIn.value=stopLabel(IT.s[O][0]); destIn.value=stopLabel(IT.s[E][0]);
  const list=servicesFor(IT.s[O][0],IT.s[E][0]).filter(x=>x.e>x.o&&x.mins>0);
  if(list.length) fillRouteSel(list,c.i+":"+c.o+":"+c.e);
  applyChoice();
}
function fillRouteSel(list,keep){
  routeSel.innerHTML="";
  list.forEach(c=>{
    const it=ITS[c.i];
    const o=document.createElement("option");
    o.value=c.i+":"+c.o+":"+c.e;
    const days=runDays(it);
    o.textContent=it.n+(it.tr?" ("+it.tr+")":"")+" · "+fmtDur(c.mins/60)+
      (days.length<7?" · "+days.join("/"):"");
    routeSel.appendChild(o);
  });
  routeSel.value=keep||list[0].value||(list[0].i+":"+list[0].o+":"+list[0].e);
  if(!routeSel.value) routeSel.value=list[0].i+":"+list[0].o+":"+list[0].e;
}
function applyChoice(){
  const p=routeSel.value.split(":").map(Number);
  if(!p.length||isNaN(p[0])) return;
  IT=ITS[p[0]];O=p[1];E=p[2];
  fromCode=IT.s[O][0];toCode=IT.s[E][0];
  origIn.value=stopLabel(fromCode);destIn.value=stopLabel(toCode);
  rebuild();
}
function repick(preferIdx){
  const a=codeFromInput(origIn.value), b=codeFromInput(destIn.value);
  if(!a){pkMsg.textContent="Pick a departure station from the list.";return;}
  if(b&&b===a){pkMsg.textContent="Pick two different stations.";return;}
  const list=servicesFor(a,b||null).filter(c=>c.e>c.o&&c.mins>0);
  if(!list.length){
    if(b) showConnections(a,b);
    else pkMsg.textContent=shortName(stationName(a))+" is the end of the line on every route serving it. Name a destination, or start somewhere else.";
    return;
  }
  journey=null;
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
  [...e.currentTarget.children].forEach(x=>{
    x.classList.toggle("on",x===b);
    x.setAttribute("aria-pressed",String(x===b));
  });
  rebuild();
});
$("copyBtn").addEventListener("click",()=>{
  const b=$("copyBtn"), url=location.href;
  const done=t=>{b.textContent=t;setTimeout(()=>{b.textContent="⎘ Copy link";},1800);};
  /* the clipboard API needs a secure context, which a locally opened file is not */
  const fallback=()=>{
    try{
      const ta=document.createElement("textarea");
      ta.value=url; ta.setAttribute("readonly","");
      ta.style.cssText="position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      const ok=document.execCommand("copy");
      document.body.removeChild(ta);
      done(ok?"✓ Copied":"Copy from the address bar");
    }catch(e){ done("Copy from the address bar"); }
  };
  if(navigator.clipboard&&window.isSecureContext)
    navigator.clipboard.writeText(url).then(()=>done("✓ Copied"),fallback);
  else fallback();
});
$("themeBtn").addEventListener("click",()=>{
  theme=theme==="dark"?"light":"dark";
  document.documentElement.dataset.theme=theme;
  $("themeBtn").textContent=theme==="dark"?"☀ Light":"☾ Dark";
  paintRoute();drawTimeline();drawCards();updateAgenda();
  if(window.__recolorLive)window.__recolorLive();
  remember();
});

/* ================= live position ================= */
function computeTNow(){
  if(liveOn.checked){ if(!depDate.value) return null;
    return (Date.now()-LEG.dep.getTime())/3600000-DELAY; }
  return +scrub.value;
}
/* On a multi-day train the run you are sitting on left one or two days ago, so
   "live now" on today's date reports a departure still to come. Offer the run
   that is actually out there rather than guessing, since someone waiting at the
   station for tomorrow's train wants today's date left alone. */
const shiftDate=(str,days)=>{const p=str.split("-").map(Number);
  return new Date(Date.UTC(p[0],p[1]-1,p[2]+days)).toISOString().slice(0,10);};
function runAboardNow(){
  if(!depDate.value||!LEG) return null;
  const depHM=IT.dep.split(":").map(Number), depMin=depHM[0]*60+depHM[1]+IT.s[O][1];
  const oTz=TZ[ST[IT.s[O][0]][3]], now=Date.now();
  for(let d=1;d<=Math.ceil(LEG.TOTAL/24);d++){
    const day=shiftDate(depDate.value,-d);
    const inst=originInstant(day,depMin,oTz).inst.getTime();
    if(now>=inst&&now<=inst+LEG.TOTAL*3600000)
      return {date:day,label:new Intl.DateTimeFormat("en-US",{weekday:"long",timeZone:oTz}).format(new Date(inst))};
  }
  return null;
}
function offerRunAboard(){
  const host=$("aboardHint");
  if(!host) return;
  host.innerHTML="";
  if(!liveOn.checked) return;
  const r=runAboardNow();
  if(!r) return;
  const b=document.createElement("button");
  b.type="button"; b.className="aboard";
  b.textContent="the run from "+r.label+" is out there now";
  b.addEventListener("click",()=>{depDate.value=r.date;rebuild();});
  host.appendChild(b);
}
function updateTrain(){
  const t=computeTNow();
  if(window.__onTrain)window.__onTrain(t);
  updateAgenda(t);
  moveNowLine(t);
  if(!trainG) return;
  if(t===null){trainG.style.display="none";liveStatus.textContent="set a date";offerRunAboard();return;}
  if(t<-0.001){trainG.style.display="none";liveStatus.textContent="departs in "+fmtDur(-t);
    if(scrubVal)scrubVal.textContent=""; offerRunAboard(); return;}
  if($("aboardHint")) $("aboardHint").innerHTML="";
  trainG.style.display="";
  const tc=Math.min(t,LEG.TOTAL), p=posAt(tc), x=px(p.lng), y=py(p.lat);
  trHalo.setAttribute("cx",x);trHalo.setAttribute("cy",y);
  trCore.setAttribute("cx",x);trCore.setAttribute("cy",y);
  trGlyph.setAttribute("x",x);trGlyph.setAttribute("y",y-11);
  if(t>=LEG.TOTAL){liveStatus.textContent="arrived · "+shortName(LEG.stops[LEG.stops.length-1].name);}
  else{const i=stopIndexAt(t);
    liveStatus.textContent=fmtDur(t)+" in · past "+stopName(i)+" · next "+stopName(i+1);}
  if(scrubVal)scrubVal.textContent=fmtDur(Math.min(t,LEG.TOTAL))+" in";
  const strip=$("strip");
  if(strip&&t!==null&&isFinite(t)){
    const tc2=Math.max(0,Math.min(t,LEG.TOTAL));
    strip.setAttribute("aria-valuemax",LEG.TOTAL.toFixed(2));
    strip.setAttribute("aria-valuenow",tc2.toFixed(2));
    strip.setAttribute("aria-valuetext",fmtDur(tc2)+" in, "+clockAt(tc2).full+", "+STAT[covAt(tc2)].toLowerCase());
  }
}
/* One way in for every control that moves the train */
function seekTo(t){
  if(liveOn.checked){ liveOn.checked=false; setLiveMode(); }
  scrub.value=Math.max(0,Math.min(LEG.TOTAL,t)).toFixed(2);
  updateTrain();
}
/* Click or drag the strip to move through the trip. Direct manipulation beats
   hunting for the slider, which is hidden until you switch off live mode. */
(function(){
  const strip=$("strip");
  if(!strip) return;
  let dragging=false;
  const seek=e=>{
    const b=strip.getBoundingClientRect();
    const x=(e.touches?e.touches[0].clientX:e.clientX)-b.left;
    seekTo(Math.max(0,Math.min(1,x/(b.width||1)))*LEG.TOTAL);
  };
  strip.addEventListener("pointerdown",e=>{
    dragging=true; strip.setPointerCapture(e.pointerId); seek(e); e.preventDefault();
  });
  strip.addEventListener("pointermove",e=>{ if(dragging) seek(e); });
  const stop=e=>{ dragging=false; try{strip.releasePointerCapture(e.pointerId);}catch(_){} };
  strip.addEventListener("pointerup",stop);
  strip.addEventListener("pointercancel",stop);
  /* the strip is a primary control now, so it has to work from the keyboard */
  const step=(mins,e)=>{ seekTo((+scrub.value)+mins/60); e.preventDefault(); };
  strip.addEventListener("keydown",e=>{
    const big=e.shiftKey?60:15;
    if(e.key==="ArrowRight"||e.key==="ArrowUp") step(big,e);
    else if(e.key==="ArrowLeft"||e.key==="ArrowDown") step(-big,e);
    else if(e.key==="PageUp") step(180,e);
    else if(e.key==="PageDown") step(-180,e);
    else if(e.key==="Home"){ seekTo(0); e.preventDefault(); }
    else if(e.key==="End"){ seekTo(LEG.TOTAL); e.preventDefault(); }
  });
})();

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
  /* everything that prints a clock time or counts a meal has to follow the delay,
     not just the strip */
  wallBands(LEG);
  drawTimeline();
  drawCards();
  drawSights();
  drawDining();
  updateTrain();
  remember();
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

/* ================= remembered state =================
   Reloading used to drop everything back to the Zephyr. Storage can throw
   outright in private mode or from a local file, so every access is guarded. */
const STORE="amtrak.leg.v1";
function remember(){
  try{
    localStorage.setItem(STORE,JSON.stringify({
      r:IT.n,t:IT.tr,from:IT.s[O][0],to:IT.s[E][0],
      on:depDate.value,c:carrier,theme:theme,dly:Math.round(DELAY*60)}));
  }catch(e){}
}
function recall(){
  try{
    const v=JSON.parse(localStorage.getItem(STORE)||"null");
    if(!v||!v.from||!v.to) return null;
    /* a saved date in the past is worse than today's, so let it go, and with it
       any delay, which belonged to that trip and not this one */
    const t0=todayStr();
    if(!v.on||v.on<t0){ v.on=t0; v.dly=0; }
    return v;
  }catch(e){ return null; }
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
  remember();
}
/* Returns true when a saved leg was restored. A leg the feed no longer runs
   just falls through to the default rather than failing. */
function applySaved(){
  const v=recall();
  if(!v) return false;
  if(v.on) depDate.value=v.on;
  if(v.dly&&isFinite(v.dly)){
    const m=Math.max(-30,Math.min(360,v.dly));
    delayEl.value=m; DELAY=m/60;
  }
  if(v.c&&CARRIER_NAME[v.c]){
    carrier=v.c;
    [...$("carrierCtl").children].forEach(b=>{
      const on=b.dataset.carrier===v.c;
      b.classList.toggle("on",on); b.setAttribute("aria-pressed",String(on));
    });
  }
  if(v.theme==="light"||v.theme==="dark"){
    theme=v.theme;
    document.documentElement.dataset.theme=theme;
    $("themeBtn").textContent=theme==="dark"?"☀ Light":"☾ Dark";
  }
  if(!ST[v.from]||!ST[v.to]) return false;
  let idx=-1;
  ITS.forEach((it,i)=>{
    if(it.n!==v.r) return;
    const codes=it.s.map(x=>x[0]), a=codes.indexOf(v.from), b=codes.indexOf(v.to);
    if(a<0||b<=a) return;
    if(idx<0||(v.t&&it.tr===v.t)) idx=i;
  });
  origIn.value=stopLabel(v.from); destIn.value=stopLabel(v.to);
  repick(idx<0?undefined:idx);
  return !!LEG;
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
const todayStr=()=>{const n=new Date();
  return n.getFullYear()+"-"+("0"+(n.getMonth()+1)).slice(-2)+"-"+("0"+n.getDate()).slice(-2);};
function rebuild(){
  /* an empty date used to fall back to a fixed one inside buildLeg, so the page
     showed a confident set of days for a trip nobody had chosen */
  if(!depDate.value) depDate.value=todayStr();
  LEG=buildLeg();
  scrub.max=LEG.TOTAL.toFixed(2);
  if(+scrub.value>LEG.TOTAL) scrub.value=0;
  const a=LEG.stops[0], b=LEG.stops[LEG.stops.length-1];
  $("legTitle").textContent=shortName(a.name)+" → "+shortName(b.name);
  const days=runDays(IT);
  $("runsHint").innerHTML = days.length>=7 ? "" :
    (runsOn(IT,depDate.value)
      ? ("This service runs "+listDays(days)+".")
      : ("<b>This service does not run that day.</b> It runs "+listDays(days)+"."));
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
(function scope(){
  const el=$("dataScope");
  if(!el) return;
  const routes=new Set(ITS.map(i=>i.n)), stops=new Set();
  ITS.forEach(i=>i.s.forEach(s=>stops.add(s[0])));
  el.textContent=ITS.length+" itineraries across "+routes.size+" routes and "+stops.size+" stations";
})();
(function init(){
  document.documentElement.dataset.theme=theme;
  $("themeBtn").textContent=theme==="dark"?"☀ Light":"☾ Dark";
  depDate.value=todayStr();
  const fromURL=readURL();
  if(fromURL!==-1){
    origIn.value=stopLabel(ITS[fromURL.i].s[fromURL.o][0]);
    destIn.value=stopLabel(ITS[fromURL.i].s[fromURL.e][0]);
    repick(fromURL.i);
  }else if(applySaved()){
    /* restored from last visit */
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
    /* the route rides in its own group so it can be switched off to read the terrain */
    const routeLayer=L.layerGroup().addTo(lmap);
    L.control.layers({Satellite:sat,Topographic:topo,Streets:street},
                     {"Route &amp; stops":routeLayer},
                     {collapsed:window.matchMedia("(max-width:700px)").matches}).addTo(lmap);
    let warned=false;
    sat.on("tileerror",()=>{if(warned)return;warned=true;
      if(note) note.textContent="Tiles are blocked in this viewer. Open the page in a browser to see the imagery; the offline map above works everywhere.";});
    /* Leaflet's layer control puts its text in a sibling span, so the inputs
       themselves announce as "on"; name them from that text. */
    setTimeout(()=>{
      document.querySelectorAll("#live-map .leaflet-control-layers input").forEach(inp=>{
        const t=(inp.parentElement&&inp.parentElement.textContent||"").trim();
        if(t) inp.setAttribute("aria-label",t);
      });
    },0);
    let segs=[],lTrain=null;
    window.__rebuildLive=function(){
      routeLayer.clearLayers(); segs=[];
      const pal=covColors();
      covRuns().forEach(s=>{
        const pts=[];
        const a=posAt(s.t0),b=posAt(s.t1);
        pts.push([a.lat,a.lng]);
        for(let i=0;i<LEG.poly.length;i++) if(LEG.polyT[i]>=s.t0&&LEG.polyT[i]<=s.t1) pts.push(LEG.poly[i]);
        pts.push([b.lat,b.lng]);
        const pl=L.polyline(pts,{color:pal[s.st],weight:4,opacity:.95}).addTo(routeLayer);
        segs.push({pl:pl,st:s.st});
      });
      LEG.stops.forEach((s,i)=>{
        const major=(i===0||i===LEG.stops.length-1);
        L.circleMarker([s.lat,s.lng],{radius:major?6:4,color:"#fff",weight:major?2:1.4,
          fillColor:major?"#EAE7DE":"#9aa6b2",fillOpacity:1}).addTo(routeLayer)
          .bindPopup(s.name+"<br>"+clockAt(s.t).full);
      });
      LEG.sights.forEach(s=>{
        L.circleMarker([s.lat,s.lng],{radius:5,color:"#1fbccd",weight:2,fillColor:"#1fbccd",fillOpacity:.55})
          .addTo(routeLayer).bindPopup("<b>"+s.n+"</b><br>"+lookText(s));
      });
      /* no animation: a queued zoom can be dropped when legs change quickly,
         leaving the imagery parked on the previous route */
      lmap.invalidateSize(false);
      lmap.fitBounds(L.latLngBounds(LEG.poly),{padding:[24,24],animate:false});
    };
    window.__recolorLive=function(){const pal=covColors();segs.forEach(o=>o.pl.setStyle({color:pal[o.st]}));};
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
