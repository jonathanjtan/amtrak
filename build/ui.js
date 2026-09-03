/* ================= timeline ================= */
const strip=$("strip"),axis=$("axis"),sstars=$("sstars"),mealsEl=$("meals");
function fmtDur(hh){hh=Math.max(0,hh);const H=Math.floor(hh),M=Math.round((hh-H)*60);
  return (H?H+"h ":"")+(M<10&&H?"0":"")+M+"m";}
/* Schedule times slide with the delay. Wall-clock events (meals, darkness) were
   already found at their delayed positions, so they must not be shifted again. */
function clockAt(t){
  const s=nearestStop(t), d=new Date(LEG.dep.getTime()+(t+DELAY)*3600000), f=fmtLocal(d,s.tz);
  return {time:f.time,day:f.day,z:ZAB[s.tz]||"",full:f.day+" ~"+f.time+" "+(ZAB[s.tz]||"")};
}
function pct(t){return Math.max(0,Math.min(100,t/LEG.TOTAL*100));}
function drawTimeline(){
  strip.innerHTML="";sstars.innerHTML="";mealsEl.innerHTML="";axis.innerHTML="";
  const pal=covColors();
  covRuns().forEach(s=>{
    const d=document.createElement("div");d.className="cell";
    d.style.left=pct(s.t0)+"%";d.style.width=(pct(s.t1)-pct(s.t0))+"%";
    d.style.background=pal[s.st];d.title=STAT[s.st];strip.appendChild(d);
  });
  LEG.night.forEach(n=>{
    const b=document.createElement("div");b.className="night-band";
    b.style.left=pct(n.a)+"%";b.style.width=(pct(n.b)-pct(n.a))+"%";b.style.top="1px";strip.appendChild(b);
    if(n.b-n.a>1.2){const l=document.createElement("div");l.className="night-lbl";l.textContent="☾ dark";
      l.style.left=((pct(n.a)+pct(n.b))/2)+"%";l.style.top="23px";strip.appendChild(l);}
  });
  LEG.meals.forEach(m=>{
    const d=document.createElement("div");d.className="meal";
    d.style.left=pct(m.a)+"%";d.style.width=(pct(m.b)-pct(m.a))+"%";
    d.textContent=m.name[0];d.title=m.name+" · dining car";
    d.addEventListener("click",()=>{ if(typeof seekTo==="function") seekTo(m.a); });
    mealsEl.appendChild(d);
  });
  LEG.sights.forEach(s=>{
    const d=document.createElement("div");d.className="sstar";d.style.left=pct(s.t)+"%";
    d.title=s.n+" · "+lookText(s);
    d.addEventListener("click",()=>{ if(typeof seekTo==="function") seekTo(s.t); });
    d.innerHTML='<svg width="15" height="10" viewBox="-7 -5 14 10" aria-hidden="true"><path d="M-6 0 C-3 -4 3 -4 6 0 C3 4 -3 4 -6 0 Z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle r="1.8" fill="currentColor"/></svg>';
    sstars.appendChild(d);
  });
  /* ticks: endpoints plus a few evenly spaced stops */
  const n=LEG.stops.length, want=Math.min(7,n), picks=new Set([0,n-1]);
  for(let k=1;k<want-1;k++) picks.add(Math.round(k*(n-1)/(want-1)));
  [...picks].sort((a,b)=>a-b).forEach(i=>{
    const s=LEG.stops[i];
    const d=document.createElement("div");d.className="tick"+(i&&i<n-1?" minor":"");
    d.style.left=pct(s.t)+"%";
    d.innerHTML='<div class="bar"></div><div class="t"></div><div class="d"></div>';
    axis.appendChild(d);
    d.__i=i;
  });
  refreshTimes();
}
/* Where you are, on the same axis as everything else */
function moveNowLine(t){
  const el=$("nowLine");
  if(t===null||!isFinite(t)||t<0||t>LEG.TOTAL){el.hidden=true;return;}
  el.hidden=false;
  el.style.left=pct(t)+"%";
  $("nowTag").textContent=fmtDur(t)+" in";
}
function refreshTimes(){
  [...axis.children].forEach(d=>{
    const c=clockAt(LEG.stops[d.__i].t);
    d.querySelector(".t").textContent=c.time; d.querySelector(".d").textContent=c.day;
  });
  stationRefs.forEach(r=>{r.node.textContent=clockAt(LEG.stops[r.i].t).time;});
}

