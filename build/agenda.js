/* ================= now happening / up next ================= */
const agNowEl=$("agNow"),agNextEl=$("agNext"),agTipsEl=$("agTips"),agCarrierEl=$("agCarrier");
function nightAt(t){for(const n of LEG.night) if(t>=n.a&&t<n.b) return n; return null;}
function nextDark(t){for(const n of LEG.night) if(n.a>t) return n.a; return null;}
function mealAt(t){for(const m of LEG.meals) if(t>=m.a&&t<m.b) return m; return null;}
function nextMeal(t){for(const m of LEG.meals) if(m.a>t) return m; return null;}
function sightNow(t){const w=Math.max(0.18,LEG.TOTAL/160);
  for(const s of LEG.sights) if(Math.abs(s.t-t)<w) return s; return null;}
function nextSight(t){for(const s of LEG.sights) if(s.t>t) return s; return null;}
function nextStop(t){for(const s of LEG.stops) if(s.t>t+1e-9) return s; return null;}
function stopName(i){return shortName(LEG.stops[Math.max(0,Math.min(LEG.stops.length-1,i))].name);}

function agEvents(){
  const ev=[];
  LEG.stops.forEach((s,i)=>{
    if(i===0) return;
    const dw=IT.s[O+i][2]||0;
    ev.push({t:s.t,pri:2,title:shortName(s.name),
      sub:dw>=8?("station stop · about "+dw+" min on the platform"):"station stop"});
  });
  LEG.sights.forEach(s=>ev.push({t:s.t,pri:1,title:s.n,sub:lookText(s)}));
  LEG.meals.forEach(m=>ev.push({t:m.a,pri:2,title:m.name+" opens",
    sub:"dining car · last call ~"+clockAt(Math.max(m.a,m.b-0.25)).time}));
  LEG.night.forEach(n=>{
    ev.push({t:n.a,pri:3,title:"Dark outside",sub:"nothing to see until dawn"});
    if(n.b<LEG.TOTAL-0.05) ev.push({t:n.b,pri:3,title:"Daylight returns",sub:"the window is worth watching again"});
  });
  const L={good:"Signal comes back",spotty:"Signal turns spotty",dead:"Signal drops out"},
        W={good:"usable",spotty:"patchy, gaps between towns",dead:"no service"};
  for(let i=1;i<LEG.cov.length;i++){
    if(LEG.cov[i].st===LEG.cov[i-1].st) continue;
    const r=covRun(LEG.cov[i].t0+1e-6);
    ev.push({t:LEG.cov[i].t0,pri:0,title:L[LEG.cov[i].st],sub:W[LEG.cov[i].st]+" for about "+fmtDur(r.t1-r.t0)});
  }
  return ev.sort((a,b)=>a.t-b.t||a.pri-b.pri);
}
function agTipList(t){
  const tips=[],CN=CARRIER_NAME[carrier],run=covRun(t),
        add=(ic,html,hot)=>tips.push({ic:ic,html:html,hot:!!hot});
  const sn=sightNow(t),ns=nextSight(t),mn=mealAt(t),nm=nextMeal(t),dark=nightAt(t),nd=nextDark(t),st=nextStop(t);
  if(run.st==="dead"){
    const left=run.t1-t;
    if(left<=0.5) add("↑",'<b>Signal back in ~'+fmtDur(left)+'</b> near '+stopName(stopIndexAt(run.t1)+1)+'. Queue your uploads and unsent messages now so they go the moment bars return.',true);
    else add("✈",'<b>No service for another ~'+fmtDur(left)+'.</b> Good stretch for the lounge car or a nap. Next usable bars ~'+clockAt(run.t1).time+' near '+stopName(stopIndexAt(run.t1)+1)+'.');
  }else{
    const d=nextRunOf(t,"dead"), horizon=Math.max(1.0,Math.min(2.0,LEG.TOTAL/26));
    if(d&&d.t-t<=horizon&&d.len>=0.5)
      add("⤓",'<b>Send it before ~'+clockAt(d.t).time+'.</b> '+CN+' drops out in ~'+fmtDur(d.t-t)+' and stays out about '+fmtDur(d.len)+'. Download maps and a few episodes now, and start any big upload while you still have bars.',true);
    else if(run.st==="spotty")
      add("◍",'<b>Spotty here.</b> Texts and calls mostly hold; video and big files will stall. Load anything heavy at the next town.');
    else if(d)
      add("✓",'<b>'+CN+' is usable</b> for about '+fmtDur(run.t1-t)+'. The next dead stretch starts ~'+clockAt(d.t).time+' and runs '+fmtDur(d.len)+'.');
    else
      add("✓",'<b>'+CN+' is usable</b> and stays that way to '+stopName(LEG.stops.length-1)+'.');
  }
  if(sn) add("◉",'<b>'+sn.n+', right now.</b> '+lookText(sn)+'.',true);
  else if(ns&&ns.t-t<=Math.max(0.6,LEG.TOTAL/60))
    add("◉",'<b>Head up to the Sightseer Lounge.</b> '+ns.n+' in ~'+fmtDur(ns.t-t)+'. '+lookText(ns)+'.',ns.t-t<=0.4);
  if(mn) add("▨",'<b>'+mn.name+' is being served.</b> Last call ~'+clockAt(Math.max(mn.a,mn.b-0.25)).time+'. Sleeper fares include it; coach can join if seats are free.');
  else if(nm&&nm.a-t<=1.2) add("▨",'<b>'+nm.name+' opens in ~'+fmtDur(nm.a-t)+'.</b>'+(nm.name==="Dinner"?' It is by reservation, so catch your car attendant now.':''));
  else if(nm&&nm.name==="Dinner"&&nm.a-t<=4) add("▨",'<b>Reserve dinner</b> with your car attendant. Tonight\'s seating fills through the afternoon.');
  if(st){
    const i=LEG.stops.indexOf(st), dw=IT.s[O+i][2]||0;
    if(st.t-t<=0.6&&dw>=10)
      add("▮",'<b>'+shortName(st.name)+' in ~'+fmtDur(st.t-t)+'.</b> About '+dw+' min on the platform: fresh air, and'+(covAt(st.t)==="good"?' the most reliable signal for a while.':' a chance to stretch.'));
  }
  if(dark) add("☾",'<b>Dark out.</b> Daylight ~'+clockAt(dark.b).time+'.'+(covRun(t).st==="dead"?' The dead stretch runs through it, so this is the part to sleep through.':''));
  else if(nd&&nd-t<=1.2) add("☾",'<b>Dark in ~'+fmtDur(nd-t)+'.</b> Charge at the seat outlet while there is nothing to look at.');
  return tips.slice(0,4);
}
function updateAgenda(t){
  if(t===undefined)t=computeTNow();
  const pal=covColors();
  agCarrierEl.textContent=CARRIER_NAME[carrier];
  agNextEl.innerHTML="";agTipsEl.innerHTML="";
  const paint=items=>items.forEach(e=>{
    const li=document.createElement("li");li.className="ag-item";
    li.innerHTML='<span class="ag-dot" style="background:'+pal[covAt(e.t)]+'"></span>'+
      '<span class="ag-when">'+clockAt(e.t).time+'</span>'+
      '<span class="ag-what"><b>'+e.title+'</b><span>'+e.sub+'</span></span>';
    agNextEl.appendChild(li);});
  const tipList=arr=>arr.forEach(o=>{const li=document.createElement("li");
    li.className="ag-tip"+(o.hot?" hot":"");
    li.innerHTML='<span class="ic">'+o.ic+'</span><span>'+o.html+'</span>';agTipsEl.appendChild(li);});
  if(t===null){
    agNowEl.innerHTML='<p class="ag-empty">Set a departure date above, or switch off <b>live now</b> and scrub the position by hand.</p>';
    paint(agEvents().slice(0,5));
    tipList([{ic:"⤓",html:'<b>Download before you board.</b> Offline maps, playlists, a few episodes. There is no onboard Wi-Fi on most Amtrak long-distance trains.'}]);
    return;
  }
  if(t<0){
    agNowEl.innerHTML='<div class="ag-hero"><p class="ag-where">Not departed: '+shortName(LEG.stops[0].name)+'</p></div>'+
      '<p class="ag-stamp">leaves in '+fmtDur(-t)+' · '+clockAt(0).full+'</p>';
    paint(agEvents().filter(e=>e.t>=0).slice(0,5));
    const worst=LEG.cov.filter(c=>c.st==="dead").reduce((a,c)=>a+(c.t1-c.t0),0);
    tipList([
      {ic:"⤓",html:'<b>Download everything now.</b> '+(worst>0.5?('This leg has about '+fmtDur(worst)+' with no service at all on '+CARRIER_NAME[carrier]+'. '):'')+'Offline maps, playlists, a few episodes, whatever you plan to read.'},
      {ic:"▨",html:LEG.dining?('<b>'+(LEG.meals[0]?LEG.meals[0].name:"The first meal")+' is your first service.</b> In a sleeper, book dinner with your car attendant once you board.')
                            :'<b>Café car only</b> on a run this length. Bring your own food if you want more than snacks.'},
      {ic:"◉",html:LEG.sights.length?('<b>'+LEG.sights.length+' scenery highlight'+(LEG.sights.length>1?"s":"")+'</b> on this leg, starting with '+LEG.sights[0].n+'. The Sightseer Lounge sees both sides.')
                                   :'<b>Grab a window seat.</b> The Sightseer Lounge, where the train has one, sees both sides.'}]);
    return;
  }
  if(t>=LEG.TOTAL){
    const last=LEG.stops[LEG.stops.length-1];
    agNowEl.innerHTML='<div class="ag-hero"><span class="chip" style="background:'+pal[covAt(LEG.TOTAL)]+';color:#0c1116">'+STAT[covAt(LEG.TOTAL)]+'</span><p class="ag-where">Arrived: '+last.name+'</p></div>'+
      '<p class="ag-stamp">'+fmtDur(LEG.TOTAL)+' · '+Math.round(legKm())+' mi</p>';
    agNextEl.innerHTML='<li class="ag-item"><span class="ag-dot" style="background:'+pal[covAt(LEG.TOTAL)]+'"></span><span class="ag-when">—</span><span class="ag-what"><b>End of the line</b><span>nothing further on this leg</span></span></li>';
    tipList([{ic:"✓",html:'<b>Back on the network.</b> Anything you queued through the dead stretches should be going out now.'}]);
    return;
  }
  const i=stopIndexAt(t), st=covAt(t), run=covRun(t), c=clockAt(t),
        atStation=(t-LEG.stops[i].t)<0.12;
  agNowEl.innerHTML=
    '<div class="ag-hero"><span class="chip" style="background:'+pal[st]+';color:'+((theme==="light"&&st==="spotty")?"#fff":"#0c1116")+'">'+STAT[st]+'</span>'+
    '<p class="ag-where">'+(atStation?("At "+shortName(LEG.stops[i].name)):(stopName(i)+" → "+stopName(i+1)))+'</p></div>'+
    '<p class="ag-stamp">'+c.full+' · '+fmtDur(t)+' in · '+fmtDur(LEG.TOTAL-t)+' to '+stopName(LEG.stops.length-1)+'</p>'+
    '<div class="ag-rows" id="agRows"></div>';
  const rows=[], nx=run.t1<LEG.TOTAL-1e-6?covAt(run.t1+1e-6):null;
  rows.push(["Signal",st==="dead"
    ?'No service · <em>about '+fmtDur(run.t1-t)+' left'+(nx?', '+STAT[nx].toLowerCase()+' again ~'+clockAt(run.t1).time+' near '+stopName(stopIndexAt(run.t1)+1):'')+'</em>'
    :STAT[st]+' on '+CARRIER_NAME[carrier]+' · <em>holds about '+fmtDur(run.t1-t)+(nx?', then '+STAT[nx].toLowerCase()+' from ~'+clockAt(run.t1).time:'')+'</em>']);
  const dk=nightAt(t),nd=nextDark(t);
  rows.push(["Outside",dk?('Dark · <em>daylight ~'+clockAt(dk.b).time+'</em>')
    :('Daylight'+(nd?' · <em>dark from ~'+clockAt(nd).time+'</em>':''))]);
  const mn=mealAt(t),nm=nextMeal(t);
  rows.push(["Dining",!LEG.dining?'Café car only on this run'
    :(mn?(mn.name+' being served · <em>last call ~'+clockAt(Math.max(mn.a,mn.b-0.25)).time+'</em>')
       :(nm?(nm.name+' opens ~'+clockAt(nm.a).time+' · <em>in '+fmtDur(nm.a-t)+'</em>'):'Closed for the rest of this leg'))]);
  const sn=sightNow(t),ns=nextSight(t);
  rows.push(["Window",sn?('<b>'+sn.n+'</b> · <em>'+lookText(sn)+'</em>')
    :(ns?(ns.n+' ~'+clockAt(ns.t).time+' · <em>in '+fmtDur(ns.t-t)+'</em>'):'No marked highlights left on this leg')]);
  const host=$("agRows");
  rows.forEach(r=>{const d=document.createElement("div");d.className="ag-row";
    d.innerHTML='<span class="k">'+r[0]+'</span><span class="v">'+r[1]+'</span>';host.appendChild(d);});
  const up=agEvents().filter(e=>e.t>t+0.02).slice(0,5);
  if(up.length) paint(up);
  else agNextEl.innerHTML='<li class="ag-item"><span class="ag-dot" style="background:'+pal[st]+'"></span><span class="ag-when">—</span><span class="ag-what"><b>'+stopName(LEG.stops.length-1)+'</b><span>nothing scheduled before arrival</span></span></li>';
  tipList(agTipList(t));
}
function legKm(){return LEG.km*0.621371;}
