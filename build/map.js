/* ================= projection: refit to whatever leg is showing ================= */
const VW=1000,VH=430,PAD=26;
let PJ={sc:1,ox:0,oy:0,cos:1,lng0:0,lat0:0}, SPAN=30;
function fitProjection(){
  let mnLat=90,mxLat=-90,mnLng=180,mxLng=-180;
  LEG.poly.forEach(p=>{mnLat=Math.min(mnLat,p[0]);mxLat=Math.max(mxLat,p[0]);
                       mnLng=Math.min(mnLng,p[1]);mxLng=Math.max(mxLng,p[1]);});
  /* Padding floors used to be sized for a transcontinental leg, which left a
     twenty-mile hop as a speck in an empty frame. */
  SPAN=Math.max(mxLng-mnLng,(mxLat-mnLat)*1.6);
  const padLat=Math.max(0.16,(mxLat-mnLat)*0.18), padLng=Math.max(0.22,(mxLng-mnLng)*0.10);
  mnLat-=padLat;mxLat+=padLat;mnLng-=padLng;mxLng+=padLng;
  const cos=Math.cos((mnLat+mxLat)/2*Math.PI/180);
  const gW=(mxLng-mnLng)*cos, gH=(mxLat-mnLat);
  const sc=Math.min((VW-2*PAD)/gW,(VH-2*PAD)/gH);
  PJ={sc:sc,ox:(VW-gW*sc)/2,oy:(VH-gH*sc)/2,cos:cos,lng0:mnLng,lat0:mxLat};
}
const px=lng=>PJ.ox+(lng-PJ.lng0)*PJ.cos*PJ.sc;
const py=lat=>PJ.oy+(PJ.lat0-lat)*PJ.sc;

const svg=$("map"), vp=$("vp");
let labels=[],dots=[],vis=[],groups=[];
const regLabel=(n,t,mz)=>labels.push({node:n,target:t,mz:mz||1});
const regDot=(n,t)=>dots.push({node:n,target:t});
const regGroup=(n,x,y,t,mz)=>{n.__x=x;n.__y=y;groups.push({node:n,target:t,mz:mz||1});};
let segEls=[],stationRefs=[],trainG=null,trHalo,trCore,trGlyph;