/* ================= worst stretches ================= */
function coverageSummary(){
  const tot={good:0,spotty:0,dead:0};
  LEG.cov.forEach(c=>{tot[c.st]+=c.t1-c.t0;});
  const T=LEG.TOTAL||1, pctD=Math.round(tot.dead/T*100), pctS=Math.round(tot.spotty/T*100);
  const el=$("covSummary");
  const CN=CARRIER_NAME[carrier];
  if(tot.dead<0.05&&tot.spotty<0.05){
    el.innerHTML="<b>"+CN+" holds the whole way</b> on this model, all "+fmtDur(LEG.TOTAL)+
      " of it. "+compareCarriers();
    return;
  }
  const bits=[];
  if(tot.good>0.05) bits.push("usable for <b>"+fmtDur(tot.good)+"</b>");
  if(tot.spotty>0.05) bits.push("spotty for <b>"+fmtDur(tot.spotty)+"</b>");
  if(tot.dead>0.05) bits.push("dead for <b>"+fmtDur(tot.dead)+"</b>");
  const last=bits.pop();
  el.innerHTML="Of "+fmtDur(LEG.TOTAL)+" on <b>"+CN+"</b>: "+bits.join(", ")+(bits.length?" and ":"")+last+". "+
    (tot.dead>0.05?("That is about "+pctD+"% of the trip with nothing at all. "):
     (pctS>0?("About "+pctS+"% of it is patchy. "):""))+compareCarriers();
}
/* The comparison the page exists to make, without clicking through all three */
function compareCarriers(){
  const rows=Object.keys(CARRIER_NAME).map(c=>{
    const t=carrierTotals(c);
    return {c:c,name:CARRIER_NAME[c],dead:t.dead,spotty:t.spotty,
            pct:Math.round(t.dead/(LEG.TOTAL||1)*100)};
  }).sort((a,b)=>a.dead-b.dead||a.spotty-b.spotty);
  const noDead=rows.every(r=>r.dead<0.05);
  if(noDead&&rows.every(r=>r.spotty<0.05)) return "All three carriers hold up here.";
  if(noDead){
    /* nobody loses it outright, so the honest comparison is the patchy time */
    const worst=rows[rows.length-1];
    return "None of the three drop out entirely; <b>"+worst.name+"</b> is the patchiest at "+
           fmtDur(worst.spotty)+".";
  }
  if(rows.every(r=>r.pct===rows[0].pct)) return "All three lose it for about the same stretch.";
  const parts=rows.map(r=>"<b>"+r.name+"</b> "+(r.dead<0.05?"none":fmtDur(r.dead)));
  return "Dead time by carrier: "+parts.join(", ")+".";
}
/* The cards say where signal dies. The complement is the question people
   actually ask: when can I take a call? */
