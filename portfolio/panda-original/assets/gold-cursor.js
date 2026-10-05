/* A broad molten-gold ribbon flows from the cursor body, then tapers away. */
(() => {
  const cursor = document.querySelector('.cursor'), svg = document.querySelector('#gold-trail');
  if (!cursor || !svg) return;
  const ns = 'http://www.w3.org/2000/svg';
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const lifetime = 380, maximumLength = 150, history = [];
  // Match the real 15 × 21px arrow. Its full silhouette, not its pointed tip,
  // determines the two sides of the ribbon at the attachment.
  const outline = [[0,0],[0,21],[3.75,15.96],[6.3,21],[8.25,19.53],[5.55,14.49],[11.55,14.49]];
  const body = { x: 4.8, y: 11 };
  let frame = 0, lastMove = -Infinity;
  const make = (tag, attrs = {}, parent = svg) => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    parent.append(node); return node;
  };
  cursor.style.transformOrigin = '0 0';
  cursor.style.transform = 'scale(var(--panda-cursor-scale, 1))';
  const defs = make('defs');
  const gradient = make('linearGradient', { id: 'panda-ribbon-gold', gradientUnits: 'userSpaceOnUse' }, defs);
  [['0%','#eac15f',.9],['19%','#f5d68a',.76],['48%','#bd8731',.52],['76%','#d5a044',.22],['100%','#b27b28',0]].forEach(([offset,color,opacity]) => make('stop', {offset,'stop-color':color,'stop-opacity':opacity},gradient));
  const lightGradient = make('linearGradient', {id:'panda-ribbon-light',gradientUnits:'userSpaceOnUse'},defs);
  [['0%','#fff4c9',.66],['28%','#fbe8aa',.42],['65%','#eac16c',.12],['100%','#d8aa52',0]].forEach(([offset,color,opacity]) => make('stop',{offset,'stop-color':color,'stop-opacity':opacity},lightGradient));
  const ribbon = make('path', {class:'gold-body-ribbon',fill:'url(#panda-ribbon-gold)'});
  const sheen = make('path', {class:'gold-body-sheen',stroke:'url(#panda-ribbon-light)','stroke-width':'1.35'});
  const unavailable = () => document.hidden || document.documentElement.dataset.portfolioActive === 'false';
  function clearRibbon(){
    cancelAnimationFrame(frame); frame=0;history.length=0;lastMove=-Infinity;
    svg.style.opacity='0';ribbon.setAttribute('d','');sheen.setAttribute('d','');
  }
  const leave=()=>{clearRibbon();cursor.classList.remove('is-visible','on');};
  const resize=()=>{
    // 100% excludes the scrollbar, but clientX and the SVG viewBox do not.
    // Use the same pixel viewport to prevent a visible gap near the right edge.
    svg.style.width=`${innerWidth}px`;svg.style.height=`${innerHeight}px`;
    svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);clearRibbon();
  };
  const format=p=>`${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  function curve(points, first='M'){
    let path=`${first} ${format(points[0])}`;
    for(let i=1;i<points.length-1;i++)path+=` Q ${format(points[i])} ${format(midpoint(points[i],points[i+1]))}`;
    return path+` L ${format(points[points.length-1])}`;
  }
  function sample(){
    const source=[...history].reverse(),distances=[0];
    for(let i=1;i<source.length;i++)distances.push(distances[i-1]+Math.hypot(source[i].x-source[i-1].x,source[i].y-source[i-1].y));
    const length=Math.min(maximumLength,distances.at(-1));
    if(length<1)return [];
    const steps=Math.max(3,Math.min(30,Math.ceil(length/5))),result=[];
    let segment=1;
    for(let i=0;i<=steps;i++){
      const distance=length*i/steps;
      while(segment<source.length-1&&distances[segment]<distance)segment++;
      const a=source[segment-1],b=source[segment],ratio=(distance-distances[segment-1])/(distances[segment]-distances[segment-1]||1);
      result.push({x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio});
    }
    return result;
  }
  function paint(now){
    frame=0;
    if(!finePointer.matches||reducedMotion.matches||unavailable()||document.body.classList.contains('lens-mode')){clearRibbon();return;}
    while(history.length&&now-history[0].t>=lifetime)history.shift();
    if(history.length<2){clearRibbon();return;}
    const points=sample();
    if(points.length<2){clearRibbon();return;}
    const scale=cursor.classList.contains('on')?1.06:1;
    const left=[],right=[],highlight=[];
    points.forEach((point,index)=>{
      const before=points[Math.max(0,index-1)],after=points[Math.min(points.length-1,index+1)];
      const dx=before.x-after.x,dy=before.y-after.y,length=Math.hypot(dx,dy)||1;
      const normal={x:-dy/length,y:dx/length};
      const projections=outline.map(([x,y])=>(x-body.x)*normal.x+(y-body.y)*normal.y);
      const progress=index/(points.length-1);
      // Preserve the first few millimetres at full width, then draw out the gold.
      const taper=Math.pow(1-Math.max(0,(progress-.075)/.925),1.55);
      let bend=1;
      if(index>0&&index<points.length-1){
        const ax=point.x-before.x,ay=point.y-before.y,bx=after.x-point.x,by=after.y-point.y;
        const a=Math.hypot(ax,ay),b=Math.hypot(bx,by);
        const cosine=(ax*bx+ay*by)/(a*b||1),sine=Math.sqrt(Math.max(0,(1-cosine)/2));
        if(sine>.02){const radius=Math.min(a,b)/(2*sine);bend=Math.min(1,Math.max(.12,radius*.65/(11*scale*taper||1)));}
      }
      const lo=Math.min(...projections)*scale*taper*bend,hi=Math.max(...projections)*scale*taper*bend;
      const center={x:point.x+body.x*scale,y:point.y+body.y*scale};
      left.push({x:center.x+normal.x*hi,y:center.y+normal.y*hi});
      right.push({x:center.x+normal.x*lo,y:center.y+normal.y*lo});
      highlight.push({x:center.x+normal.x*hi*.32,y:center.y+normal.y*hi*.32});
    });
    // A flat hidden root, not a round stroke cap, lets the ribbon merge into
    // the whole arrow. The cursor is painted above it to keep its edge crisp.
    ribbon.setAttribute('d',curve(left)+curve([...right].reverse(),'L')+' Z');
    sheen.setAttribute('d',curve(highlight));
    const head=points[0];let tail=points.at(-1);
    // A loop can end at its origin; keep a real gradient axis in that case.
    if(Math.hypot(head.x-tail.x,head.y-tail.y)<8)tail=points.reduce((far,p)=>Math.hypot(p.x-head.x,p.y-head.y)>Math.hypot(far.x-head.x,far.y-head.y)?p:far,tail);
    for(const g of [gradient,lightGradient]){
      g.setAttribute('x1',head.x+body.x*scale);g.setAttribute('y1',head.y+body.y*scale);
      g.setAttribute('x2',tail.x+body.x*scale);g.setAttribute('y2',tail.y+body.y*scale);
    }
    svg.style.opacity=String(Math.pow(Math.max(0,1-(now-lastMove)/lifetime),1.1));
    frame=requestAnimationFrame(paint);
  }
  document.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'||!finePointer.matches||unavailable()){leave();return;}
    cursor.style.translate=`${event.clientX}px ${event.clientY}px`;
    cursor.classList.add('is-visible');
    if(reducedMotion.matches||document.body.classList.contains('lens-mode')){clearRibbon();return;}
    const now=performance.now(),last=history.at(-1),distance=last?Math.hypot(event.clientX-last.x,event.clientY-last.y):0;
    if(last&&(now-last.t>lifetime||distance>180))history.length=0;
    if(last&&distance<.35)return;
    if(history.length>1){
      const before=history.at(-2),ax=last.x-before.x,ay=last.y-before.y,bx=event.clientX-last.x,by=event.clientY-last.y;
      // Start a fresh fold on an abrupt reversal instead of tying the band in a knot.
      if((ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by)||1)<-.3)history.splice(0,history.length-1);
    }
    history.push({x:event.clientX,y:event.clientY,t:now});
    if(history.length>96)history.splice(0,history.length-96);
    lastMove=now;
    // Keep the full-width attachment in the same frame as the cursor body.
    if(history.length>1){cancelAnimationFrame(frame);frame=0;paint(now);}
  },{passive:true});
  document.documentElement.addEventListener('pointerleave',leave);
  window.addEventListener('blur',leave);
  window.addEventListener('portfolio:world-suspend',leave);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});
  window.addEventListener('resize',resize,{passive:true});
  finePointer.addEventListener('change',leave);reducedMotion.addEventListener('change',clearRibbon);
  new MutationObserver(()=>{if(document.body.classList.contains('lens-mode'))clearRibbon();}).observe(document.body,{attributes:true,attributeFilter:['class']});
  new MutationObserver(()=>{if(unavailable())leave();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-portfolio-active']});
  resize();
})();