let lastLegKey=null;
function drawMap(){
  /* A new leg needs the view refitted: zooming into the Sierra and then asking
     for Miami to New York otherwise left the route mostly off-screen. Redraws
     for the same leg, such as changing carrier or theme, keep the view. */
  const key=(ITS.indexOf(IT))+":"+O+":"+E;
  if(key!==lastLegKey){ lastLegKey=key; scale=1; tx=0; ty=0; }
  while(vp.firstChild) vp.removeChild(vp.firstChild);
  labels=[];dots=[];vis=[];groups=[];segEls=[];stationRefs=[];
  fitProjection();
  const inView=(lat,lng)=>{const x=px(lng),y=py(lat);return x>-160&&x<VW+160&&y>-160&&y<VH+160;};
  /* a short leg has room for more town names before it looks crowded */
  const LOD=SPAN<1.5?0.34:(SPAN<4?0.5:(SPAN<12?0.75:1));
  /* states */
  const g=el("g",{}); vp.appendChild(g);
  DATA.states.forEach(s=>s.r.forEach(ring=>{
    let d="",any=false;
    for(let i=0;i<ring.length;i++){
      const x=px(ring[i][0]===undefined?0:ring[i][0]), y=py(ring[i][1]);
      const X=px(ring[i][0]), Y=py(ring[i][1]);
      if(X>-400&&X<VW+400&&Y>-400&&Y<VH+400) any=true;
      d+=(i?"L":"M")+X.toFixed(1)+" "+Y.toFixed(1);
    }
    if(any) g.appendChild(el("path",{d:d+"Z",class:"state"}));
  }));
  DATA.labels.forEach(L=>{
    if(!inView(L.lat,L.lng))return;
    const t=el("text",{x:px(L.lng),y:py(L.lat),class:"state-lbl","text-anchor":"middle"});
    t.textContent=L.n.toUpperCase(); vp.appendChild(t); regLabel(t,11,1.15);
  });
  /* nearby cities for orientation */
  const legStops=new Set(LEG.stops.map(s=>s.name.split(" ")[0]));
  const stationPts=LEG.stops.map(s=>[px(s.lng),py(s.lat)]);
  DATA.cities.forEach((c,i)=>{
    if(!inView(c[0],c[1]))return;
    if(legStops.has(c[3].split(" ")[0]))return;
    const x=px(c[1]),y=py(c[0]);
    /* a town label sitting on a station label is noise, not context */
    if(stationPts.some(p=>Math.abs(p[0]-x)<26&&Math.abs(p[1]-y)<14))return;
    const dot=el("circle",{cx:x,cy:y,class:"town-dot"});vp.appendChild(dot);regDot(dot,1.6);
    const lb=el("text",{x:x+3,y:y+3.5,class:"town-lbl"});lb.textContent=c[3];
    vp.appendChild(lb);regLabel(lb,8.5,(i<12?1.2:(i<45?2.0:3.0))*LOD);
  });
  /* route, one path per coverage sub-segment */
  covRuns().forEach(seg=>{
    const pts=[];
    for(let i=0;i<LEG.poly.length;i++){
      const t=LEG.polyT[i];
      if(t>=seg.t0-1e-9&&t<=seg.t1+1e-9) pts.push(LEG.poly[i]);
    }
    const a=posAt(seg.t0),b=posAt(seg.t1);
    const all=[[a.lat,a.lng]].concat(pts,[[b.lat,b.lng]]);
    let d="";
    all.forEach((p,i)=>{d+=(i?"L":"M")+px(p[1]).toFixed(1)+" "+py(p[0]).toFixed(1);});
    const path=el("path",{d:d,class:"route-seg",fill:"none"});
    vp.appendChild(path); segEls.push({node:path,st:seg.st});
  });
  /* scenery markers */
  const EYE="M-6 0 C-3 -4 3 -4 6 0 C3 4 -3 4 -6 0 Z";
  LEG.sights.forEach(s=>{
    const x=px(s.lng),y=py(s.lat);
    const gg=el("g",{class:"eye"});
    gg.appendChild(el("path",{d:EYE,class:"eye-bg"}));
    gg.appendChild(el("path",{d:EYE,class:"eye-out"}));
    gg.appendChild(el("circle",{r:1.9,class:"eye-pupil"}));
    gg.setAttribute("transform","translate("+x+" "+y+")");
    gg.style.cursor="pointer";
    gg.appendChild(el("title",{})).textContent=s.n+" · "+lookText(s);
    gg.addEventListener("click",ev=>{ev.stopPropagation();
      if(typeof seekTo==="function") seekTo(s.t);});
    vp.appendChild(gg); regGroup(gg,x,y,1.05,1);
    const lb=el("text",{x:x,y:y-9.5,class:"scenic-lbl","text-anchor":"middle"});
    /* map labels get the feature, not the sentence: the pin already says where */
    lb.textContent=s.n.replace(/ &.*/,"").replace(/ at .*/,"").replace(/ descent.*/,"")
      .replace(/ to .*/,"").replace(/ (coast|bluffs|trestle|shoreline)$/,"")
      .replace(/ High Bridge$/," Bridge");
    vp.appendChild(lb); regLabel(lb,9,2.4);
  });
  /* stations */
  const N=LEG.stops.length;
  /* Which intermediate names to show at rest. Dwell is a good proxy for how big
     a place is (Denver 32 minutes, Salt Lake City 25), so prefer long stops, but
     keep them spread out so one busy region does not take every label. */
  const named=new Set([0,N-1]);
  (function(){
    const want=Math.min(6,Math.max(0,N-2));
    if(!want) return;
    const gap=Math.max(1,Math.floor((N-2)/(want+1)));
    const order=[];
    for(let i=1;i<N-1;i++) order.push({i:i,dwell:(IT.s[O+i]&&IT.s[O+i][2])||0});
    order.sort((a,b)=>b.dwell-a.dwell||a.i-b.i);
    for(const o of order){
      if(named.size>=want+2) break;
      let ok=true;
      named.forEach(j=>{ if(Math.abs(j-o.i)<gap) ok=false; });
      if(ok) named.add(o.i);
    }
    /* if dwells were all alike, top up evenly so the map is not bare */
    for(let i=1;i<N-1&&named.size<want+2;i+=gap){
      let ok=true; named.forEach(j=>{ if(j!==i&&Math.abs(j-i)<gap) ok=false; });
      if(ok) named.add(i);
    }
  })();
  LEG.stops.forEach((s,i)=>{
    const x=px(s.lng),y=py(s.lat), major=(i===0||i===N-1);
    const dot=el("circle",{cx:x,cy:y,class:"st-dot"+(major?" major":"")});
    vp.appendChild(dot); regDot(dot,major?3.4:2.2);
    /* a wide invisible target so a 2px dot is still clickable, and so asking
       "what is the signal like at Denver?" is one click */
    const hit=el("circle",{cx:x,cy:y,r:9,class:"st-hit"});
    hit.appendChild(el("title",{})).textContent=s.name;
    hit.addEventListener("click",ev=>{ev.stopPropagation();
      if(typeof seekTo==="function") seekTo(s.t);});
    vp.appendChild(hit); regDot(hit,9);
    const above=(i%2===0);
    const gg=el("g",{});
    const lb=el("text",{x:x,y:y+(above?-9:15),class:"st-lbl"+(major?" major":""),"text-anchor":"middle"});
    lb.textContent=s.name.replace(/ Amtrak.*/,"").replace(/ Station$/,"").replace(/ Union.*/,"");
    gg.appendChild(lb);
    const tm=el("text",{x:x,y:y+(above?-19:25),class:"st-time","text-anchor":"middle"});
    gg.appendChild(tm); vp.appendChild(gg);
    const mz=(major?1:(named.has(i)?1:(N>22?2.6:1.9)))*(SPAN<4?0.6:1);
    regLabel(lb,major?11:9.5,mz); regLabel(tm,major?9.5:8.5,mz);
    stationRefs.push({node:tm,i:i});
  });
  /* Describe the picture for anyone who cannot see it. The static label said
     the same thing for every route. */
  (function(){
    const a=LEG.stops[0].short, b=LEG.stops[N-1].short;
    const tot={good:0,spotty:0,dead:0};
    LEG.cov.forEach(c=>{tot[c.st]+=c.t1-c.t0;});
    const bits=[];
    if(tot.dead>0.05) bits.push(fmtDur(tot.dead)+" with no service");
    if(tot.spotty>0.05) bits.push(fmtDur(tot.spotty)+" spotty");
    svg.setAttribute("aria-label",
      "Route map, "+a+" to "+b+", "+N+" stops over "+Math.round(LEG.km*0.621371).toLocaleString()+" miles"+
      (bits.length?", colored for "+CARRIER_NAME[carrier]+": "+bits.join(" and ")
                  :", usable on "+CARRIER_NAME[carrier]+" throughout")+".");
  })();
  /* train marker */
  trainG=el("g",{}); vp.appendChild(trainG);
  trHalo=el("circle",{r:4.6,class:"train-halo"}); trainG.appendChild(trHalo);
  trCore=el("circle",{r:3.1,class:"train-core"}); trainG.appendChild(trCore);
  regDot(trHalo,4.6); regDot(trCore,3.1);
  trGlyph=el("text",{"text-anchor":"middle"}); trGlyph.textContent="🚆";
  trainG.appendChild(trGlyph); regLabel(trGlyph,13,1);
  applyView(); paintRoute();
}
function paintRoute(){
  const pal=covColors();
  segEls.forEach(o=>o.node.setAttribute("stroke",pal[o.st]));
}
/* ---------- zoom / pan ---------- */
let scale=1,tx=0,ty=0;
function updateScale(){
  const k=1/scale;
  labels.forEach(o=>{o.node.setAttribute("font-size",(o.target*k).toFixed(2));
    o.node.style.display=scale>=o.mz?"":"none";});
  dots.forEach(o=>o.node.setAttribute("r",(o.target*k).toFixed(2)));
  vis.forEach(o=>o.node.style.display=scale>=o.mz?"":"none");
  groups.forEach(o=>{o.node.setAttribute("transform","translate("+o.node.__x+" "+o.node.__y+") scale("+(o.target*k).toFixed(3)+")");
    o.node.style.display=scale>=o.mz?"":"none";});
  segEls.forEach(o=>o.node.setAttribute("stroke-width",(3.1*k).toFixed(2)));
}
function applyView(){vp.setAttribute("transform","translate("+tx+" "+ty+") scale("+scale+")");updateScale();}
function sp(cx,cy){const p=svg.createSVGPoint();p.x=cx;p.y=cy;return p.matrixTransform(svg.getScreenCTM().inverse());}
function zoomAt(L,factor){
  const ns=Math.max(1,Math.min(9,scale*factor));
  tx=L.x-(L.x-tx)*(ns/scale); ty=L.y-(L.y-ty)*(ns/scale); scale=ns; applyView();
}
(function(){
  let drag=null; const pts=new Map(); let pinch=null;
  svg.addEventListener("pointerdown",e=>{svg.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);
    if(pts.size===1){drag=[e.clientX-tx,e.clientY-ty];svg.classList.add("dragging");}
    else if(pts.size===2){const v=[...pts.values()];pinch={d:Math.hypot(v[0][0]-v[1][0],v[0][1]-v[1][1]),s:scale};}});
  svg.addEventListener("pointermove",e=>{
    if(!pts.has(e.pointerId))return; pts.set(e.pointerId,[e.clientX,e.clientY]);
    if(pts.size===2&&pinch){const v=[...pts.values()];const d=Math.hypot(v[0][0]-v[1][0],v[0][1]-v[1][1]);
      const mid=sp((v[0][0]+v[1][0])/2,(v[0][1]+v[1][1])/2);
      const ns=Math.max(1,Math.min(9,pinch.s*d/pinch.d));
      tx=mid.x-(mid.x-tx)*(ns/scale);ty=mid.y-(mid.y-ty)*(ns/scale);scale=ns;applyView();return;}
    if(drag){tx=e.clientX-drag[0];ty=e.clientY-drag[1];applyView();}});
  const end=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(pts.size===0){drag=null;svg.classList.remove("dragging");}};
  svg.addEventListener("pointerup",end);svg.addEventListener("pointercancel",end);
  svg.addEventListener("wheel",e=>{e.preventDefault();zoomAt(sp(e.clientX,e.clientY),e.deltaY<0?1.16:1/1.16);},{passive:false});
  document.querySelectorAll(".zoomctl button").forEach(b=>b.addEventListener("click",()=>{
    const z=b.dataset.z;
    if(z==="reset"){scale=1;tx=0;ty=0;applyView();}
    else zoomAt({x:VW/2,y:VH/2},z==="in"?1.5:1/1.5);}));
})();