function usableWindows(){
  const runs=[]; let i=0;
  const c=covRuns();
  while(i<c.length){
    if(c[i].st==="good"){ runs.push({t0:c[i].t0,t1:c[i].t1}); }
    i++;
  }
  runs.sort((a,b)=>(b.t1-b.t0)-(a.t1-a.t0));
  const el=$("goodWindows");
  if(!el) return;
  const worth=runs.filter(r=>r.t1-r.t0>=0.75).slice(0,3).sort((a,b)=>a.t0-b.t0);
  if(!worth.length||LEG.TOTAL<1.5){ el.textContent=""; return; }
  if(worth.length===1&&worth[0].t1-worth[0].t0>=LEG.TOTAL-0.05){ el.textContent=""; return; }
  el.innerHTML="Longest usable windows: "+
    worth.map(r=>"<b>"+fmtDur(r.t1-r.t0)+"</b> from "+clockAt(r.t0).time+" "+clockAt(r.t0).day).join(", ")+".";
}
function drawCards(){
  const cards=$("cards"); cards.innerHTML="";
  coverageSummary();
  usableWindows();
  const runs=[];let i=0;
  while(i<LEG.cov.length){
    let j=i; while(j+1<LEG.cov.length&&LEG.cov[j+1].st===LEG.cov[i].st) j++;
    runs.push({st:LEG.cov[i].st,t0:LEG.cov[i].t0,t1:LEG.cov[j].t1}); i=j+1;
  }
  const bad=runs.filter(r=>r.st!=="good").sort((a,b)=>(b.t1-b.t0)-(a.t1-a.t0)).slice(0,4).sort((a,b)=>a.t0-b.t0);
  if(!bad.length){
    cards.innerHTML='<div class="dz"><div class="top"><h3>No gaps worth planning around</h3><span class="chip" style="background:'+covColors().good+';color:#0c1116">Usable</span></div><p>'+CARRIER_NAME[carrier]+' holds up across this whole leg on the model below.</p></div>';
    $("cardsLabel").textContent="Coverage";
    return;
  }
  $("cardsLabel").textContent=bad.length>1?"The stretches to plan around":"The stretch to plan around";
  const pal=covColors();
  bad.forEach(r=>{
    const a=stopIndexAt(r.t0+1e-6), b=Math.min(LEG.stops.length-1,stopIndexAt(r.t1-1e-6)+1);
    const c0=clockAt(r.t0),c1=clockAt(r.t1);
    const d=document.createElement("div");d.className="dz";
    d.innerHTML='<div class="top"><h3>'+LEG.stops[a].short+' → '+LEG.stops[b].short+'</h3>'+
      '<span class="chip" style="background:'+pal[r.st]+';color:'+((theme==="light"&&r.st==="spotty")?"#fff":"#0c1116")+'">'+STAT[r.st]+'</span></div>'+
      '<div class="when">'+c0.day+' ~'+c0.time+'–'+c1.time+' · '+fmtDur(r.t1-r.t0)+'</div>'+
      '<p>'+(r.st==="dead"?"Expect nothing at all through here. ":"Patchy through here, with gaps between towns. ")+
      'About '+Math.round((r.t1-r.t0)/LEG.TOTAL*100)+'% of the trip.</p>';
    cards.appendChild(d);
  });
}

/* ================= sights ================= */
function compass(dir){
  const c=20,R=15,V={N:[0,-1],NE:[.707,-.707],E:[1,0],SE:[.707,.707],S:[0,1],SW:[-.707,.707],W:[-1,0],NW:[-.707,-.707]};
  let g='<circle cx="20" cy="20" r="15" style="fill:none;stroke:var(--rail);stroke-width:1"/>'+
        '<text x="20" y="6.6" text-anchor="middle" style="fill:var(--muted);font-family:ui-monospace,monospace" font-size="6">N</text>';
  const wedge=v=>{const tx2=c+v[0]*(R-1),ty2=c+v[1]*(R-1),bx=c+v[0]*3,by=c+v[1]*3,pxp=-v[1],pyp=v[0];
    return '<polygon points="'+tx2.toFixed(1)+','+ty2.toFixed(1)+' '+(bx+pxp*4).toFixed(1)+','+(by+pyp*4).toFixed(1)+' '+(bx-pxp*4).toFixed(1)+','+(by-pyp*4).toFixed(1)+'" style="fill:var(--scenic)"/>';};
  if(dir==="BOTH") g+=wedge(V.E)+wedge(V.W);
  else if(dir==="TUNNEL") g+='<rect x="15" y="17" width="10" height="6" rx="1.5" style="fill:var(--muted)"/>';
  else if(V[dir]) g+=wedge(V[dir])+'<circle cx="20" cy="20" r="1.7" style="fill:var(--scenic)"/>';
  return '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">'+g+'</svg>';
}
function lookText(s){
  if(s.dir==="TUNNEL") return "In the tunnel, no view";
  if(s.dir==="BOTH") return "Both sides, best from the lounge";
  return "Look "+CARD[s.dir]+", "+s.side.toLowerCase()+" side";
}
function drawSights(){
  const wrap=$("sightsWrap"), host=$("sights"); host.innerHTML="";
  if(!LEG.sights.length){wrap.style.display="none";$("sideHint").textContent="";return;}
  wrap.style.display="";
  /* which seat to book, counted honestly: a canyon the train runs through
     shows on both sides and should not be scored for either */
  let L=0,R=0,B=0;
  LEG.sights.forEach(s=>{ if(s.side==="Left")L++; else if(s.side==="Right")R++; else if(s.side==="Both")B++; });
  const side=$("sideHint");
  if(!L&&!R&&!B) side.textContent="";
  else if(!L&&!R) side.innerHTML="All of it shows on both sides here, so any seat will do.";
  else{
    const parts=[];
    if(L) parts.push("<b>"+L+"</b> on the <b>left</b>");
    if(R) parts.push("<b>"+R+"</b> on the <b>right</b>");
    side.innerHTML="Of what is marked, "+parts.join(" and ")+
      (B?("; "+B+(B===1?" shows":" show")+" on both sides"):"")+".";
  }
  let day=null,grid=null;
  LEG.sights.forEach(s=>{
    const c=clockAt(s.t);
    if(c.day!==day){
      day=c.day;
      const hd=document.createElement("div");hd.className="sights-day";
      hd.innerHTML='<span>'+c.day+'</span>';host.appendChild(hd);
      grid=document.createElement("div");grid.className="sights";host.appendChild(grid);
    }
    const d=document.createElement("div");d.className="sight";
    d.innerHTML='<div class="badge">'+compass(s.dir)+'<span class="side">'+(s.side==="Tunnel"?"—":s.side.toUpperCase())+'</span></div>'+
      '<div class="body"><h4>'+s.n+'</h4><div class="when">~'+c.time+' '+c.z+'</div>'+
      '<div class="look">'+lookText(s)+'</div><p>'+s.d+'</p></div>';
    grid.appendChild(d);
  });
}

/* ================= dining ================= */
/* "Lunch, Dinner, Breakfast, Lunch, Dinner, Breakfast and Lunch" tells you
   nothing; the same seven services grouped by day tell you what to expect. */
function mealsByDay(){
  const days=[];
  LEG.meals.forEach(m=>{
    const d=clockAt(m.a).day, last=days[days.length-1];
    if(last&&last.day===d) last.names.push(m.name.toLowerCase());
    else days.push({day:d,names:[m.name.toLowerCase()]});
  });
  const join=a=>a.length>1?a.slice(0,-1).join(", ")+" and "+a[a.length-1]:a[0];
  return days.map(d=>(d.names.length===3?"all three":join(d.names))+" on "+d.day);
}
function drawDining(){
  const wrap=$("diningWrap");
  if(!LEG.dining){
    wrap.innerHTML='<div class="sec-label">Onboard</div><p class="sight-note">This leg runs '+fmtDur(LEG.TOTAL)+
      ', so expect a <b>café car</b> rather than a dining car: snacks, coffee and drinks for sale, and you can bring your own food aboard. '+
      'Amtrak carries free Wi-Fi on most corridor trains, but it runs over the same cellular networks mapped above, '+
      'so it thins out and drops in the same places. Treat the colors here as the ceiling for onboard Wi-Fi too.</p>';
    return;
  }
  const names=LEG.meals.map(m=>m.name);
  wrap.innerHTML='<div class="sec-label">Dining &amp; the observation car</div>'+
   '<div class="onboard">'+
   '<div class="ob obs"><h4>Sightseer Lounge <span class="tag">open to all</span></h4><p>An upper deck walled in floor-to-ceiling windows, open to every passenger, with the Café on the lower level. It fills through the best scenery, so claim a spot early.</p></div>'+
   '<div class="ob dine"><h4>Dining car <span class="tag">sleeper included</span></h4><p>Chef-prepared breakfast and lunch and a three-course dinner at communal tables. Complimentary for sleeping-car passengers; dinner is by reservation through your car attendant. Coach can join first-come if seats are free.</p></div>'+
   '<div class="ob cafe"><h4>Café car <span class="tag">open to all</span></h4><p>Lower level of the lounge. Hot and cold snacks, coffee and drinks for sale through the day, and the only hot-meal option in coach. You can also bring your own food.</p></div>'+
   '</div><div class="meal-times">'+
   MEALS.map(m=>{
     const a=hhmm(m[0]), b=hhmm(m[1]), lc=hhmm(m[1]-LAST_CALL);
     return '<div class="mt"><p class="m">'+m[2]+'</p><p class="h">'+
       a.t+(a.ap!==b.ap?a.ap:"")+"–"+b.t+b.ap+'</p><small>last call '+lc.t+lc.ap+
       (m[2]==="Dinner"?" · reserve":"")+'</small></div>';
   }).join("")+
   '</div><p class="sight-note">Meals run on the train\'s local clock, which shifts under you as you cross time zones. On this leg that works out to '+
   (names.length?('<b>'+names.length+' service'+(names.length>1?"s":"")+'</b>: '+
      mealsByDay().join("; ")):'<b>no full meal service</b>')+
   '. Last call is about 15 minutes before each window closes.</p>';
}
